const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const kafka = require('./kafka');
const logger = require('./logger');
const metrics = require('./metrics');

const app = express();
app.use(express.json());

const failureInjection = {
  latencyMs: Number.parseInt(process.env.API_INJECT_LATENCY_MS || '0', 10),
  timeoutRate: Number.parseFloat(process.env.API_INJECT_TIMEOUT_RATE || '0'),
  error500Rate: Number.parseFloat(process.env.API_INJECT_500_RATE || '0'),
  error503Rate: Number.parseFloat(process.env.API_INJECT_503_RATE || '0'),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldInject(rate) {
  return Number.isFinite(rate) && rate > 0 && Math.random() < rate;
}

// Prometheus metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    metrics.httpRequestDuration.labels(req.method, req.route?.path || req.url, res.statusCode).observe(duration);
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'client-service', timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

app.get('/control/failure-injection', (req, res) => {
  res.json({
    ...failureInjection,
    service: 'client-service',
  });
});

app.post('/control/failure-injection', (req, res) => {
  const body = req.body || {};

  if (typeof body.latencyMs === 'number' && body.latencyMs >= 0) {
    failureInjection.latencyMs = Math.floor(body.latencyMs);
  }

  if (typeof body.timeoutRate === 'number' && body.timeoutRate >= 0 && body.timeoutRate <= 1) {
    failureInjection.timeoutRate = body.timeoutRate;
  }

  if (typeof body.error500Rate === 'number' && body.error500Rate >= 0 && body.error500Rate <= 1) {
    failureInjection.error500Rate = body.error500Rate;
  }

  if (typeof body.error503Rate === 'number' && body.error503Rate >= 0 && body.error503Rate <= 1) {
    failureInjection.error503Rate = body.error503Rate;
  }

  res.json({
    message: 'failure injection updated',
    ...failureInjection,
  });
});

// Get all clients
app.get('/clients', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY updated_at DESC');
    res.json({ clients: result.rows, count: result.rows.length });
  } catch (err) {
    logger.error({ err }, 'Error fetching clients');
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Get client by ID
app.get('/clients/:clientId', async (req, res) => {
  try {
    if (failureInjection.latencyMs > 0) {
      await sleep(failureInjection.latencyMs);
    }

    if (shouldInject(failureInjection.timeoutRate)) {
      await sleep(6000);
    }

    if (shouldInject(failureInjection.error500Rate)) {
      return res.status(500).json({ error: 'Injected 500 failure' });
    }

    if (shouldInject(failureInjection.error503Rate)) {
      return res.status(503).json({ error: 'Injected 503 failure' });
    }

    const { clientId } = req.params;
    const result = await pool.query('SELECT * FROM clients WHERE client_id = $1', [clientId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Error fetching client');
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// Create client
app.post('/clients', async (req, res) => {
  const client = req.body;
  const clientId = client.client_id || uuidv4();
  
  try {
    const result = await pool.query(
      `INSERT INTO clients 
       (client_id, first_name, last_name, email, phone, address_line1, city, state, zip_code, loyalty_tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        clientId,
        client.first_name,
        client.last_name,
        client.email,
        client.phone,
        client.address_line1,
        client.city,
        client.state,
        client.zip_code,
        client.loyalty_tier || 'standard',
      ]
    );

    const createdClient = result.rows[0];

    // Emit event
    await emitClientEvent('client.created', createdClient, 1);

    logger.info({ clientId }, 'Client created');
    res.status(201).json(createdClient);
  } catch (err) {
    logger.error({ err }, 'Error creating client');
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// Update client
app.put('/clients/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const updates = req.body;

  try {
    const getResult = await pool.query('SELECT * FROM clients WHERE client_id = $1', [clientId]);
    if (getResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const currentClient = getResult.rows[0];
    const newVersion = currentClient.version + 1;

    const result = await pool.query(
      `UPDATE clients 
       SET first_name = $1, last_name = $2, email = $3, phone = $4, 
           address_line1 = $5, city = $6, state = $7, zip_code = $8, 
           loyalty_tier = $9, version = $10, updated_at = NOW()
       WHERE client_id = $11
       RETURNING *`,
      [
        updates.first_name || currentClient.first_name,
        updates.last_name || currentClient.last_name,
        updates.email || currentClient.email,
        updates.phone || currentClient.phone,
        updates.address_line1 || currentClient.address_line1,
        updates.city || currentClient.city,
        updates.state || currentClient.state,
        updates.zip_code || currentClient.zip_code,
        updates.loyalty_tier || currentClient.loyalty_tier,
        newVersion,
        clientId,
      ]
    );

    const updatedClient = result.rows[0];

    // Emit event
    await emitClientEvent('client.updated', updatedClient, newVersion);

    logger.info({ clientId }, 'Client updated');
    res.json(updatedClient);
  } catch (err) {
    logger.error({ err }, 'Error updating client');
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// Emit event to Kafka
async function emitClientEvent(eventType, client, version) {
  try {
    const producer = kafka.producer({ idempotent: true });
    await producer.connect();

    const message = {
      key: client.client_id,
      value: JSON.stringify({
        event_id: `${Date.now()}-${Math.random()}`,
        event_type: eventType,
        client_id: client.client_id,
        payload: client,
        version,
        source_update_timestamp: client.updated_at || new Date().toISOString(),
        timestamp: new Date().toISOString(),
      }),
    };

    await producer.send({
      topic: process.env.KAFKA_TOPIC || 'client-events',
      messages: [message],
    });

    metrics.kafkaMessageProcessed.labels(process.env.KAFKA_TOPIC || 'client-events', 'success').inc();
    logger.info({ eventType, clientId: client.client_id }, 'Event emitted');

    await producer.disconnect();
  } catch (err) {
    metrics.kafkaMessageProcessed.labels(process.env.KAFKA_TOPIC || 'client-events', 'failure').inc();
    logger.error({ err, eventType }, 'Failed to emit event');
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Client Service started');
});

module.exports = app;
