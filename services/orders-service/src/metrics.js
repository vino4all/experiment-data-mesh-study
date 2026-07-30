const prometheus = require('prom-client');

// Default metrics
prometheus.collectDefaultMetrics();

// Custom metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

const apiCallDuration = new prometheus.Histogram({
  name: 'api_call_duration_ms',
  help: 'API call duration in milliseconds',
  labelNames: ['pattern', 'status'],
  buckets: [10, 50, 100, 200, 500, 1000, 2000],
});

const dataFreshness = new prometheus.Gauge({
  name: 'data_freshness_lag_ms',
  help: 'Data freshness lag in milliseconds',
  labelNames: ['pattern'],
});

const staleReadCount = new prometheus.Counter({
  name: 'stale_reads_total',
  help: 'Total number of stale reads detected',
  labelNames: ['pattern'],
});

module.exports = {
  httpRequestDuration,
  apiCallDuration,
  dataFreshness,
  staleReadCount,
  register: prometheus.register,
};
