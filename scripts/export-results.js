const fs = require('fs');
const path = require('path');

const defaultResultsDir = path.resolve(process.cwd(), 'results');
const resultsDir = resolveOption('--results-dir', defaultResultsDir);
const analysisDir = path.join(resultsDir, 'analysis');
const jsonOutput = resolveOption('--output-json', path.join(analysisDir, 'combined-analysis.json'));
const csvOutput = resolveOption('--output-csv', path.join(analysisDir, 'combined-analysis.csv'));

main();

function main() {
  const inputFiles = listInputFiles(resultsDir);
  const records = [];

  for (const filePath of inputFiles) {
    const parsedRecords = parseResultFile(filePath);
    records.push(...parsedRecords);
  }

  records.sort((left, right) => {
    return [left.source_file, left.phase, left.pattern, left.metric_name].join('|').localeCompare(
      [right.source_file, right.phase, right.pattern, right.metric_name].join('|')
    );
  });

  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(jsonOutput, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  fs.writeFileSync(csvOutput, `${toCsv(records)}\n`, 'utf8');

  console.log(`Normalized ${records.length} analysis rows from ${inputFiles.length} raw file(s).`);
  console.log(`JSON: ${jsonOutput}`);
  console.log(`CSV: ${csvOutput}`);
}

function listInputFiles(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .filter((entry) => isRelevantInputFile(entry.name))
    .map((entry) => path.join(baseDir, entry.name))
    .filter((filePath) => !filePath.endsWith('.analysis.json'));
}

function isRelevantInputFile(fileName) {
  const lower = fileName.toLowerCase();
  if (lower === 'smoke-pattern-results.json') {
    return true;
  }

  if (lower.startsWith('test-')) {
    return false;
  }

  return /^(api|projection|batch)-(baseline|ramp|sustained|spike|failure)(-before)?\.json$/.test(lower);
}

function parseResultFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) {
    return [];
  }

  const phase = inferPhase(path.basename(filePath));
  const sourceFile = path.basename(filePath);

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return summarizeSmokeRows(parsed, sourceFile, phase);
      }
    } catch (error) {
      return [];
    }
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.metrics && typeof parsed.metrics === 'object') {
        return summarizeK6Export(parsed.metrics, sourceFile, phase);
      }

      if (Array.isArray(parsed.data)) {
        return summarizeSmokeRows(parsed.data, sourceFile, phase);
      }
    }
  } catch (error) {
    // Fall through to line-delimited parsing.
  }

  return summarizeK6Samples(raw, sourceFile, phase);
}

function summarizeSmokeRows(rows, sourceFile, phase) {
  const patternGroups = new Map();

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }

    const pattern = normalizePattern(row.pattern || row.source || 'smoke');
    if (!patternGroups.has(pattern)) {
      patternGroups.set(pattern, { latency: [], freshnessLag: [] });
    }

    const group = patternGroups.get(pattern);
    addNumeric(group.latency, row.latency_ms);
    addNumeric(group.freshnessLag, freshnessLagFromLabel(row.freshness));
  }

  const records = [];
  for (const [pattern, group] of patternGroups.entries()) {
    records.push(makeRecord({
      sourceFile,
      sourceKind: 'smoke-array',
      phase,
      pattern,
      metricName: 'latency_ms',
      unit: 'ms',
      stats: stats(group.latency),
      recordKind: 'smoke-summary',
    }));

    if (group.freshnessLag.length > 0) {
      records.push(makeRecord({
        sourceFile,
        sourceKind: 'smoke-array',
        phase,
        pattern,
        metricName: 'freshness_lag_ms',
        unit: 'ms',
        stats: stats(group.freshnessLag),
        recordKind: 'smoke-summary',
      }));
    }
  }

  return records;
}

function summarizeK6Export(metrics, sourceFile, phase) {
  const records = [];

  for (const [metricName, metric] of Object.entries(metrics)) {
    if (!metric || typeof metric !== 'object') {
      continue;
    }

    const values = metric.values && typeof metric.values === 'object' ? metric.values : {};
    const statsRecord = {
      count: asNumber(values.count ?? values['count']),
      min: asNumber(values.min),
      max: asNumber(values.max),
      mean: asNumber(values.avg ?? values.mean),
      p50: asNumber(values.med ?? values['p(50)'] ?? values.p50),
      p95: asNumber(values['p(95)'] ?? values.p95),
      p99: asNumber(values['p(99)'] ?? values.p99),
      sum: asNumber(values.sum),
    };

    records.push(makeRecord({
      sourceFile,
      sourceKind: 'k6-summary-export',
      phase,
      pattern: inferPattern(sourceFile),
      metricName,
      unit: metric.contains || metric.type || '',
      stats: statsRecord,
      recordKind: 'k6-summary',
    }));
  }

  return records;
}

function summarizeK6Samples(raw, sourceFile, phase) {
  const groups = new Map();
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      continue;
    }

    const metricName = parsed.metric || parsed.name;
    const value = parsed?.data?.value ?? parsed.value;
    if (!metricName || typeof value !== 'number' || Number.isNaN(value)) {
      continue;
    }

    if (!groups.has(metricName)) {
      groups.set(metricName, []);
    }

    groups.get(metricName).push(value);
  }

  const records = [];
  for (const [metricName, values] of groups.entries()) {
    records.push(makeRecord({
      sourceFile,
      sourceKind: 'k6-sample-stream',
      phase,
      pattern: inferPattern(sourceFile),
      metricName,
      unit: '',
      stats: stats(values),
      recordKind: 'k6-summary',
    }));
  }

  return records;
}

function makeRecord({ sourceFile, sourceKind, phase, pattern, metricName, unit, stats: metricStats, recordKind }) {
  return {
    source_file: sourceFile,
    source_kind: sourceKind,
    phase: phase || 'unknown',
    pattern: pattern || 'unknown',
    record_kind: recordKind,
    metric_name: metricName,
    unit: unit || '',
    count: metricStats.count,
    mean: metricStats.mean,
    min: metricStats.min,
    p50: metricStats.p50,
    p95: metricStats.p95,
    p99: metricStats.p99,
    max: metricStats.max,
    sum: metricStats.sum,
  };
}

function stats(values) {
  const numericValues = values.map(asNumber).filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (numericValues.length === 0) {
    return blankStats();
  }

  const sorted = [...numericValues].sort((left, right) => left - right);
  const sum = sorted.reduce((accumulator, value) => accumulator + value, 0);

  return {
    count: sorted.length,
    mean: sum / sorted.length,
    min: sorted[0],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
    sum,
  };
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) {
    return null;
  }

  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(percentileValue * sortedValues.length) - 1));
  return sortedValues[index];
}

function blankStats() {
  return {
    count: 0,
    mean: null,
    min: null,
    p50: null,
    p95: null,
    p99: null,
    max: null,
    sum: null,
  };
}

function addNumeric(target, value) {
  const numericValue = asNumber(value);
  if (typeof numericValue === 'number' && Number.isFinite(numericValue)) {
    target.push(numericValue);
  }
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function freshnessLagFromLabel(label) {
  if (typeof label !== 'string') {
    return null;
  }

  if (label === 'real-time') {
    return 0;
  }

  const match = label.match(/lag-(\d+)ms/i);
  return match ? Number(match[1]) : null;
}

function normalizePattern(pattern) {
  const value = String(pattern || '').toLowerCase();
  if (value.includes('api')) {
    return 'api-pattern';
  }

  if (value.includes('projection')) {
    return 'projection-pattern';
  }

  if (value.includes('batch')) {
    return 'batch-pattern';
  }

  return value || 'unknown';
}

function inferPattern(fileName) {
  return normalizePattern(fileName);
}

function inferPhase(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.includes('baseline')) {
    return 'baseline';
  }
  if (lower.includes('ramp')) {
    return 'ramp';
  }
  if (lower.includes('sustained')) {
    return 'sustained';
  }
  if (lower.includes('spike')) {
    return 'spike';
  }
  if (lower.includes('failure')) {
    return 'failure';
  }
  if (lower.includes('smoke')) {
    return 'smoke';
  }
  return 'unknown';
}

function toCsv(records) {
  const columns = [
    'source_file',
    'source_kind',
    'phase',
    'pattern',
    'record_kind',
    'metric_name',
    'unit',
    'count',
    'mean',
    'min',
    'p50',
    'p95',
    'p99',
    'max',
    'sum',
  ];

  const header = columns.join(',');
  const rows = records.map((record) => columns.map((column) => csvCell(record[column])).join(','));
  return [header, ...rows].join('\n');
}

function csvCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  if (/[\",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function resolveOption(flagName, defaultValue) {
  const index = process.argv.indexOf(flagName);
  if (index >= 0 && process.argv[index + 1]) {
    return path.resolve(process.cwd(), process.argv[index + 1]);
  }

  return defaultValue;
}