const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const analysisDir = path.join(rootDir, 'results', 'analysis');
const sourcePath = path.join(analysisDir, 'combined-analysis.json');
const outputJsonPath = path.join(analysisDir, 'consolidated-results-chatgpt.json');
const outputCsvPath = path.join(analysisDir, 'consolidated-results-chatgpt.csv');

const PHASE_ORDER = ['smoke', 'baseline', 'ramp', 'sustained', 'spike', 'failure'];
const PATTERN_ORDER = ['api-pattern', 'projection-pattern', 'batch-pattern'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function pickMetric(groupRecords, metricNames) {
  for (const metricName of metricNames) {
    const match = groupRecords.find((record) => record.metric_name === metricName);
    if (match) return match;
  }
  return null;
}

function metricSummary(record) {
  if (!record) return null;
  return {
    metric_name: record.metric_name,
    count: toNumber(record.count),
    mean: toNumber(record.mean),
    min: toNumber(record.min),
    p50: toNumber(record.p50),
    p95: toNumber(record.p95),
    p99: toNumber(record.p99),
    max: toNumber(record.max),
    sum: toNumber(record.sum),
  };
}

function metricNamesForPattern(pattern) {
  if (pattern === 'api-pattern') {
    return {
      latency: ['api_latency', 'latency_ms', 'http_req_duration'],
      freshness: ['freshness_lag_ms'],
      success: ['api_success'],
      failure: ['api_failure'],
      pressure: ['api_pressure'],
    };
  }

  if (pattern === 'projection-pattern') {
    return {
      latency: ['projection_latency', 'latency_ms', 'http_req_duration'],
      freshness: ['projection_lag_ms', 'freshness_lag_ms'],
      success: ['projection_success'],
      failure: [],
      pressure: ['api_pressure'],
    };
  }

  return {
    latency: ['batch_latency', 'latency_ms', 'http_req_duration'],
    freshness: ['batch_freshness_lag_ms', 'freshness_lag_ms'],
    success: ['batch_success'],
    failure: [],
    pressure: ['api_pressure'],
  };
}

function estimateSuccessRate(latencyRecord, successRecord, failureRecord, httpFailedRecord) {
  const latencyCount = latencyRecord ? toNumber(latencyRecord.count) : null;

  if (latencyCount && successRecord) {
    const successCount = toNumber(successRecord.count);
    if (typeof successCount === 'number') {
      return Math.max(0, Math.min(1, successCount / latencyCount));
    }
  }

  if (httpFailedRecord && typeof httpFailedRecord.mean === 'number') {
    return Math.max(0, Math.min(1, 1 - httpFailedRecord.mean));
  }

  if (successRecord && typeof successRecord.mean === 'number') {
    return Math.max(0, Math.min(1, successRecord.mean));
  }

  if (failureRecord && toNumber(failureRecord.count) === 0) {
    return 1;
  }

  return null;
}

function estimateFailureRate(latencyRecord, successRecord, failureRecord, httpFailedRecord) {
  const latencyCount = latencyRecord ? toNumber(latencyRecord.count) : null;

  if (latencyCount && failureRecord) {
    const failureCount = toNumber(failureRecord.count);
    if (typeof failureCount === 'number') {
      return Math.max(0, Math.min(1, failureCount / latencyCount));
    }
  }

  if (httpFailedRecord && typeof httpFailedRecord.mean === 'number') {
    return Math.max(0, Math.min(1, httpFailedRecord.mean));
  }

  if (successRecord && typeof successRecord.mean === 'number') {
    return Math.max(0, Math.min(1, 1 - successRecord.mean));
  }

  return null;
}

function buildCoverage(phases, patterns, grouped) {
  const coverage = [];
  for (const phase of phases) {
    for (const pattern of patterns) {
      const key = `${phase}::${pattern}`;
      const groupRecords = grouped.get(key) || [];
      coverage.push({
        phase,
        pattern,
        available: groupRecords.length > 0,
        metric_count: groupRecords.length,
      });
    }
  }
  return coverage;
}

function formatCsvValue(value) {
  if (value === null || typeof value === 'undefined') return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsv(rows, filePath) {
  const headers = [
    'phase',
    'pattern',
    'latency_metric',
    'latency_count',
    'latency_mean_ms',
    'latency_p95_ms',
    'latency_p99_ms',
    'freshness_metric',
    'freshness_mean_ms',
    'freshness_p95_ms',
    'api_pressure_metric',
    'api_pressure_mean',
    'success_rate',
    'failure_rate',
    'run_duration_seconds_est',
    'requests_per_second_est',
  ];

  const lines = [headers.join(',')];

  for (const row of rows) {
    const latency = row.metrics.latency || {};
    const freshness = row.metrics.freshness_lag_ms || {};
    const pressure = row.metrics.api_pressure || {};

    const values = [
      row.phase,
      row.pattern,
      latency.metric_name,
      latency.count,
      latency.mean,
      latency.p95,
      latency.p99,
      freshness.metric_name,
      freshness.mean,
      freshness.p95,
      pressure.metric_name,
      pressure.mean,
      row.derived.success_rate,
      row.derived.failure_rate,
      row.derived.run_duration_seconds_est,
      row.derived.requests_per_second_est,
    ];

    lines.push(values.map(formatCsvValue).join(','));
  }

  fs.writeFileSync(filePath, lines.join('\n'));
}

function main() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  const rows = readJson(sourcePath);

  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.phase}::${row.pattern}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const phases = Array.from(new Set(rows.map((row) => row.phase))).sort((a, b) => {
    const ai = PHASE_ORDER.indexOf(a);
    const bi = PHASE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const patterns = Array.from(new Set(rows.map((row) => row.pattern))).sort((a, b) => {
    const ai = PATTERN_ORDER.indexOf(a);
    const bi = PATTERN_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const consolidatedRows = [];

  for (const phase of phases) {
    for (const pattern of patterns) {
      const key = `${phase}::${pattern}`;
      const groupRecords = grouped.get(key);
      if (!groupRecords || groupRecords.length === 0) continue;

      const names = metricNamesForPattern(pattern);
      const latencyRecord = pickMetric(groupRecords, names.latency);
      const freshnessRecord = pickMetric(groupRecords, names.freshness);
      const successRecord = pickMetric(groupRecords, names.success);
      const failureRecord = pickMetric(groupRecords, names.failure);
      const pressureRecord = pickMetric(groupRecords, names.pressure);
      const httpReqFailedRecord = pickMetric(groupRecords, ['http_req_failed']);
      const httpReqsRecord = pickMetric(groupRecords, ['http_reqs']);
      const vusRecord = pickMetric(groupRecords, ['vus']);

      const runDurationSeconds = vusRecord ? toNumber(vusRecord.count) : null;
      const requestCount = httpReqsRecord ? toNumber(httpReqsRecord.sum) : null;
      const requestsPerSecond = runDurationSeconds && requestCount
        ? requestCount / runDurationSeconds
        : null;

      consolidatedRows.push({
        phase,
        pattern,
        metrics: {
          latency: metricSummary(latencyRecord),
          freshness_lag_ms: metricSummary(freshnessRecord),
          api_pressure: metricSummary(pressureRecord),
          http_req_failed: metricSummary(httpReqFailedRecord),
          success_signal: metricSummary(successRecord),
          failure_signal: metricSummary(failureRecord),
        },
        derived: {
          success_rate: estimateSuccessRate(latencyRecord, successRecord, failureRecord, httpReqFailedRecord),
          failure_rate: estimateFailureRate(latencyRecord, successRecord, failureRecord, httpReqFailedRecord),
          run_duration_seconds_est: runDurationSeconds,
          requests_per_second_est: requestsPerSecond,
          api_freshness_assumed_realtime: pattern === 'api-pattern' && !freshnessRecord,
        },
      });
    }
  }

  const consolidated = {
    generated_at: new Date().toISOString(),
    source_file: 'results/analysis/combined-analysis.json',
    total_source_rows: rows.length,
    phases,
    patterns,
    coverage: buildCoverage(phases, patterns, grouped),
    metric_notes: {
      latency_units: 'milliseconds',
      freshness_units: 'milliseconds',
      pressure_units: 'calls per request (dimensionless ratio)',
      success_rate_range: '0.0 to 1.0',
      failure_rate_range: '0.0 to 1.0',
      duration_and_rps: 'estimated from k6 vus and http_reqs summaries',
    },
    consolidated_results: consolidatedRows,
  };

  fs.writeFileSync(outputJsonPath, JSON.stringify(consolidated, null, 2));
  writeCsv(consolidatedRows, outputCsvPath);

  console.log(`Wrote ${outputJsonPath}`);
  console.log(`Wrote ${outputCsvPath}`);
  console.log(`Consolidated ${consolidatedRows.length} phase/pattern result row(s).`);
}

main();
