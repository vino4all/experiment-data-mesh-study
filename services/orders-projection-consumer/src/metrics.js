const prometheus = require('prom-client');

// Default metrics
prometheus.collectDefaultMetrics();

const kafkaMessageProcessed = new prometheus.Counter({
  name: 'kafka_messages_processed_total',
  help: 'Total number of Kafka messages processed',
  labelNames: ['status', 'event_type'],
});

const projectionUpdateDuration = new prometheus.Histogram({
  name: 'projection_update_duration_ms',
  help: 'Time to update projection in milliseconds',
  labelNames: ['status'],
  buckets: [1, 5, 10, 50, 100, 500],
});

const projectionLag = new prometheus.Gauge({
  name: 'projection_lag_ms',
  help: 'Lag between event timestamp and projection update',
});

const replayedMessages = new prometheus.Counter({
  name: 'replayed_messages_total',
  help: 'Total number of replayed messages',
});

module.exports = {
  kafkaMessageProcessed,
  projectionUpdateDuration,
  projectionLag,
  replayedMessages,
  register: prometheus.register,
};
