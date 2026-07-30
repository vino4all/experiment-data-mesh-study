const { Pool } = require('pg');
const logger = require('./logger');

// Source pool (Client DB)
const sourcePool = new Pool({
  connectionString: process.env.SOURCE_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

sourcePool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on source idle client');
});

// Target pool (Orders DB)
const targetPool = new Pool({
  connectionString: process.env.TARGET_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

targetPool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on target idle client');
});

module.exports = {
  sourcePool,
  targetPool,
};
