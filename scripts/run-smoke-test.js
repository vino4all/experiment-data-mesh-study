#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLIENT_SERVICE_URL = process.env.CLIENT_SERVICE_URL || 'http://127.0.0.1:3001';
const ORDERS_SERVICE_URL = process.env.ORDERS_SERVICE_URL || 'http://127.0.0.1:3002';
const PROJECTION_CONSUMER_URL = process.env.PROJECTION_CONSUMER_URL || 'http://127.0.0.1:3003';
const BATCH_SYNC_WORKER_URL = process.env.BATCH_SYNC_WORKER_URL || 'http://127.0.0.1:3004';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${url} failed with ${response.status}: ${text}`);
  }
  return body;
}

async function waitForHealth(name, url) {
  let lastError;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      await request(`${url}/health`);
      console.log(`[smoke] ${name} healthy`);
      return;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw lastError;
}

async function waitForProjection(orderId) {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = await request(`${ORDERS_SERVICE_URL}/orders/${orderId}/projection-pattern`);
    if (result.client && result.client.city === 'Smoke City Updated') {
      return result;
    }
    await sleep(1000);
  }
  throw new Error('Projection did not converge for smoke update');
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, '.env'))) {
    throw new Error('Missing .env. Copy .env.example to .env and set local passwords before running the smoke test.');
  }

  await Promise.all([
    waitForHealth('client-service', CLIENT_SERVICE_URL),
    waitForHealth('orders-service', ORDERS_SERVICE_URL),
    waitForHealth('orders-projection-consumer', PROJECTION_CONSUMER_URL),
    waitForHealth('batch-sync-worker', BATCH_SYNC_WORKER_URL),
  ]);

  execFileSync(process.execPath, [path.join(__dirname, 'seed-data.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  const orders = await request(`${ORDERS_SERVICE_URL}/orders`);
  const order = orders.orders && orders.orders[0];
  if (!order) throw new Error('Smoke seed did not create any orders');

  const apiRead = await request(`${ORDERS_SERVICE_URL}/orders/${order.order_id}/api-pattern`);
  if (!apiRead.client) throw new Error('Direct API smoke read returned no client');

  await request(`${CLIENT_SERVICE_URL}/clients/${order.client_id}`, {
    method: 'PUT',
    body: JSON.stringify({ city: 'Smoke City Updated' }),
  });

  const projectionRead = await waitForProjection(order.order_id);
  if (!projectionRead.client) throw new Error('Projection smoke read returned no client');

  const batchRun = await request(`${BATCH_SYNC_WORKER_URL}/control/run-once`, { method: 'POST', body: '{}' });
  if (!batchRun.processedCount || batchRun.processedCount < 1) {
    throw new Error('Batch smoke sync processed no rows');
  }

  const batchRead = await request(`${ORDERS_SERVICE_URL}/orders/${order.order_id}/batch-pattern`);
  if (!batchRead.client) throw new Error('Batch smoke read returned no client');

  const outDir = path.join(ROOT, 'results', 'smoke');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'smoke-result.json'), JSON.stringify({
    timestamp: new Date().toISOString(),
    order_id: order.order_id,
    checks: {
      health: 'pass',
      seed: 'pass',
      api_read: 'pass',
      event_projection: 'pass',
      batch_sync: 'pass',
    },
  }, null, 2));

  console.log('[smoke] PASS');
}

main().catch((error) => {
  console.error(`[smoke] FAIL: ${error.message}`);
  process.exitCode = 1;
});
