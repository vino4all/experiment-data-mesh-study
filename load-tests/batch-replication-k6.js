import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
const batchLatency = new Trend('batch_latency');
const batchSuccess = new Counter('batch_success');
const batchFailure = new Counter('batch_failure');
const batchFreshness = new Gauge('batch_freshness_lag_ms');
const replicationAge = new Trend('replication_age_distribution');

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
  vus: parseInt(__ENV.K6_VU || '10'),
  duration: __ENV.K6_DURATION || '60s',
  thresholds: {
    'batch_latency': ['p(95)<50', 'p(99)<200'],
    'batch_success': ['count>0'],
  },
};

export default function () {
  // Randomly select an order ID
  const orderId = ORDER_IDS[Math.floor(Math.random() * ORDER_IDS.length)];

  // Pattern C: Batch data product replication
  const startTime = new Date();
  const res = http.get(`${ORDERS_SERVICE_URL}/orders/${orderId}/batch-pattern`, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  });

  const duration = new Date() - startTime;
  batchLatency.add(duration);

  if (check(res, {
    'status is 200': (r) => r.status === 200,
    'has order': (r) => r.json('order.order_id'),
    'has client or null': (r) => r.json('client') !== undefined,
    'has freshness info': (r) => r.json('freshness'),
  })) {
    batchSuccess.add(1);

    // Extract and measure freshness lag
    const responseBody = res.json();
    if (responseBody.client && responseBody.client.batch_imported_at) {
      const lag = Date.now() - new Date(responseBody.client.batch_imported_at).getTime();
      batchFreshness.add(lag);
      replicationAge.add(lag);
    }
  } else {
    batchFailure.add(1);
  }

  sleep(0.5);
}
