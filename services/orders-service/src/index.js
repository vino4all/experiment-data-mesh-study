const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const logger = require('./logger');
const metrics = require('./metrics');

const app = express();
app.use(express.json());

const STALE_THRESHOLD_MS = Number.parseInt(process.env.STALE_THRESHOLD_MS || '30000', 10);

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function computeFreshnessLagMs(record, fallbackTimestamp) {
  if (!record) return null;

  const explicitLag = Number.parseInt(record.freshness_lag_ms, 10);
  if (Number.isFinite(explicitLag)) return explicitLag;

  const visibleTime = toDate(record.visible_timestamp) || toDate(record.projected_at) || toDate(record.batch_imported_at);
  const sourceUpdateTime = toDate(record.source_update_timestamp) || toDate(fallbackTimestamp);
  if (!visibleTime || !sourceUpdateTime) return null;

  return Math.max(0, visibleTime.getTime() - sourceUpdateTime.getTime());
}

function isStale(lagMs) {
  return typeof lagMs === 'number' && lagMs > STALE_THRESHOLD_MS;
}

async function ensureExperimentSchema() {
  await pool.query('ALTER TABLE orders_client_projection ADD COLUMN IF NOT EXISTS source_update_timestamp TIMESTAMP');
  await pool.query('ALTER TABLE orders_client_projection ADD COLUMN IF NOT EXISTS visible_timestamp TIMESTAMP NOT NULL DEFAULT NOW()');
  await pool.query('ALTER TABLE orders_client_projection ADD COLUMN IF NOT EXISTS freshness_lag_ms BIGINT');

  await pool.query('ALTER TABLE orders_batch_client_ods ADD COLUMN IF NOT EXISTS source_update_timestamp TIMESTAMP');
  await pool.query('ALTER TABLE orders_batch_client_ods ADD COLUMN IF NOT EXISTS visible_timestamp TIMESTAMP NOT NULL DEFAULT NOW()');
  await pool.query('ALTER TABLE orders_batch_client_ods ADD COLUMN IF NOT EXISTS freshness_lag_ms BIGINT');
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
  res.json({ status: 'healthy', service: 'orders-service', timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

app.get('/orders-sample', async (req, res) => {
  try {
    const result = await pool.query('SELECT order_id, client_id FROM orders ORDER BY created_at DESC LIMIT 1000');
    res.json({ count: result.rows.length, orders: result.rows });
  } catch (err) {
    logger.error({ err }, 'Error fetching order sample');
    res.status(500).json({ error: 'Failed to fetch order sample' });
  }
});

// Pattern A: Direct API Consumption
app.get('/orders/:orderId/api-pattern', async (req, res) => {
  const { orderId } = req.params;
  const start = Date.now();

  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    const clientServiceUrl = process.env.CLIENT_SERVICE_URL || 'http://localhost:3001';

    try {
      const clientResponse = await axios.get(`${clientServiceUrl}/clients/${order.client_id}`, {
        timeout: 5000,
      });

      const latency = Date.now() - start;
      metrics.apiCallDuration.labels('api', 'success').observe(latency);

      res.json({
        pattern: 'api',
        order,
        client: clientResponse.data,
        latency_ms: latency,
        freshness_lag_ms: 0,
        stale_read: false,
        source_update_timestamp: clientResponse.data.updated_at || null,
        visible_timestamp: new Date().toISOString(),
      });
    } catch (clientErr) {
      const latency = Date.now() - start;
      metrics.apiCallDuration.labels('api', 'failure').observe(latency);
      logger.error({ err: clientErr, clientId: order.client_id }, 'Client API call failed');
      res.status(503).json({ error: 'Client service unavailable' });
    }
  } catch (err) {
    logger.error({ err }, 'Error fetching order');
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Pattern B: Event-Driven Projection
app.get('/orders/:orderId/projection-pattern', async (req, res) => {
  const { orderId } = req.params;
  const start = Date.now();

  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Get from projection
    const projectionResult = await pool.query(
      'SELECT * FROM orders_client_projection WHERE client_id = $1',
      [order.client_id]
    );

    const latency = Date.now() - start;
    metrics.apiCallDuration.labels('projection', 'success').observe(latency);

    if (projectionResult.rows.length === 0) {
      return res.json({
        pattern: 'projection',
        order,
        client: null,
        latency_ms: latency,
        freshness: 'not-yet-projected',
      });
    }

    const projection = projectionResult.rows[0];
    const freshnessLagMs = computeFreshnessLagMs(projection, projection.updated_at);
    const staleRead = isStale(freshnessLagMs);
    if (typeof freshnessLagMs === 'number') {
      metrics.dataFreshness.labels('projection').set(freshnessLagMs);
      if (staleRead) {
        metrics.staleReadCount.labels('projection').inc();
      }
    }

    res.json({
      pattern: 'projection',
      order,
      client: projection,
      latency_ms: latency,
      freshness_lag_ms: freshnessLagMs,
      stale_read: staleRead,
      source_update_timestamp: projection.source_update_timestamp || null,
      visible_timestamp: projection.visible_timestamp || projection.projected_at,
      projection_version: projection.projection_version,
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching order with projection');
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Pattern C: Batch Data Product Replication
app.get('/orders/:orderId/batch-pattern', async (req, res) => {
  const { orderId } = req.params;
  const start = Date.now();

  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Get from batch ODS
    const odsResult = await pool.query(
      'SELECT * FROM orders_batch_client_ods WHERE client_id = $1',
      [order.client_id]
    );

    const latency = Date.now() - start;
    metrics.apiCallDuration.labels('batch', 'success').observe(latency);

    if (odsResult.rows.length === 0) {
      return res.json({
        pattern: 'batch',
        order,
        client: null,
        latency_ms: latency,
        freshness: 'not-yet-replicated',
      });
    }

    const ods = odsResult.rows[0];
    const freshnessLagMs = computeFreshnessLagMs(ods, ods.updated_at);
    const staleRead = isStale(freshnessLagMs);
    if (typeof freshnessLagMs === 'number') {
      metrics.dataFreshness.labels('batch').set(freshnessLagMs);
      if (staleRead) {
        metrics.staleReadCount.labels('batch').inc();
      }
    }

    res.json({
      pattern: 'batch',
      order,
      client: ods,
      latency_ms: latency,
      freshness_lag_ms: freshnessLagMs,
      stale_read: staleRead,
      source_update_timestamp: ods.source_update_timestamp || null,
      visible_timestamp: ods.visible_timestamp || ods.batch_imported_at,
      batch_version: ods.batch_version,
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching order with batch data');
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create order (all patterns)
app.post('/orders', async (req, res) => {
  const { client_id, order_total } = req.body;
  const orderId = req.body.order_id || uuidv4();

  try {
    const result = await pool.query(
      `INSERT INTO orders (order_id, client_id, order_status, order_total, shipping_status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       order_status = EXCLUDED.order_status,
       order_total = EXCLUDED.order_total,
       shipping_status = EXCLUDED.shipping_status,
       updated_at = NOW()
       RETURNING *`,
      [orderId, client_id, 'pending', order_total, 'not_shipped']
    );

    logger.info({ orderId }, 'Order created');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Error creating order');
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get all orders
app.get('/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100');
    res.json({ orders: result.rows, count: result.rows.length });
  } catch (err) {
    logger.error({ err }, 'Error fetching orders');
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Hybrid strategy routing
app.get('/orders/:orderId/hybrid-pattern', async (req, res) => {
  const { orderId } = req.params;
  const requestedClientCount = Number.parseInt(req.query.requestedClientCount || '1', 10);
  const workloadType = String(req.query.workloadType || 'operational').toLowerCase();

  let strategy = 'projection-pattern';
  if (requestedClientCount <= 5) {
    strategy = 'api-pattern';
  } else if (workloadType.includes('fulfillment') || workloadType.includes('batch')) {
    strategy = 'batch-pattern';
  } else {
    strategy = 'projection-pattern';
  }

  req.url = `/orders/${orderId}/${strategy}`;
  return app.handle(req, res);
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Orders Service started');
});

ensureExperimentSchema().catch((err) => {
  logger.error({ err }, 'Failed ensuring experiment schema in orders-service');
});

module.exports = app;
