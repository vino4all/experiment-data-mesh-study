const { execSync } = require('child_process');

const CLIENT_SERVICE_URL = process.env.CLIENT_SERVICE_URL || 'http://localhost:3001';
const PROJECTION_CONSUMER_URL = process.env.PROJECTION_CONSUMER_URL || 'http://localhost:3003';
const BATCH_SYNC_WORKER_URL = process.env.BATCH_SYNC_WORKER_URL || 'http://localhost:3004';

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST ${url} failed: ${response.status} ${text}`);
  }

  return response.json();
}

function stopConsumerContainer() {
  execSync('docker stop orders-projection-consumer', { stdio: 'inherit' });
}

function startConsumerContainer() {
  execSync('docker start orders-projection-consumer', { stdio: 'inherit' });
}

async function pauseKafkaConsumption(pauseMs) {
  return postJson(`${PROJECTION_CONSUMER_URL}/control/pause`, { pauseMs: pauseMs || 0 });
}

async function resumeKafkaConsumption() {
  return postJson(`${PROJECTION_CONSUMER_URL}/control/resume`, {});
}

async function setBatchDelay(delayMs) {
  return postJson(`${BATCH_SYNC_WORKER_URL}/control/delay`, { delayMs: delayMs || 0 });
}

async function injectApiDegradation(config) {
  return postJson(`${CLIENT_SERVICE_URL}/control/failure-injection`, {
    latencyMs: config?.latencyMs || 0,
    timeoutRate: config?.timeoutRate || 0,
    error500Rate: config?.error500Rate || 0,
    error503Rate: config?.error503Rate || 0,
  });
}

module.exports = {
  stopConsumerContainer,
  startConsumerContainer,
  pauseKafkaConsumption,
  resumeKafkaConsumption,
  setBatchDelay,
  injectApiDegradation,
};
