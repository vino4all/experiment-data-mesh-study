const prometheus = require('prom-client');

// Default metrics
prometheus.collectDefaultMetrics();

const batchSyncDuration = new prometheus.Histogram({
  name: 'batch_sync_duration_ms',
  help: 'Duration of batch sync in milliseconds',
  labelNames: ['status'],
  buckets: [100, 500, 1000, 5000, 10000, 30000],
});

const batchSyncRowsProcessed = new prometheus.Counter({
  name: 'batch_sync_rows_processed_total',
  help: 'Total rows processed in batch sync',
  labelNames: ['status'],
});

const batchSyncErrors = new prometheus.Counter({
  name: 'batch_sync_errors_total',
  help: 'Total batch sync errors',
});

const batchSyncFrequency = new prometheus.Gauge({
  name: 'batch_sync_last_run_timestamp',
  help: 'Timestamp of last successful batch sync',
});

module.exports = {
  batchSyncDuration,
  batchSyncRowsProcessed,
  batchSyncErrors,
  batchSyncFrequency,
  register: prometheus.register,
};
