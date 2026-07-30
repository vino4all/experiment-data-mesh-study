const express = require('express');
const pool = require('./db');
const kafka = require('./kafka');
const logger = require('./logger');
const metrics = require('./metrics');

const app = express();
app.use(express.json());

const consumerControl = {
  paused: false,
  pauseMs: 0,
};

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'orders-projection-consumer', timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

app.get('/control/state', (req, res) => {
  res.json({
    service: 'orders-projection-consumer',
    ...consumerControl,
  });
});

app.post('/control/pause', (req, res) => {
  consumerControl.paused = true;
  consumerControl.pauseMs = Number.parseInt(req.body?.pauseMs || '0', 10) || 0;
  res.json({ message: 'projection consumer paused', ...consumerControl });
});

app.post('/control/resume', (req, res) => {
  consumerControl.paused = false;
  consumerControl.pauseMs = 0;
  res.json({ message: 'projection consumer resumed', ...consumerControl });
});

async function ensureExperimentSchema() {
  await pool.query('ALTER TABLE orders_client_projection ADD COLUMN IF NOT EXISTS source_update_timestamp TIMESTAMP');
  await pool.query('ALTER TABLE orders_client_projection ADD COLUMN IF NOT EXISTS visible_timestamp TIMESTAMP NOT NULL DEFAULT NOW()');
  await pool.query('ALTER TABLE orders_client_projection ADD COLUMN IF NOT EXISTS freshness_lag_ms BIGINT');

  await pool.query('ALTER TABLE projection_lag_metrics ADD COLUMN IF NOT EXISTS source_update_timestamp TIMESTAMP');
  await pool.query('ALTER TABLE projection_lag_metrics ADD COLUMN IF NOT EXISTS visible_timestamp TIMESTAMP');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS synchronization_visibility_events (
      event_id BIGSERIAL PRIMARY KEY,
      pattern VARCHAR(50) NOT NULL,
      client_id UUID NOT NULL,
      source_update_timestamp TIMESTAMP NOT NULL,
      visible_timestamp TIMESTAMP NOT NULL,
      freshness_lag_ms BIGINT NOT NULL,
      source_reference VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

// Initialize consumer
async function startConsumer() {
  await ensureExperimentSchema();

  const consumer = kafka.consumer({
    groupId: process.env.KAFKA_GROUP || 'orders-projection-group',
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

  await consumer.connect();
  logger.info('Consumer connected to Kafka');

  const topic = process.env.KAFKA_TOPIC || 'client-events';
  await consumer.subscribe({ topic, fromBeginning: false });

  // Load consumer state
  const consumerGroup = process.env.KAFKA_GROUP || 'orders-projection-group';
  await ensureConsumerState(consumerGroup);
  let consumerState = await getConsumerState(consumerGroup);
  logger.info({ consumerState }, 'Loaded consumer state');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const start = Date.now();
      try {
        if (consumerControl.paused) {
          if (consumerControl.pauseMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, consumerControl.pauseMs));
          }
          return;
        }

        const event = JSON.parse(message.value.toString());
        
        // Idempotency check - avoid processing same event twice
        const offset = Number.parseInt(message.offset, 10);
        if (consumerState && consumerState.last_offset >= offset) {
          logger.debug({ offset }, 'Skipping already-processed message');
          metrics.kafkaMessageProcessed.labels('skipped', event.event_type).inc();
          return;
        }

        logger.info({ offset, eventType: event.event_type, clientId: event.client_id }, 'Processing client event');

        // Update projection
        const { client_id, payload, version } = event;
        
        const sourceUpdateTime =
          toDate(payload.updated_at) ||
          toDate(event.source_update_timestamp) ||
          toDate(event.timestamp) ||
          new Date();
        const visibleTime = new Date();
        const freshnessLagMs = Math.max(0, visibleTime.getTime() - sourceUpdateTime.getTime());

        await pool.query(
          `INSERT INTO orders_client_projection 
           (client_id, first_name, last_name, email, phone, address_line1, city, state, zip_code, loyalty_tier, projection_version, projected_at, source_update_timestamp, visible_timestamp, freshness_lag_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, $13, $14)
           ON CONFLICT (client_id) DO UPDATE SET
           first_name = $2, last_name = $3, email = $4, phone = $5, address_line1 = $6,
           city = $7, state = $8, zip_code = $9, loyalty_tier = $10, projection_version = $11, projected_at = NOW(),
           source_update_timestamp = $12, visible_timestamp = $13, freshness_lag_ms = $14`,
          [
            client_id,
            payload.first_name,
            payload.last_name,
            payload.email,
            payload.phone,
            payload.address_line1,
            payload.city,
            payload.state,
            payload.zip_code,
            payload.loyalty_tier,
            version,
            sourceUpdateTime.toISOString(),
            visibleTime.toISOString(),
            freshnessLagMs,
          ]
        );

        await pool.query(
          `INSERT INTO projection_lag_metrics (client_id, lag_ms, source_update_timestamp, visible_timestamp)
           VALUES ($1, $2, $3, $4)`,
          [client_id, freshnessLagMs, sourceUpdateTime.toISOString(), visibleTime.toISOString()]
        );

        await pool.query(
          `INSERT INTO synchronization_visibility_events
           (pattern, client_id, source_update_timestamp, visible_timestamp, freshness_lag_ms, source_reference)
           VALUES ('projection', $1, $2, $3, $4, $5)`,
          [client_id, sourceUpdateTime.toISOString(), visibleTime.toISOString(), freshnessLagMs, `${topic}:${partition}:${offset}`]
        );

        // Update consumer state
        await pool.query(
          `INSERT INTO orders_projection_consumer_state (consumer_group, last_offset, last_processed_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (consumer_group) DO UPDATE SET last_offset = $2, last_processed_at = NOW()`,
          [consumerGroup, offset]
        );

        consumerState = {
          consumer_group: consumerGroup,
          last_offset: offset,
          last_processed_at: new Date().toISOString(),
        };

        const duration = Date.now() - start;
        metrics.projectionUpdateDuration.labels('success').observe(duration);
        metrics.kafkaMessageProcessed.labels('success', event.event_type).inc();

        // Record lag between event timestamp and now
        metrics.projectionLag.set(freshnessLagMs);

        logger.info({ clientId: client_id, version }, 'Projection updated');
      } catch (err) {
        logger.error({ err }, 'Error processing message');
        metrics.projectionUpdateDuration.labels('failure').observe(Date.now() - start);
        metrics.kafkaMessageProcessed.labels('failure', 'unknown').inc();
      }
    },
  });
}

async function getConsumerState() {
  try {
    const result = await pool.query(
      'SELECT * FROM orders_projection_consumer_state WHERE consumer_group = $1',
      [process.env.KAFKA_GROUP || 'orders-projection-group']
    );
    if (result.rows.length === 0) {
      return null;
    }

    return {
      ...result.rows[0],
      last_offset: Number.parseInt(result.rows[0].last_offset, 10),
    };
  } catch (err) {
    logger.error({ err }, 'Error fetching consumer state');
    return null;
  }
}

async function ensureConsumerState(consumerGroup) {
  await pool.query(
    `INSERT INTO orders_projection_consumer_state (consumer_group, last_offset, last_processed_at)
     VALUES ($1, -1, NOW())
     ON CONFLICT (consumer_group) DO NOTHING`,
    [consumerGroup]
  );
}

// Start HTTP server
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Projection Consumer HTTP server started');
});

// Start Kafka consumer
startConsumer().catch((err) => {
  logger.error({ err }, 'Fatal error starting consumer');
  process.exit(1);
});

module.exports = app;
