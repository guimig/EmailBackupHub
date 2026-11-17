'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/js/dashboard.js'), 'utf8');
const start = source.indexOf('    async function loadFinancialReports() {');
const end = source.indexOf('    function reportStatus(', start);
assert.ok(start > 0 && end > start, 'Financial loader must remain available');

const slug = 'restos-a-pagar-rap';
const report = {
  slug, json_path: 'data/reports/' + slug + '.json',
  series_path: 'data/series/' + slug + '.json'
};

function fixture(fetch) {
  const context = vm.createContext({ fetch, console: { warn() {} } });
  const code = [
    "let indexData = { generated_at: '2026-11-17T10:00:00-03:00' };",
    'let reports = [' + JSON.stringify(report) + '];',
    'let financialReports = {};',
    source.slice(start, end),
    'globalThis.api = { load: loadFinancialReports, get: () => financialReports };'
  ].join('\n');
  vm.runInContext(code, context);
  return context.api;
}

test('uses compact summary without fetching original reports', async () => {
  const calls = [];
  const api = fixture(async url => {
    calls.push(url);
    assert.equal(url, 'data/dashboard-summary.json');
    return { ok: true, json: async () => ({
      summary_version: '1', generated_at: '2026-11-17T10:00:00-03:00',
      reports: { [slug]: { slug, metrics: { rap_pago: 250000 }, metrics_meta: { rap_pago: { status: 'ok', source: 'totals' } } } }
    }) };
  });
  await api.load();
  assert.deepEqual(calls, ['data/dashboard-summary.json']);
  assert.equal(api.get()[slug].metrics.rap_pago, 250000);
});

test('outdated summary falls back to the original JSONs', async () => {
  const calls = [];
  const api = fixture(async url => {
    calls.push(url);
    if (url === 'data/dashboard-summary.json') return {
      ok: true, json: async () => ({ summary_version: '1', generated_at: 'outdated', reports: { [slug]: { slug } } })
    };
    if (url === report.json_path) return { ok: true, json: async () => ({ slug, metrics: { rap_pago: 123 } }) };
    if (url === report.series_path) return { ok: true, json: async () => ({ series: [] }) };
    throw new Error('Unexpected URL ' + url);
  });
  await api.load();
  assert.ok(calls.includes(report.json_path));
  assert.ok(calls.includes(report.series_path));
  assert.equal(api.get()[slug].metrics.rap_pago, 123);
});

test('missing summary does not break legacy deployment', async () => {
  const calls = [];
  const api = fixture(async url => {
    calls.push(url);
    if (url === 'data/dashboard-summary.json') return { ok: false, status: 404 };
    if (url === report.json_path) return { ok: true, json: async () => ({ slug, metrics: {} }) };
    if (url === report.series_path) return { ok: true, json: async () => ({ series: [] }) };
    throw new Error(url);
  });
  await api.load();
  assert.equal(api.get()[slug].slug, slug);
  assert.equal(calls[0], 'data/dashboard-summary.json');
});
