'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const Filters = require('../assets/js/report-viewer-filters.js');

test('BRL, vazio e zero sao valores distintos', () => {
  assert.equal(Filters.parseNumber('R$ 1.234,56'), 1234.56);
  assert.equal(Filters.parseNumber('(2.150,70)'), -2150.7);
  assert.equal(Filters.parseNumber('0'), 0);
  assert.equal(Filters.parseNumber(''), null);
  assert.equal(Filters.parseNumber('23349.000225/2025-97'), null);
  assert.equal(Filters.matches('0', { op: 'is_zero' }, { type: 'money' }), true);
  assert.equal(Filters.matches('', { op: 'is_zero' }, { type: 'money' }), false);
  assert.equal(Filters.matches('', { op: 'is_empty' }, { type: 'money' }), true);
  assert.equal(Filters.matches('1.234,56', { op: 'range', min: '1000', max: '2000' }, { type: 'money' }), true);
  assert.equal(Filters.matches('999,99', { op: 'range', min: '1000', max: '' }, { type: 'money' }), false);
  assert.equal(Filters.validFilter({ op: 'range', min: 'abc', max: '' }, { type: 'money' }), false);
  assert.equal(Filters.validFilter({ op: 'range', min: '200', max: '100' }, { type: 'money' }), false);
});

test('datas civis e periodos 13/14 com ordenacao contabil', () => {
  assert.equal(Filters.parseDate('31/02/2025'), null);
  assert.equal(Filters.parseDate('28/02/2025'), 20250228);
  assert.equal(Filters.matches('03/02/2026', { op: 'range', min: '2026-02-01', max: '2026-02-05' }, { type: 'date' }), true);
  assert.equal(Filters.periodCode('JAN/2025'), 202501);
  assert.equal(Filters.periodCode('013/2025'), 202513);
  assert.equal(Filters.periodCode('014/2025'), 202514);
  assert.equal(Filters.periodCode('015/2025'), null);
  const values = ['014/2025', 'JAN/2025', '013/2025', 'DEZ/2025'];
  values.sort((a, b) => Filters.compare(a, b, { type: 'period' }));
  assert.deepEqual(values, ['JAN/2025', 'DEZ/2025', '013/2025', '014/2025']);
});

test('identificadores nao viram numero e selecao multipla funciona com OU', () => {
  const report = { column_schema: [{ name: 'NE CCor', type: 'identifier' }] };
  assert.equal(Filters.columnMeta(report, 'NE CCor').type, 'identifier');
  assert.ok(Filters.compare('0010', '002', { type: 'identifier' }) < 0);
  assert.equal(Filters.matches('158459264222026NE000019', { op: 'contains', value: 'NE000019' }, { type: 'identifier' }), true);
  assert.equal(Filters.matches('PJ', { op: 'in', values: ['PF', 'PJ'] }, { type: 'category' }), true);
  assert.equal(Filters.matches('PC', { op: 'in', values: ['PF', 'PJ'] }, { type: 'category' }), false);
});

test('qualquer relatorio novo tem tipo generico sem cadastrar slug', () => {
  const unknown = { slug: 'relatorio-futuro', columns: ['PTRES', 'Saldo - R$', 'Outra coluna'] };
  assert.equal(Filters.columnMeta(unknown, 'PTRES').type, 'identifier');
  assert.equal(Filters.columnMeta(unknown, 'Saldo - R$').type, 'money');
  assert.equal(Filters.columnMeta(unknown, 'Outra coluna').type, 'text');
  const rows = Array.from({ length: 150 }, (_, i) => ({ 'Outra coluna': 'valor-' + i }));
  assert.equal(Filters.distinctOptions(rows, 'Outra coluna', { type: 'category' }), null);
});

function fixture(params = '?report=data/reports/novo.json') {
  const source = fs.readFileSync(path.join(ROOT, 'assets/js/report-viewer.js'), 'utf8');
  const cutoff = source.indexOf("    byId('globalSearch').addEventListener('input',");
  assert.ok(cutoff > 0, 'Bootstrap do viewer mudou');
  const elements = new Map();
  const tbody = { innerHTML: '' };
  const getElementById = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', checked: id === 'showTotals', disabled: false, hidden: false,
      innerHTML: '', textContent: '',
      querySelector: selector => selector === 'tbody' ? tbody : null,
      querySelectorAll: () => []
    });
    return elements.get(id);
  };
  const location = { search: params, pathname: '/EmailBackupHub/report-viewer.html' };
  const history = { replaceState(_state, _title, url) {
    location.search = '?' + url.split('?').slice(1).join('?');
  } };
  const context = vm.createContext({
    window: { EmailBackupHubFilters: Filters },
    document: { getElementById },
    location, history, URLSearchParams, console,
    EmailBackupHub: { reportDefinition: () => ({}) },
    setTimeout, clearTimeout
  });
  const driver = [
    "let csvOutput = '';",
    "download = (_name, content) => { csvOutput = content; };",
    'globalThis.driver = {',
    '  set: doc => { report = doc; columnFilters = {}; columnSort = {column:null,direction:""};',
    '    visibleColumns = new Set(doc.columns); columnMetaCache = new Map(); columnOptionsCache = new Map();',
    '    filteredCache = null; currentPage = 1; pageSize = 25; },',
    '  search: value => { byId("globalSearch").value = value; },',
    '  filter: (column, filter) => { columnFilters[column] = filter; },',
    '  group: column => { groupColumn = column; },',
    '  sum: column => { groupSumColumns = new Set([column]); },',
    '  page: value => { currentPage = value; },',
    '  render: () => renderRows(),',
    '  filtered: () => filteredRows(),',
    '  exportAll: () => { exportCsv(); return csvOutput; },',
    '  restore: () => restoreStateFromUrl(),',
    '  getPage: () => currentPage, getPageSize: () => pageSize,',
    '  getFilters: () => columnFilters',
    '};'
  ].join('\n');
  vm.runInContext(source.slice(0, cutoff) + driver, context, { filename: 'report-viewer.js' });
  return { api: context.driver, el: getElementById, tbody, location };
}

function makeReport(length = 135) {
  const columns = ['Identificador', 'Saldo', 'Competência', 'Grupo'];
  const rows = Array.from({ length }, (_, index) => ({
    Identificador: String(index).padStart(4, '0'),
    Saldo: index % 5 === 0 ? '0' : '1.234,56',
    'Competência': index % 2 ? '013/2025' : '014/2025',
    Grupo: index < 80 ? 'A' : 'B'
  }));
  return {
    slug: 'relatorio-futuro', title: 'Relatorio futuro', columns, rows,
    row_types: rows.map(raw => ({ type: 'data', raw })),
    column_schema: [
      { name: 'Identificador', type: 'identifier' },
      { name: 'Saldo', type: 'money' },
      { name: 'Competência', type: 'period' },
      { name: 'Grupo', type: 'category' }
    ]
  };
}

test('pagina limita DOM mas CSV exporta TODOS os registros filtrados', () => {
  const { api, tbody, el } = fixture();
  api.set(makeReport());
  api.filter('Competência', { op: 'in', values: ['013/2025', '014/2025'] });
  api.render();
  const first = api.filtered();
  assert.equal(first.length, 135);
  assert.equal(el('pageNumber').textContent, 'Página 1 de 6');
  assert.equal((tbody.innerHTML.match(/<tr class="/g) || []).length, 25);
  api.page(2);
  api.render();
  assert.equal(api.filtered(), first);
  assert.equal((tbody.innerHTML.match(/<tr class="/g) || []).length, 25);
  const csv = api.exportAll();
  assert.equal(csv.split('\n').length, 136);
  assert.match(csv, /"0000"/);
});

test('agrupamento multipagina nunca calcula subtotal parcial', () => {
  const { api, tbody } = fixture();
  api.set(makeReport());
  api.group('Grupo');
  api.sum('Saldo');
  api.page(4);
  api.render(); // Rows 76-100 cross the 80-row group boundary.
  assert.match(tbody.innerHTML, /Grupo: A/);
  assert.match(tbody.innerHTML, /Grupo: B/);
  assert.match(tbody.innerHTML, /Total do grupo/);
  assert.equal((tbody.innerHTML.match(/class="group-row"/g) || []).length, 2);
  assert.equal((tbody.innerHTML.match(/<tr class=""/g) || []).length, 25);
});

test('URLs legadas f0 e novos filtros tf0 e pagina permanecem compartilháveis', () => {
  const { api, location } = fixture('?report=data/reports/novo.json&f1=0&ps=100&p=2');
  api.set(makeReport());
  api.restore();
  assert.equal(api.getFilters().Saldo, '0');
  assert.equal(api.getPageSize(), 100);
  assert.equal(api.getPage(), 2);
  api.render();
  assert.equal(api.filtered().length, 27);
  assert.equal(api.getPage(), 1);
  assert.match(location.search, /f1=0/);
  api.filter('Saldo', { op: 'is_zero' });
  api.render();
  assert.equal(api.filtered().length, 27);
  assert.match(decodeURIComponent(location.search), /tf1=/);
});
