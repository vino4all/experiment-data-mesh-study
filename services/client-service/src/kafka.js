const { Kafka, logLevel } = require('kafkajs');
const logger = require('./logger');

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'data-mesh-app',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  logLevel: logLevel.INFO,
  connectionTimeout: 10000,
  requestTimeout: 25000,
});

module.exports = kafka;
