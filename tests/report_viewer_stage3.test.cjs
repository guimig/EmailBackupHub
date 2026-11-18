'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const Filters = require('../assets/js/report-viewer-filters.js');
const Guard = require('../assets/js/report-schema-guard.js');

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

function fixture(params = '?report=data/reports/novo.json', options = {}) {
  const source = fs.readFileSync(path.join(ROOT, 'assets/js/report-viewer.js'), 'utf8');
  const cutoff = source.indexOf("    byId('globalSearch').addEventListener('input',");
  assert.ok(cutoff > 0, 'Bootstrap do viewer mudou');
  const elements = new Map();
  const frameQueue = [];
  const tbody = {
    innerHTML: '',
    insertAdjacentHTML(position, markup) {
      assert.equal(position, 'beforeend');
      this.innerHTML += markup;
    }
  };
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
    ...(options.animation ? { requestAnimationFrame: callback => frameQueue.push(callback) } : {}),
    window: { EmailBackupHubFilters: Filters, EmailBackupHubSchemaGuard: Guard },
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
    '  size: value => { pageSize = normalizedPageSize(value); currentPage = 1; },',
    '  render: () => renderRows(),',
    '  filtered: () => filteredRows(),',
    '  exportAll: () => { exportCsv(); return csvOutput; },',
    '  restore: () => restoreStateFromUrl(),',
    '  getPage: () => currentPage, getPageSize: () => pageSize,',
    '  getFilters: () => columnFilters,',
    '  getSort: () => columnSort,',
    '  getGroup: () => groupColumn,',
    '  getVisible: () => [...visibleColumns]',
    '};'
  ].join('\n');
  vm.runInContext(source.slice(0, cutoff) + driver, context, { filename: 'report-viewer.js' });
  return { api: context.driver, el: getElementById, tbody, location, frameQueue };
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
  assert.equal((tbody.innerHTML.match(/data-row-index="/g) || []).length, 25);
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

test('3254 registros: paginação, filtro por zero, exportação integral e execução repetida', () => {
  const { api, tbody, el } = fixture();
  api.set(makeReport(3254));
  const start = performance.now();
  api.render();
  const elapsed = performance.now() - start;
  assert.equal(api.filtered().length, 3254);
  assert.equal(el('pageNumber').textContent, 'Página 1 de 131');
  assert.equal((tbody.innerHTML.match(/data-row-index="/g) || []).length, 25);
  assert.ok(elapsed < 5000, 'Renderização inicial excedeu 5 segundos: ' + elapsed.toFixed(1) + 'ms');
  api.filter('Saldo', { op: 'is_zero' });
  api.render();
  assert.equal(api.filtered().length, 651);
  assert.equal((tbody.innerHTML.match(/data-row-index="/g) || []).length, 25);
  assert.equal(api.exportAll().split('\n').length, 652);
  api.render();
  assert.equal(api.filtered().length, 651);
});

test('relatório vazio continua legível e não cria linhas fictícias', () => {
  const { api, tbody, el } = fixture();
  api.set(makeReport(0));
  api.render();
  assert.equal(api.filtered().length, 0);
  assert.match(tbody.innerHTML, /Nenhum registro/);
  assert.equal(el('pageNumber').textContent, 'Página 1 de 1');
});

test('seletor amplia para 250, 500, 1000 e todas as linhas, sem perder paginacao', () => {
  const { api, tbody, el, location } = fixture();
  api.set(makeReport(3254));
  for (const size of [250, 500, 1000]) {
    api.size(size);
    api.render();
    assert.equal(api.getPageSize(), size);
    assert.equal((tbody.innerHTML.match(/data-row-index="/g) || []).length, size);
    assert.equal(el('pageSize').value, String(size));
    assert.match(location.search, new RegExp('ps=' + size));
  }
  api.size('all');
  api.render();
  assert.equal(api.getPageSize(), 'all');
  assert.equal((tbody.innerHTML.match(/data-row-index="/g) || []).length, 3254);
  assert.equal(el('pageInfo').textContent, 'Exibindo todas as 3254 linhas filtradas.');
  assert.equal(el('pageNumber').textContent, 'Página 1 de 1');
  assert.equal(el('previousPage').disabled, true);
  assert.equal(el('nextPage').disabled, true);
  assert.equal(el('pageSize').value, 'all');
  assert.match(location.search, /ps=all/);
  api.filter('Saldo', {op:'is_zero'});
  api.render();
  assert.equal((tbody.innerHTML.match(/data-row-index="/g) || []).length, 651);
  assert.equal(api.exportAll().split('\n').length, 652);
});

test('URL com ps=all volta a uma pagina unica, preserva filtro e dispensa p= antigo', () => {
  const { api, el, location } = fixture('?report=data/reports/novo.json&ps=all&p=99&f1=0');
  api.set(makeReport(135));
  api.restore();
  api.render();
  assert.equal(api.getPageSize(), 'all');
  assert.equal(api.getPage(), 1);
  assert.equal(api.filtered().length, 27);
  assert.equal(el('pageNumber').textContent, 'Página 1 de 1');
  assert.match(location.search, /ps=all/);
  assert.doesNotMatch(location.search, /[?&]p=/);
  assert.equal(api.getFilters().Saldo, '0');
  const invalid = fixture('?report=data/reports/novo.json&ps=999999');
  invalid.api.set(makeReport());
  invalid.api.restore();
  assert.equal(invalid.api.getPageSize(), 50);
});

test('todas as linhas agrupadas exibem subtotal correto uma vez, sem dividir o grupo', () => {
  const { api, tbody } = fixture();
  api.set(makeReport(135));
  api.group('Grupo');
  api.sum('Saldo');
  api.size('all');
  api.render();
  assert.equal((tbody.innerHTML.match(/data-row-index="/g) || []).length, 135);
  assert.equal((tbody.innerHTML.match(/class="group-row"/g) || []).length, 2);
  assert.equal((tbody.innerHTML.match(/Total do grupo/g) || []).length, 2);
  assert.equal((tbody.innerHTML.match(/Total geral do agrupamento/g) || []).length, 1);
});

test('carregamento progressivo pode ser interrompido por outro filtro, sem linhas antigas', () => {
  const { api, tbody, el, frameQueue } = fixture('?report=data/reports/novo.json', { animation: true });
  api.set(makeReport(3254));
  api.group('Grupo');
  api.sum('Saldo');
  api.size('all');
  api.render();
  assert.equal((tbody.innerHTML.match(/data-row-index="/g) || []).length, 150);
  assert.match(el('pageInfo').textContent, /Carregando 150 de 3254/);
  assert.ok(frameQueue.length);
  api.filter('Saldo', {op:'is_zero'});
  api.render();
  assert.equal((tbody.innerHTML.match(/data-row-index="/g) || []).length, 150);
  let frames = 0;
  while (frameQueue.length) {
    frameQueue.shift()();
    frames++;
    assert.ok(frames < 100, 'Numa sessao real, os lotes precisam finalizar');
  }
  assert.equal((tbody.innerHTML.match(/data-row-index="/g) || []).length, 651);
  assert.equal((tbody.innerHTML.match(/class="group-row"/g) || []).length, 2);
  assert.equal((tbody.innerHTML.match(/Total do grupo/g) || []).length, 2);
  assert.equal((tbody.innerHTML.match(/Total geral do agrupamento/g) || []).length, 1);
  assert.equal(el('pageInfo').textContent, 'Exibindo todas as 651 linhas filtradas.');
});

test('todas as linhas de relatorio vazio mantem controles e estado consistentes', () => {
  const { api, tbody, el } = fixture();
  api.set(makeReport(0));
  api.size('all');
  api.render();
  assert.match(tbody.innerHTML, /Nenhum registro/);
  assert.equal(el('pageInfo').textContent, 'Nenhum registro encontrado.');
  assert.equal(el('pageNumber').textContent, 'Página 1 de 1');
  assert.equal(el('nextPage').disabled, true);
});

test('link compartilhado com nomes conserva filtros e controles após troca de ordem', () => {
  const first = fixture();
  const initial=makeReport(135);
  first.api.set(initial);
  first.api.filter('Saldo', {op:'is_zero'});
  first.api.group('Grupo');
  first.api.sum('Saldo');
  first.api.render();
  assert.match(first.location.search,/sv=2/);
  const moved=makeReport(135);
  moved.columns=['Competência','Grupo','Saldo','Identificador','Nova coluna'];
  moved.column_schema=[...initial.column_schema,{name:'Nova coluna',type:'text'}];
  const second=fixture(first.location.search);
  second.api.set(moved);
  second.api.restore();
  second.api.render();
  assert.equal(second.api.getFilters().Saldo.op,'is_zero');
  assert.equal(second.api.getGroup(),'Grupo');
  assert.equal(second.api.filtered().length,27);
  assert.equal(second.api.getFilters().Competência,undefined);
  assert.match(second.location.search,/sv=2/);
  assert.ok(second.api.getVisible().includes('Saldo'));
});

test('filtro em coluna removida é descartado e não migra para a coluna seguinte', () => {
  const first=fixture();
  first.api.set(makeReport());
  first.api.filter('Saldo', {op:'is_zero'});
  first.api.render();
  const updated=makeReport();
  updated.columns=['Identificador','Competência','Grupo'];
  updated.column_schema=updated.column_schema.filter(item=>item.name!=='Saldo');
  const second=fixture(first.location.search);
  second.api.set(updated);
  second.api.restore();
  second.api.render();
  assert.equal(second.api.getFilters().Saldo,undefined);
  assert.equal(second.api.getFilters().Competência,undefined);
  assert.equal(second.api.filtered().length,135);
});
