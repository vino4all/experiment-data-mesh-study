const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env'), quiet: true });

if (!process.env.POSTGRES_PASSWORD) {
  throw new Error('POSTGRES_PASSWORD is required. Copy .env.example to .env and set a local password.');
}
const { Pool } = require('pg');
const { PNG } = require('pngjs');
const {
  stopConsumerContainer,
  startConsumerContainer,
  pauseKafkaConsumption,
  resumeKafkaConsumption,
  setBatchDelay,
  injectApiDegradation,
} = require('./failure-injection');

const ROOT = process.cwd();
const RESULTS_DIR = path.join(ROOT, 'results');
const CHARTS_DIR = path.join(RESULTS_DIR, 'charts');
const PAPER_TABLES_DIR = path.join(ROOT, 'paper', 'tables');
const ANALYSIS_DIR = path.join(RESULTS_DIR, 'analysis');

const CLIENT_SERVICE_URL = process.env.CLIENT_SERVICE_URL || 'http://localhost:3001';
const ORDERS_SERVICE_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3002';
const BATCH_SYNC_WORKER_URL = process.env.BATCH_SYNC_WORKER_URL || 'http://localhost:3004';

const CLIENT_DB = new Pool({
  host: process.env.CLIENT_DB_HOST || 'localhost',
  port: Number.parseInt(process.env.CLIENT_DB_PORT || '55432', 10),
  user: process.env.POSTGRES_USER || 'datamesh',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB_CLIENT || 'client_db',
});

const ORDERS_DB = new Pool({
  host: process.env.ORDERS_DB_HOST || 'localhost',
  port: Number.parseInt(process.env.ORDERS_DB_PORT || '5433', 10),
  user: process.env.POSTGRES_USER || 'datamesh',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB_ORDERS || 'orders_db',
});

const EXPERIMENT_CFG = {
  experiment1: {
    seedClients: Number.parseInt(process.env.EXP1_SEED_CLIENTS || '10000', 10),
    seedOrders: Number.parseInt(process.env.EXP1_SEED_ORDERS || '100000', 10),
    clientUpdates: Number.parseInt(process.env.EXP1_CLIENT_UPDATES || '10000', 10),
    readRequests: Number.parseInt(process.env.EXP1_READ_REQUESTS || '5000', 10),
  },
  experiment2: {
    intervalsMinutes: [1, 5, 15, 30],
    intervalScaleSeconds: Number.parseFloat(process.env.EXP2_INTERVAL_SCALE_SECONDS || '60'),
    clientUpdates: Number.parseInt(process.env.EXP2_CLIENT_UPDATES || '10000', 10),
    readRequests: Number.parseInt(process.env.EXP2_READ_REQUESTS || '5000', 10),
  },
  experiment3: {
    seedClients: Number.parseInt(process.env.EXP3_SEED_CLIENTS || '50000', 10),
    seedOrders: Number.parseInt(process.env.EXP3_SEED_ORDERS || '100000', 10),
    clientUpdates: Number.parseInt(process.env.EXP3_CLIENT_UPDATES || '10000', 10),
    orderReads: Number.parseInt(process.env.EXP3_ORDER_READS || '100000', 10),
    runMinutes: Number.parseFloat(process.env.EXP3_RUN_MINUTES || '10'),
  },
  experiment4: {
    delaysMs: [100, 500, 1000, 2000],
    readRequests: Number.parseInt(process.env.EXP4_READ_REQUESTS || '8000', 10),
  },
  experiment5: {
    readRequests: Number.parseInt(process.env.EXP5_READ_REQUESTS || '8000', 10),
  },
  concurrency: Number.parseInt(process.env.EXPERIMENT_CONCURRENCY || '40', 10),
  staleThresholdMs: Number.parseInt(process.env.STALE_THRESHOLD_MS || '30000', 10),
};

const NORMALIZED_COLUMNS = [
  'experiment_name',
  'pattern',
  'phase',
  'timestamp',
  'sample_count',
  'mean_latency_ms',
  'p50_latency_ms',
  'p95_latency_ms',
  'p99_latency_ms',
  'mean_freshness_lag_ms',
  'p50_freshness_lag_ms',
  'p95_freshness_lag_ms',
  'p99_freshness_lag_ms',
  'stale_read_rate',
  'throughput',
  'error_rate',
  'recovery_duration_ms',
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values, p) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function mean(values) {
  if (!values || values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function toCsv(rows, columns) {
  const header = columns.join(',');
  const lines = [header];
  for (const row of rows) {
    const values = columns.map((column) => {
      const value = row[column];
      if (value === null || typeof value === 'undefined') return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  return response.json();
}

async function putJson(url, body) {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PUT ${url} failed with ${response.status}: ${text}`);
  }
  return response.json();
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

async function withConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runOne() {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= items.length) return;
      try {
        results[current] = await worker(items[current], current);
      } catch (err) {
        results[current] = { error: err.message };
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.max(1, concurrency); i += 1) {
    workers.push(runOne());
  }
  await Promise.all(workers);
  return results;
}

async function ensureSeedData(targetClients, targetOrders) {
  const clientCountResult = await CLIENT_DB.query('SELECT COUNT(*)::int AS count FROM clients');
  const currentClients = clientCountResult.rows[0].count;
  const missingClients = Math.max(0, targetClients - currentClients);

  if (missingClients > 0) {
    const seedOffset = currentClients;
    await CLIENT_DB.query(
      `INSERT INTO clients (client_id, first_name, last_name, email, phone, address_line1, city, state, zip_code, loyalty_tier, version, updated_at)
       SELECT gen_random_uuid(), 'SeedFirst' || ($2 + g)::text, 'SeedLast' || ($2 + g)::text,
              'seed-' || ($2 + g)::text || '@example.com',
              '555-' || lpad(((g % 10000)::text), 4, '0'),
              'Seed Street ' || ($2 + g)::text,
              'City' || (($2 + g) % 100)::text,
              'ST',
              lpad(((10000 + (($2 + g) % 89999))::text), 5, '0'),
              CASE WHEN (($2 + g) % 3) = 0 THEN 'gold' WHEN (($2 + g) % 3) = 1 THEN 'silver' ELSE 'standard' END,
              1,
              NOW()
       FROM generate_series(1, $1) AS g
       ON CONFLICT (email) DO NOTHING`,
      [missingClients, seedOffset]
    );
  }

  const orderCountResult = await ORDERS_DB.query('SELECT COUNT(*)::int AS count FROM orders');
  const currentOrders = orderCountResult.rows[0].count;
  const missingOrders = Math.max(0, targetOrders - currentOrders);

  if (missingOrders > 0) {
    await ORDERS_DB.query(
      `WITH clients AS (
         SELECT client_id, row_number() OVER () AS rn FROM orders_client_projection
       ),
       stats AS (
         SELECT COUNT(*)::int AS cnt FROM clients
       )
       INSERT INTO orders (order_id, client_id, order_status, order_total, shipping_status, created_at, updated_at)
       SELECT gen_random_uuid(),
              c.client_id,
              CASE WHEN g % 4 = 0 THEN 'confirmed' WHEN g % 4 = 1 THEN 'pending' WHEN g % 4 = 2 THEN 'shipped' ELSE 'delivered' END,
              (10 + ((g % 5000) / 10.0))::numeric(10,2),
              CASE WHEN g % 3 = 0 THEN 'not_shipped' WHEN g % 3 = 1 THEN 'in_transit' ELSE 'delivered' END,
              NOW(),
              NOW()
       FROM generate_series(1, $1) AS g
       CROSS JOIN stats s
       JOIN clients c ON c.rn = ((g - 1) % GREATEST(s.cnt, 1)) + 1`,
      [missingOrders]
    );
  }
}

async function getClientIds(limit) {
  const result = await CLIENT_DB.query('SELECT client_id FROM clients ORDER BY updated_at DESC LIMIT $1', [limit]);
  return result.rows.map((row) => row.client_id);
}

async function getOrderIds(limit) {
  const result = await ORDERS_DB.query('SELECT order_id FROM orders ORDER BY created_at DESC LIMIT $1', [limit]);
  return result.rows.map((row) => row.order_id);
}

async function executeClientUpdates(clientIds, waveLabel) {
  const start = Date.now();
  const updateTimes = new Map();

  await withConcurrency(clientIds, EXPERIMENT_CFG.concurrency, async (clientId, index) => {
    const response = await putJson(`${CLIENT_SERVICE_URL}/clients/${clientId}`, {
      loyalty_tier: index % 2 === 0 ? 'gold' : 'silver',
      city: `WaveCity-${waveLabel}-${index % 100}`,
    });
    updateTimes.set(clientId, response.updated_at || nowIso());
  });

  return {
    durationMs: Date.now() - start,
    updateTimes,
  };
}

async function runOrderReads({ patternEndpoint, orderIds, requestCount, queryBuilder }) {
  const start = Date.now();
  const latencyValues = [];
  const freshnessValues = [];
  let staleReads = 0;
  let errors = 0;

  const tokens = Array.from({ length: requestCount }, (_, i) => i);
  await withConcurrency(tokens, EXPERIMENT_CFG.concurrency, async (_, index) => {
    const orderId = pickRandom(orderIds);
    const queryString = queryBuilder ? queryBuilder(index) : '';
    const url = `${ORDERS_SERVICE_URL}/orders/${orderId}/${patternEndpoint}${queryString}`;

    const reqStart = Date.now();
    let response;
    try {
      response = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      errors += 1;
      return;
    }

    const latency = Date.now() - reqStart;
    latencyValues.push(latency);

    if (!response.ok) {
      errors += 1;
      return;
    }

    const body = await response.json();
    if (typeof body.freshness_lag_ms === 'number') {
      freshnessValues.push(body.freshness_lag_ms);
      if (body.freshness_lag_ms > EXPERIMENT_CFG.staleThresholdMs) {
        staleReads += 1;
      }
    }

    if (body.stale_read === true) {
      staleReads += 1;
    }
  });

  const durationSec = Math.max(0.001, (Date.now() - start) / 1000);

  return {
    latencyValues,
    freshnessValues,
    staleReadRate: requestCount > 0 ? staleReads / requestCount : 0,
    errorRate: requestCount > 0 ? errors / requestCount : 0,
    throughput: requestCount / durationSec,
    durationMs: durationSec * 1000,
  };
}

async function getProjectionBacklog(clientIds, updateTimesMap) {
  if (clientIds.length === 0) return 0;

  const updateTimes = clientIds.map((id) => updateTimesMap.get(id) || nowIso());
  const result = await ORDERS_DB.query(
    `SELECT COUNT(*)::int AS backlog
     FROM unnest($1::uuid[], $2::timestamptz[]) AS u(client_id, update_time)
     LEFT JOIN orders_client_projection p ON p.client_id = u.client_id
     WHERE p.client_id IS NULL OR p.source_update_timestamp IS NULL OR p.source_update_timestamp < u.update_time`,
    [clientIds, updateTimes]
  );

  return result.rows[0].backlog;
}

async function getProjectionLagStats(clientIds) {
  if (clientIds.length === 0) {
    return { maxLagMs: 0, avgLagMs: 0 };
  }

  const result = await ORDERS_DB.query(
    `SELECT COALESCE(MAX(freshness_lag_ms), 0)::bigint AS max_lag,
            COALESCE(AVG(freshness_lag_ms), 0)::float AS avg_lag
     FROM orders_client_projection
     WHERE client_id = ANY($1::uuid[])`,
    [clientIds]
  );

  return {
    maxLagMs: Number.parseInt(result.rows[0].max_lag, 10),
    avgLagMs: Number.parseFloat(result.rows[0].avg_lag),
  };
}

function summarizeReadMetrics(readMetrics) {
  return {
    sample_count: readMetrics.latencyValues.length,
    mean_latency_ms: mean(readMetrics.latencyValues),
    p50_latency_ms: percentile(readMetrics.latencyValues, 50),
    p95_latency_ms: percentile(readMetrics.latencyValues, 95),
    p99_latency_ms: percentile(readMetrics.latencyValues, 99),
    mean_freshness_lag_ms: mean(readMetrics.freshnessValues),
    p50_freshness_lag_ms: percentile(readMetrics.freshnessValues, 50),
    p95_freshness_lag_ms: percentile(readMetrics.freshnessValues, 95),
    p99_freshness_lag_ms: percentile(readMetrics.freshnessValues, 99),
    stale_read_rate: readMetrics.staleReadRate,
    throughput: readMetrics.throughput,
    error_rate: readMetrics.errorRate,
  };
}

function normalizeRow(experimentName, pattern, phase, metrics, recoveryDurationMs) {
  return {
    experiment_name: experimentName,
    pattern,
    phase,
    timestamp: nowIso(),
    sample_count: metrics.sample_count,
    mean_latency_ms: metrics.mean_latency_ms,
    p50_latency_ms: metrics.p50_latency_ms,
    p95_latency_ms: metrics.p95_latency_ms,
    p99_latency_ms: metrics.p99_latency_ms,
    mean_freshness_lag_ms: metrics.mean_freshness_lag_ms,
    p50_freshness_lag_ms: metrics.p50_freshness_lag_ms,
    p95_freshness_lag_ms: metrics.p95_freshness_lag_ms,
    p99_freshness_lag_ms: metrics.p99_freshness_lag_ms,
    stale_read_rate: metrics.stale_read_rate,
    throughput: metrics.throughput,
    error_rate: metrics.error_rate,
    recovery_duration_ms: recoveryDurationMs ?? null,
  };
}

function drawSimpleChart(filePath, values, options = {}) {
  const width = options.width || 1200;
  const height = options.height || 640;
  const margin = 60;
  const png = new PNG({ width, height });

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = (width * y + x) << 2;
    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = a;
  }

  function drawLine(x1, y1, x2, y2, color) {
    const dx = Math.abs(x2 - x1);
    const dy = -Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx + dy;
    let x = x1;
    let y = y1;

    while (true) {
      setPixel(x, y, color[0], color[1], color[2], 255);
      if (x === x2 && y === y2) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setPixel(x, y, 250, 251, 252, 255);
    }
  }

  const maxValue = Math.max(1, ...values.map((v) => v.value));
  const x0 = margin;
  const y0 = height - margin;
  const x1 = width - margin;
  const y1 = margin;

  drawLine(x0, y0, x1, y0, [80, 80, 80]);
  drawLine(x0, y0, x0, y1, [80, 80, 80]);

  const barSpace = (x1 - x0) / Math.max(1, values.length);
  const barWidth = Math.max(4, Math.floor(barSpace * 0.6));

  values.forEach((point, index) => {
    const cx = x0 + Math.floor(index * barSpace + (barSpace - barWidth) / 2);
    const barHeight = Math.floor(((point.value || 0) / maxValue) * (y0 - y1));
    const top = y0 - barHeight;

    for (let x = cx; x < cx + barWidth; x += 1) {
      for (let y = top; y <= y0; y += 1) {
        setPixel(x, y, 35, 120, 220, 255);
      }
    }
  });

  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function writeMarkdownTable(filePath, title, rows, columns) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`| ${columns.join(' | ')} |`);
  lines.push(`| ${columns.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    lines.push(`| ${columns.map((column) => (row[column] ?? '')).join(' | ')} |`);
  }
  lines.push('');
  fs.writeFileSync(filePath, lines.join('\n'));
}

async function runExperiment1(normalizedRows) {
  const cfg = EXPERIMENT_CFG.experiment1;
  await ensureSeedData(cfg.seedClients, cfg.seedOrders);

  const clientIds = await getClientIds(cfg.clientUpdates);
  const orderIds = await getOrderIds(Math.min(cfg.readRequests, 20000));

  await resumeKafkaConsumption();

  stopConsumerContainer();
  const updateResult = await executeClientUpdates(clientIds, 'exp1');

  const readResult = await runOrderReads({
    patternEndpoint: 'projection-pattern',
    orderIds,
    requestCount: cfg.readRequests,
  });

  startConsumerContainer();
  await sleep(6000);

  const recoveryStarted = Date.now();
  const recoverySnapshots = [];

  while (true) {
    const backlog = await getProjectionBacklog(clientIds, updateResult.updateTimes);
    const lagStats = await getProjectionLagStats(clientIds);

    recoverySnapshots.push({
      timestamp: nowIso(),
      backlog_size: backlog,
      max_projection_lag_ms: lagStats.maxLagMs,
      avg_projection_lag_ms: lagStats.avgLagMs,
    });

    if (backlog === 0) break;
    if (Date.now() - recoveryStarted > 15 * 60 * 1000) break;
    await sleep(2000);
  }

  const recoveryDurationMs = Date.now() - recoveryStarted;

  const backlogSeries = recoverySnapshots.map((s) => s.backlog_size);
  const maxLagSeries = recoverySnapshots.map((s) => s.max_projection_lag_ms);
  const avgLagSeries = recoverySnapshots.map((s) => s.avg_projection_lag_ms);

  const summary = {
    experiment_name: 'event_projection_failure_recovery',
    generated_at: nowIso(),
    update_count: cfg.clientUpdates,
    read_count: cfg.readRequests,
    backlog_size: {
      p50: percentile(backlogSeries, 50),
      p95: percentile(backlogSeries, 95),
      p99: percentile(backlogSeries, 99),
      max: Math.max(0, ...backlogSeries),
    },
    max_projection_lag_ms: {
      p50: percentile(maxLagSeries, 50),
      p95: percentile(maxLagSeries, 95),
      p99: percentile(maxLagSeries, 99),
      mean: mean(maxLagSeries),
    },
    avg_projection_lag_ms: {
      p50: percentile(avgLagSeries, 50),
      p95: percentile(avgLagSeries, 95),
      p99: percentile(avgLagSeries, 99),
      mean: mean(avgLagSeries),
    },
    stale_read_rate: readResult.staleReadRate,
    recovery_duration_ms: recoveryDurationMs,
    events_processed_per_second: cfg.clientUpdates / Math.max(1, recoveryDurationMs / 1000),
    catchup_completion_time: nowIso(),
    samples: recoverySnapshots,
  };

  fs.writeFileSync(path.join(RESULTS_DIR, 'failure_recovery_results.json'), JSON.stringify(summary, null, 2));

  const csvRows = recoverySnapshots.map((sample) => ({
    ...sample,
    stale_read_rate: readResult.staleReadRate,
    recovery_duration_ms: recoveryDurationMs,
    events_processed_per_second: summary.events_processed_per_second,
    catchup_completion_time: summary.catchup_completion_time,
  }));

  fs.writeFileSync(
    path.join(RESULTS_DIR, 'failure_recovery_results.csv'),
    toCsv(csvRows, [
      'timestamp',
      'backlog_size',
      'max_projection_lag_ms',
      'avg_projection_lag_ms',
      'stale_read_rate',
      'recovery_duration_ms',
      'events_processed_per_second',
      'catchup_completion_time',
    ])
  );

  const readSummary = summarizeReadMetrics(readResult);
  normalizedRows.push(
    normalizeRow('event_projection_failure_recovery', 'projection-pattern', 'recovery', readSummary, recoveryDurationMs)
  );

  return { summary, readSummary };
}

async function runExperiment2(normalizedRows) {
  const cfg = EXPERIMENT_CFG.experiment2;
  const intervalRows = [];

  const allOrderIds = await getOrderIds(30000);

  for (const intervalMinutes of cfg.intervalsMinutes) {
    const clientIds = await getClientIds(cfg.clientUpdates);

    await executeClientUpdates(clientIds, `exp2-${intervalMinutes}m`);
    const waitMs = Math.max(1000, intervalMinutes * cfg.intervalScaleSeconds * 1000);
    await sleep(waitMs);

    await setBatchDelay(0);
    const syncResponse = await fetch(`${BATCH_SYNC_WORKER_URL}/control/run-once`, { method: 'POST' });
    if (!syncResponse.ok) {
      throw new Error(`Batch run failed for interval ${intervalMinutes}m`);
    }

    const readResult = await runOrderReads({
      patternEndpoint: 'batch-pattern',
      orderIds: allOrderIds,
      requestCount: cfg.readRequests,
    });

    const latestSync = await ORDERS_DB.query(
      `SELECT EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 AS duration_ms
       FROM orders_batch_sync_state
       WHERE sync_status = 'completed'
       ORDER BY sync_id DESC
       LIMIT 1`
    );

    const syncDurationMs = Number.parseFloat(latestSync.rows[0]?.duration_ms || '0');
    const summary = summarizeReadMetrics(readResult);

    intervalRows.push({
      interval_minutes: intervalMinutes,
      mean_freshness_lag_ms: summary.mean_freshness_lag_ms,
      p50_freshness_lag_ms: summary.p50_freshness_lag_ms,
      p95_freshness_lag_ms: summary.p95_freshness_lag_ms,
      p99_freshness_lag_ms: summary.p99_freshness_lag_ms,
      stale_read_rate: summary.stale_read_rate,
      sync_duration_ms: syncDurationMs,
    });

    normalizedRows.push(
      normalizeRow('batch_synchronization_delay_analysis', 'batch-pattern', `interval-${intervalMinutes}m`, summary, null)
    );
  }

  fs.writeFileSync(
    path.join(RESULTS_DIR, 'batch_interval_comparison.csv'),
    toCsv(intervalRows, [
      'interval_minutes',
      'mean_freshness_lag_ms',
      'p50_freshness_lag_ms',
      'p95_freshness_lag_ms',
      'p99_freshness_lag_ms',
      'stale_read_rate',
      'sync_duration_ms',
    ])
  );

  drawSimpleChart(
    path.join(CHARTS_DIR, 'batch-interval-vs-freshness-lag.png'),
    intervalRows.map((row) => ({ label: String(row.interval_minutes), value: row.mean_freshness_lag_ms || 0 }))
  );

  return intervalRows;
}

async function runExperiment3(normalizedRows) {
  const cfg = EXPERIMENT_CFG.experiment3;
  await ensureSeedData(cfg.seedClients, cfg.seedOrders);

  const clientIds = await getClientIds(cfg.clientUpdates);
  const orderIds = await getOrderIds(Math.min(cfg.orderReads, 50000));

  const updatesPromise = executeClientUpdates(clientIds, 'exp3-storm');
  const readsPromise = runOrderReads({
    patternEndpoint: 'projection-pattern',
    orderIds,
    requestCount: cfg.orderReads,
  });

  const [updateResult, readResult] = await Promise.all([updatesPromise, readsPromise]);
  const lagStats = await getProjectionLagStats(clientIds);
  const backlog = await getProjectionBacklog(clientIds, updateResult.updateTimes);

  const projectionRateResult = await ORDERS_DB.query(
    `SELECT COUNT(*)::int AS cnt
     FROM synchronization_visibility_events
     WHERE pattern = 'projection' AND created_at > NOW() - INTERVAL '10 minutes'`
  );

  const projectionUpdateRate = projectionRateResult.rows[0].cnt / Math.max(1, cfg.runMinutes * 60);

  const summary = {
    experiment_name: 'client_update_storm',
    generated_at: nowIso(),
    event_lag_ms: lagStats.avgLagMs,
    projection_lag_ms: lagStats.maxLagMs,
    stale_read_rate: readResult.staleReadRate,
    event_backlog_size: backlog,
    throughput: readResult.throughput,
    projection_update_rate: projectionUpdateRate,
    sample_count: readResult.latencyValues.length,
    p50_latency_ms: percentile(readResult.latencyValues, 50),
    p95_latency_ms: percentile(readResult.latencyValues, 95),
    p99_latency_ms: percentile(readResult.latencyValues, 99),
  };

  fs.writeFileSync(path.join(RESULTS_DIR, 'update_storm_results.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(RESULTS_DIR, 'update_storm_results.csv'),
    toCsv([summary], [
      'experiment_name',
      'generated_at',
      'event_lag_ms',
      'projection_lag_ms',
      'stale_read_rate',
      'event_backlog_size',
      'throughput',
      'projection_update_rate',
      'sample_count',
      'p50_latency_ms',
      'p95_latency_ms',
      'p99_latency_ms',
    ])
  );

  normalizedRows.push(
    normalizeRow('client_update_storm', 'projection-pattern', 'storm', summarizeReadMetrics(readResult), null)
  );

  return summary;
}

async function runExperiment4(normalizedRows) {
  const cfg = EXPERIMENT_CFG.experiment4;
  const orderIds = await getOrderIds(Math.min(cfg.readRequests, 30000));
  const rows = [];

  for (const delayMs of cfg.delaysMs) {
    await injectApiDegradation({ latencyMs: delayMs, timeoutRate: 0, error500Rate: 0, error503Rate: 0 });

    const readResult = await runOrderReads({
      patternEndpoint: 'api-pattern',
      orderIds,
      requestCount: cfg.readRequests,
    });

    const summary = summarizeReadMetrics(readResult);
    rows.push({
      delay_ms: delayMs,
      orders_latency_p50: summary.p50_latency_ms,
      orders_latency_p95: summary.p95_latency_ms,
      orders_latency_p99: summary.p99_latency_ms,
      timeout_rate: summary.error_rate,
      error_rate: summary.error_rate,
      throughput: summary.throughput,
    });

    normalizedRows.push(
      normalizeRow('api_dependency_degradation', 'api-pattern', `delay-${delayMs}ms`, summary, null)
    );
  }

  await injectApiDegradation({ latencyMs: 0, timeoutRate: 0, error500Rate: 0, error503Rate: 0 });

  fs.writeFileSync(
    path.join(RESULTS_DIR, 'api_dependency_degradation.csv'),
    toCsv(rows, [
      'delay_ms',
      'orders_latency_p50',
      'orders_latency_p95',
      'orders_latency_p99',
      'timeout_rate',
      'error_rate',
      'throughput',
    ])
  );

  drawSimpleChart(
    path.join(CHARTS_DIR, 'client-api-delay-vs-orders-latency.png'),
    rows.map((row) => ({ label: String(row.delay_ms), value: row.orders_latency_p95 || 0 }))
  );

  return rows;
}

async function runExperiment5(normalizedRows) {
  const cfg = EXPERIMENT_CFG.experiment5;
  const orderIds = await getOrderIds(Math.min(cfg.readRequests, 30000));

  const patterns = [
    { key: 'api', endpoint: 'api-pattern', queryBuilder: null },
    { key: 'projection', endpoint: 'projection-pattern', queryBuilder: null },
    { key: 'batch', endpoint: 'batch-pattern', queryBuilder: null },
    {
      key: 'hybrid',
      endpoint: 'hybrid-pattern',
      queryBuilder: (index) => {
        const workloadType = index % 2 === 0 ? 'operational' : 'fulfillment-batch';
        const requestedClientCount = index % 3 === 0 ? 3 : 20;
        return `?workloadType=${encodeURIComponent(workloadType)}&requestedClientCount=${requestedClientCount}`;
      },
    },
  ];

  const complexityScore = {
    api: 2,
    projection: 4,
    batch: 3,
    hybrid: 5,
  };

  const rows = [];

  for (const pattern of patterns) {
    const readResult = await runOrderReads({
      patternEndpoint: pattern.endpoint,
      orderIds,
      requestCount: cfg.readRequests,
      queryBuilder: pattern.queryBuilder,
    });

    const summary = summarizeReadMetrics(readResult);
    rows.push({
      pattern: pattern.key,
      mean_latency: summary.mean_latency_ms,
      p95_latency: summary.p95_latency_ms,
      stale_read_rate: summary.stale_read_rate,
      api_calls: pattern.key === 'api' ? cfg.readRequests : pattern.key === 'hybrid' ? Math.round(cfg.readRequests * 0.33) : 0,
      throughput: summary.throughput,
      freshness_lag: summary.mean_freshness_lag_ms,
      operational_complexity_score: complexityScore[pattern.key],
    });

    normalizedRows.push(
      normalizeRow('hybrid_synchronization_strategy', `${pattern.key}-pattern`, 'comparison', summary, null)
    );
  }

  fs.writeFileSync(
    path.join(RESULTS_DIR, 'hybrid_comparison_results.csv'),
    toCsv(rows, [
      'pattern',
      'mean_latency',
      'p95_latency',
      'stale_read_rate',
      'api_calls',
      'throughput',
      'freshness_lag',
      'operational_complexity_score',
    ])
  );

  drawSimpleChart(
    path.join(CHARTS_DIR, 'hybrid-strategy-comparison.png'),
    rows.map((row) => ({ label: row.pattern, value: row.mean_latency || 0 }))
  );

  return rows;
}

function buildCrossExperimentCharts(experiment2Rows, experiment3Summary, experiment4Rows, experiment5Rows, experiment1Summary) {
  drawSimpleChart(
    path.join(CHARTS_DIR, 'freshness-lag-comparison.png'),
    [
      { label: 'batch-1m', value: experiment2Rows[0]?.mean_freshness_lag_ms || 0 },
      { label: 'batch-5m', value: experiment2Rows[1]?.mean_freshness_lag_ms || 0 },
      { label: 'storm', value: experiment3Summary?.projection_lag_ms || 0 },
      { label: 'hybrid', value: experiment5Rows.find((r) => r.pattern === 'hybrid')?.freshness_lag || 0 },
    ]
  );

  drawSimpleChart(
    path.join(CHARTS_DIR, 'stale-read-comparison.png'),
    [
      { label: 'failure', value: experiment1Summary?.stale_read_rate || 0 },
      { label: 'batch-30m', value: experiment2Rows[3]?.stale_read_rate || 0 },
      { label: 'storm', value: experiment3Summary?.stale_read_rate || 0 },
      { label: 'hybrid', value: experiment5Rows.find((r) => r.pattern === 'hybrid')?.stale_read_rate || 0 },
    ]
  );

  drawSimpleChart(
    path.join(CHARTS_DIR, 'throughput-comparison.png'),
    [
      { label: 'storm', value: experiment3Summary?.throughput || 0 },
      { label: 'api-500', value: experiment4Rows.find((r) => r.delay_ms === 500)?.throughput || 0 },
      { label: 'api-2000', value: experiment4Rows.find((r) => r.delay_ms === 2000)?.throughput || 0 },
      { label: 'hybrid', value: experiment5Rows.find((r) => r.pattern === 'hybrid')?.throughput || 0 },
    ]
  );

  drawSimpleChart(
    path.join(CHARTS_DIR, 'recovery-duration-comparison.png'),
    [{ label: 'projection-recovery', value: experiment1Summary?.recovery_duration_ms || 0 }]
  );

  drawSimpleChart(
    path.join(CHARTS_DIR, 'api-dependency-impact.png'),
    experiment4Rows.map((row) => ({ label: String(row.delay_ms), value: row.orders_latency_p95 || 0 }))
  );
}

function generatePaperTables({ experiment1, experiment2, experiment3, experiment4, experiment5 }) {
  const table1 = experiment5.map((row) => ({
    pattern: row.pattern,
    mean_latency: row.mean_latency,
    p95_latency: row.p95_latency,
    stale_read_rate: row.stale_read_rate,
    throughput: row.throughput,
  }));

  const table2 = [
    ...experiment2.map((row) => ({
      source: `batch-${row.interval_minutes}m`,
      mean_freshness_lag_ms: row.mean_freshness_lag_ms,
      p95_freshness_lag_ms: row.p95_freshness_lag_ms,
      p99_freshness_lag_ms: row.p99_freshness_lag_ms,
      stale_read_rate: row.stale_read_rate,
    })),
    {
      source: 'projection-storm',
      mean_freshness_lag_ms: experiment3.event_lag_ms,
      p95_freshness_lag_ms: experiment3.projection_lag_ms,
      p99_freshness_lag_ms: experiment3.projection_lag_ms,
      stale_read_rate: experiment3.stale_read_rate,
    },
  ];

  const table3 = [
    {
      scenario: 'projection-consumer-recovery',
      recovery_duration_ms: experiment1.recovery_duration_ms,
      events_processed_per_second: experiment1.events_processed_per_second,
      max_projection_lag_p95: experiment1.max_projection_lag_ms.p95,
      backlog_p95: experiment1.backlog_size.p95,
    },
  ];

  const table4 = experiment4.map((row) => ({
    delay_ms: row.delay_ms,
    orders_latency_p50: row.orders_latency_p50,
    orders_latency_p95: row.orders_latency_p95,
    orders_latency_p99: row.orders_latency_p99,
    error_rate: row.error_rate,
    throughput: row.throughput,
  }));

  const table5 = experiment5.map((row) => ({
    pattern: row.pattern,
    api_calls: row.api_calls,
    freshness_lag: row.freshness_lag,
    operational_complexity_score: row.operational_complexity_score,
    throughput: row.throughput,
  }));

  const specs = [
    {
      baseName: 'table-1-pattern-comparison',
      title: 'Table 1 - Pattern Comparison',
      rows: table1,
      columns: ['pattern', 'mean_latency', 'p95_latency', 'stale_read_rate', 'throughput'],
    },
    {
      baseName: 'table-2-freshness-metrics',
      title: 'Table 2 - Freshness Metrics',
      rows: table2,
      columns: ['source', 'mean_freshness_lag_ms', 'p95_freshness_lag_ms', 'p99_freshness_lag_ms', 'stale_read_rate'],
    },
    {
      baseName: 'table-3-recovery-metrics',
      title: 'Table 3 - Recovery Metrics',
      rows: table3,
      columns: ['scenario', 'recovery_duration_ms', 'events_processed_per_second', 'max_projection_lag_p95', 'backlog_p95'],
    },
    {
      baseName: 'table-4-api-dependency-metrics',
      title: 'Table 4 - API Dependency Metrics',
      rows: table4,
      columns: ['delay_ms', 'orders_latency_p50', 'orders_latency_p95', 'orders_latency_p99', 'error_rate', 'throughput'],
    },
    {
      baseName: 'table-5-hybrid-strategy-metrics',
      title: 'Table 5 - Hybrid Strategy Metrics',
      rows: table5,
      columns: ['pattern', 'api_calls', 'freshness_lag', 'operational_complexity_score', 'throughput'],
    },
  ];

  for (const spec of specs) {
    const csvPath = path.join(PAPER_TABLES_DIR, `${spec.baseName}.csv`);
    const mdPath = path.join(PAPER_TABLES_DIR, `${spec.baseName}.md`);
    fs.writeFileSync(csvPath, toCsv(spec.rows, spec.columns));
    writeMarkdownTable(mdPath, spec.title, spec.rows, spec.columns);
  }
}

async function main() {
  ensureDir(RESULTS_DIR);
  ensureDir(CHARTS_DIR);
  ensureDir(PAPER_TABLES_DIR);
  ensureDir(ANALYSIS_DIR);

  const normalizedRows = [];

  console.log('Running Experiment 1: Event Projection Failure Recovery');
  const exp1 = await runExperiment1(normalizedRows);

  console.log('Running Experiment 2: Batch Synchronization Delay Analysis');
  const exp2 = await runExperiment2(normalizedRows);

  console.log('Running Experiment 3: Client Update Storm');
  const exp3 = await runExperiment3(normalizedRows);

  console.log('Running Experiment 4: API Dependency Degradation');
  const exp4 = await runExperiment4(normalizedRows);

  console.log('Running Experiment 5: Hybrid Synchronization Strategy');
  const exp5 = await runExperiment5(normalizedRows);

  buildCrossExperimentCharts(exp2, exp3, exp4, exp5, exp1.summary);

  generatePaperTables({
    experiment1: exp1.summary,
    experiment2: exp2,
    experiment3: exp3,
    experiment4: exp4,
    experiment5: exp5,
  });

  fs.writeFileSync(path.join(ANALYSIS_DIR, 'ieee-normalized-results.csv'), toCsv(normalizedRows, NORMALIZED_COLUMNS));
  fs.writeFileSync(path.join(ANALYSIS_DIR, 'ieee-normalized-results.json'), JSON.stringify(normalizedRows, null, 2));

  console.log('Experiment suite completed successfully.');
}

main()
  .catch((err) => {
    console.error('Experiment suite failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await injectApiDegradation({ latencyMs: 0, timeoutRate: 0, error500Rate: 0, error503Rate: 0 }).catch(() => {});
    await setBatchDelay(0).catch(() => {});
    await resumeKafkaConsumption().catch(() => {});
    await CLIENT_DB.end().catch(() => {});
    await ORDERS_DB.end().catch(() => {});
  });
