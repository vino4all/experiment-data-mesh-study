const express = require('express');
const { sourcePool, targetPool } = require('./db');
const logger = require('./logger');
const metrics = require('./metrics');

const app = express();
app.use(express.json());

const batchControl = {
  injectedDelayMs: 0,
};

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

async function ensureExperimentSchema() {
  await targetPool.query('ALTER TABLE orders_batch_client_ods ADD COLUMN IF NOT EXISTS source_update_timestamp TIMESTAMP');
  await targetPool.query('ALTER TABLE orders_batch_client_ods ADD COLUMN IF NOT EXISTS visible_timestamp TIMESTAMP NOT NULL DEFAULT NOW()');
  await targetPool.query('ALTER TABLE orders_batch_client_ods ADD COLUMN IF NOT EXISTS freshness_lag_ms BIGINT');

  await targetPool.query(`
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'batch-sync-worker', timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

app.get('/control/state', (req, res) => {
  res.json({ service: 'batch-sync-worker', ...batchControl });
});

app.post('/control/delay', (req, res) => {
  const delayMs = Number.parseInt(req.body?.delayMs || '0', 10);
  batchControl.injectedDelayMs = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 0;
  res.json({ message: 'batch delay updated', ...batchControl });
});

app.post('/control/run-once', async (req, res) => {
  try {
    const result = await runBatchSync();
    res.json({ message: 'batch sync executed', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function runBatchSync() {
  const start = Date.now();
  const syncId = Date.now();
  let syncStateId = null;
  
  try {
    await ensureExperimentSchema();

    logger.info({ syncId }, 'Starting batch sync');

    if (batchControl.injectedDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, batchControl.injectedDelayMs));
    }

    // Record sync start
    const syncStateResult = await targetPool.query(
      'INSERT INTO orders_batch_sync_state (source_database, sync_status, started_at) VALUES ($1, $2, NOW()) RETURNING sync_id',
      ['client_db', 'in_progress']
    );
    syncStateId = syncStateResult.rows[0].sync_id;

    // Extract from source (Client domain)
    const extractResult = await sourcePool.query('SELECT * FROM clients');
    const clients = extractResult.rows;
    logger.info({ syncId, rowCount: clients.length }, 'Extracted clients from source');

    // Transform and load into target (Orders domain ODS)
    let processedCount = 0;
    for (const client of clients) {
      try {
        const sourceUpdateTime = toDate(client.updated_at) || new Date();
        const visibleTime = new Date();
        const freshnessLagMs = Math.max(0, visibleTime.getTime() - sourceUpdateTime.getTime());

        await targetPool.query(
          `INSERT INTO orders_batch_client_ods 
           (client_id, first_name, last_name, email, phone, address_line1, city, state, zip_code, loyalty_tier, batch_version, batch_imported_at, source_update_timestamp, visible_timestamp, freshness_lag_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, NOW(), $11, $12, $13)
           ON CONFLICT (client_id) DO UPDATE SET
           first_name = $2, last_name = $3, email = $4, phone = $5, address_line1 = $6,
           city = $7, state = $8, zip_code = $9, loyalty_tier = $10, batch_version = 2, batch_imported_at = NOW(),
           source_update_timestamp = $11, visible_timestamp = $12, freshness_lag_ms = $13`,
          [
            client.client_id,
            client.first_name,
            client.last_name,
            client.email,
            client.phone,
            client.address_line1,
            client.city,
            client.state,
            client.zip_code,
            client.loyalty_tier,
            sourceUpdateTime.toISOString(),
            visibleTime.toISOString(),
            freshnessLagMs,
          ]
        );

        await targetPool.query(
          `INSERT INTO synchronization_visibility_events
           (pattern, client_id, source_update_timestamp, visible_timestamp, freshness_lag_ms, source_reference)
           VALUES ('batch', $1, $2, $3, $4, $5)`,
          [client.client_id, sourceUpdateTime.toISOString(), visibleTime.toISOString(), freshnessLagMs, `sync:${syncStateId}`]
        );

        processedCount++;
      } catch (err) {
        logger.error({ err, clientId: client.client_id }, 'Error loading client record');
        metrics.batchSyncErrors.inc();
      }
    }

    // Update sync status
    const duration = Date.now() - start;
    await targetPool.query(
      `UPDATE orders_batch_sync_state 
       SET sync_status = $1, rows_processed = $2, completed_at = NOW()
       WHERE sync_id = $3`,
      ['completed', processedCount, syncStateId]
    );

    metrics.batchSyncDuration.labels('success').observe(duration);
    metrics.batchSyncRowsProcessed.labels('success').inc(processedCount);
    metrics.batchSyncFrequency.set(Date.now() / 1000);

    logger.info({ syncId, duration, processedCount }, 'Batch sync completed successfully');
    return { syncId, duration, processedCount };
  } catch (err) {
    logger.error({ err, syncId }, 'Batch sync failed');
    
    const duration = Date.now() - start;
    metrics.batchSyncDuration.labels('failure').observe(duration);
    metrics.batchSyncErrors.inc();

    try {
      if (syncStateId) {
        await targetPool.query(
        `UPDATE orders_batch_sync_state 
         SET sync_status = $1, error_message = $2, completed_at = NOW()
         WHERE sync_id = $3`,
        ['failed', err.message, syncStateId]
      );
      }
    } catch (updateErr) {
      logger.error({ err: updateErr }, 'Failed to update sync status');
    }

    throw err;
  }
}

// Start periodic batch sync
function startBatchSyncScheduler() {
  const interval = parseInt(process.env.BATCH_SYNC_INTERVAL_MS || '30000', 10);
  
  logger.info({ intervalMs: interval }, 'Starting batch sync scheduler');

  // Run immediately on startup
  runBatchSync().catch((err) => logger.error({ err }, 'Error in initial batch sync'));

  // Schedule periodic runs
  setInterval(() => {
    runBatchSync().catch((err) => logger.error({ err }, 'Error in scheduled batch sync'));
  }, interval);
}

// Start HTTP server
const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Batch Sync Worker HTTP server started');
});

// Start batch sync scheduler
startBatchSyncScheduler();

module.exports = app;
