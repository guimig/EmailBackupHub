'use strict';

// Read-only regression tests: never access IMAP, Git, or generated HTML reports.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');

function fakeReport(slug, title, periodicidade = 'diaria') {
  return {
    slug, title, date: '17/11/2026', date_iso: '2026-11-17',
    html_path: slug + '.html', json_path: 'data/reports/' + slug + '.json',
    series_path: 'data/series/' + slug + '.json',
    metadata: { periodicidade, idade_dias: 0, status: 'atualizado', limite_dias: 1 },
    quality: { ok: true, issues: [], warnings: [] }
  };
}

function fixture() {
  const source = fs.readFileSync(path.join(ROOT, 'assets/js/dashboard.js'), 'utf8');
  const cut = source.indexOf("    byId('search').addEventListener('input',");
  assert.ok(cut > 0, 'Ponto de inicializacao alterado; atualizar o teste');
  const elements = new Map();
  const requests = [];
  const getElementById = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: '', textContent: '', innerHTML: '',
        insertAdjacentHTML(_p, html) { this.innerHTML += html; }
      });
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById, documentElement: { dataset: {} } },
    localStorage: { getItem: () => null, setItem: () => {} },
    console: { error() {}, warn() {} },
    EmailBackupHub: {
      reportDefinition: () => ({}),
      loadReportDefinitions: async () => ({})
    },
    fetch: async url => {
      requests.push(url);
      if (url === 'data/index.json') return { ok: true, json: async () => ({ reports: [fakeReport('novo-relatorio', 'Novo relatorio', 'semestral')] }) };
      if (url === 'data/search-index.json') return { ok: true, json: async () => ({ documents: [{ slug: 'novo-relatorio', text: 'palavra-exclusiva' }] }) };
      throw new Error('Fetch inesperado: ' + url);
    }
  });
  vm.runInContext(source.slice(0, cut) + `
    globalThis.expose = {
      loadData, renderReportCatalog, handleSearchInput, latestFinancialDate, applyTheme,
      csvCell, setFinance: docs => { financialReports = docs; },
      setFinanceFunctions: (load, render) => { loadFinancialReports = load; renderFinancialSummary = render; },
      getSearchStatus: () => searchIndexState,
      getSearchPromise: () => searchIndexPromise,
      getReports: () => reports
    };
  `, context, { filename: 'dashboard.js' });
  return { api: context.expose, el: getElementById, requests, context };
}

function viewerCsv() {
  const source = fs.readFileSync(path.join(ROOT, 'assets/js/report-viewer.js'), 'utf8');
  const cut = source.indexOf("    byId('globalSearch').addEventListener('input',");
  assert.ok(cut > 0, 'Ponto de inicializacao do viewer alterado');
  const context = vm.createContext({});
  vm.runInContext(source.slice(0, cut) + ';globalThis.csv = csvCell;', context);
  return context.csv;
}

test('novo tipo de relatorio surge no catalogo sem codigo especifico e antes do financeiro', async () => {
  const { api, el, requests } = fixture();
  let resolveFinance;
  let painted = 0;
  api.setFinanceFunctions(
    () => new Promise(resolve => { resolveFinance = resolve; }),
    () => { painted++; }
  );
  await api.loadData();
  assert.match(el('rows').innerHTML, /Novo relatorio/);
  assert.match(el('periodicity').innerHTML, /semestral/);
  assert.deepEqual(requests, ['data/index.json']);
  assert.equal(painted, 0);
  resolveFinance();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(painted, 1);
});

test('filtragem nao recalcula financeiro e tema continua repintando os graficos', () => {
  const { api, el } = fixture();
  let painted = 0;
  api.setFinanceFunctions(async () => {}, () => { painted++; });
  api.getReports().push({ ...fakeReport('a', 'A'), displayTitle: 'A', searchText: '' });
  api.renderReportCatalog();
  el('periodicity').value = 'diaria';
  api.renderReportCatalog();
  assert.equal(painted, 0);
  api.setFinance({ a: { date_iso: '2026-11-17' } });
  api.applyTheme('dark');
  assert.equal(painted, 1);
});

test('busca detalhada carrega uma unica vez somente apos digitacao', async () => {
  const { api, el, requests } = fixture();
  api.getReports().push({ ...fakeReport('novo-relatorio', 'Novo relatorio'), displayTitle: 'Novo relatorio', searchText: '' });
  assert.equal(api.getSearchStatus(), 'idle');
  el('search').value = 'palavra-exclusiva';
  api.handleSearchInput();
  api.handleSearchInput();
  assert.equal(requests.filter(x => x === 'data/search-index.json').length, 1);
  await api.getSearchPromise();
  assert.equal(api.getSearchStatus(), 'ready');
  assert.match(el('rows').innerHTML, /Novo relatorio/);
});

test('erro de rede na busca mantem resultados por metadados', async () => {
  const { api, el, context } = fixture();
  api.getReports().push({ ...fakeReport('novo-relatorio', 'Novo relatorio'), displayTitle: 'Novo relatorio', searchText: '' });
  context.fetch = async () => { throw new Error('offline'); };
  el('search').value = 'novo';
  api.handleSearchInput();
  await api.getSearchPromise();
  assert.equal(api.getSearchStatus(), 'error');
  assert.match(el('rows').innerHTML, /indisponível/);
  assert.match(el('rows').innerHTML, /Novo relatorio/);
});

test('data de relatorio mais recente respeita cronologia ISO', () => {
  const { api } = fixture();
  api.setFinance({ a: { date_iso: '2026-10-31' }, b: { date_iso: '2026-11-02' } });
  assert.equal(api.latestFinancialDate(), 'Último relatório: 02/11/2026');
});

test('exportacoes CSV conservam zero, numeros negativos e neutralizam formulas', () => {
  const { api } = fixture();
  for (const csvCell of [api.csvCell, viewerCsv()]) {
    assert.equal(csvCell(0), '"0"');
    assert.equal(csvCell('=1+1'), '"\'=1+1"');
    assert.equal(csvCell('@exec'), '"\'@exec"');
    assert.equal(csvCell(-25), '"-25"');
    assert.equal(csvCell('texto "com aspas"'), '"texto ""com aspas"""');
  }
});

test('a pagina legada e pipeline nao sao alterados por esta suite', () => {
  for (const file of ['relatorios.html', 'main.py', 'email_processor.py', 'html_generator.py', 'data_generator.py']) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), file);
  }
});
