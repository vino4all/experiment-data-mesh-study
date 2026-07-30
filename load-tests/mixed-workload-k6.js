import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
const mixedLatency = new Trend('mixed_latency');
const apiCalls = new Counter('api_calls');
const projectionCalls = new Counter('projection_calls');
const batchCalls = new Counter('batch_calls');

// Test parameters
const ORDERS_SERVICE_URL = __ENV.ORDERS_SERVICE_URL || __ENV.K6_ORDERS_SERVICE_URL || 'http://localhost:3002';
const ORDER_IDS = [
  'c8b5e4f8-3b14-4e1a-9c5d-8a7f1b9e2d3c',
  'd7e3f2c1-5a9b-4c8f-3e2a-1b7d9c4f8e6a',
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'f4e3d2c1-b0a9-4f8e-7d6c-5b4a3f2e1d0c',
  'b9a8f7e6-d5c4-4b3a-2f1e-0d9c8b7a6f5e',
];

export const options = {
  vus: parseInt(__ENV.K6_VU || '20'),
  duration: __ENV.K6_DURATION || '120s',
  stages: [
    { duration: '10s', target: 20 },
    { duration: '60s', target: 30 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  // Randomly select an order ID
  const orderId = ORDER_IDS[Math.floor(Math.random() * ORDER_IDS.length)];
  
  // Randomly choose pattern with weights: API (30%), Projection (35%), Batch (35%)
  const random = Math.random();
  let endpoint, patternName;
  
  if (random < 0.30) {
    endpoint = `/orders/${orderId}/api-pattern`;
    patternName = 'api';
    apiCalls.add(1);
  } else if (random < 0.65) {
    endpoint = `/orders/${orderId}/projection-pattern`;
    patternName = 'projection';
    projectionCalls.add(1);
  } else {
    endpoint = `/orders/${orderId}/batch-pattern`;
    patternName = 'batch';
    batchCalls.add(1);
  }

  const startTime = new Date();
  const res = http.get(`${ORDERS_SERVICE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  });

  const duration = new Date() - startTime;
  mixedLatency.add(duration);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has order': (r) => r.json('order.order_id'),
  });

  sleep(Math.random() * 1);
}
