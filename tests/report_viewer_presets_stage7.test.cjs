'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Views = require('../assets/js/report-viewer-presets.js');
const Filters = require('../assets/js/report-viewer-filters.js');

function memoryStorage() {
  const db = new Map();
  return {
    getItem: key => db.has(key) ? db.get(key) : null,
    setItem: (key, value) => db.set(key, value),
    db
  };
}

function fixture() {
  const columns = ['NE CCor', 'Competência', 'Saldo - R$', 'Descrição'];
  return {
    slug: 'novo-relatorio-2026',
    columns,
    column_schema: [
      { name: columns[0], type: 'identifier' },
      { name: columns[1], type: 'period' },
      { name: columns[2], type: 'money' },
      { name: columns[3], type: 'text' }
    ]
  };
}

function state() {
  return {
    search: 'empenhos especiais',
    visibleColumns: ['NE CCor', 'Competência', 'Saldo - R$'],
    columnFilters: {
      'NE CCor': { op: 'contains', value: 'NE0001' },
      'Competência': { op: 'in', values: ['013/2025', '014/2025'] },
      'Saldo - R$': { op: 'is_zero' }
    },
    sort: { column: 'Competência', direction: 'az' },
    groupColumn: 'NE CCor',
    groupSumColumns: ['Saldo - R$'],
    showTotals: false,
    pageSize: 100,
    wrapCells: true,
    baseColumnWidth: 300,
    columnWidths: { 'NE CCor': 350 }
  };
}

test('save and restore one view without storing report rows, valid for new report slugs', () => {
  const storage = memoryStorage();
  const report = fixture();
  const saved = Views.save(storage, report, '  Saldo   especial  ', state(), Filters);
  assert.equal(saved.ok, true);
  assert.equal(saved.name, 'Saldo especial');
  const stored = storage.getItem(Views.keyFor(report));
  assert.ok(!stored.includes('"rows"'));
  assert.ok(!stored.includes('SIAFI') && !stored.includes('hash_conteudo'));
  const retrieved = Views.read(storage, report).views[0];
  assert.equal(retrieved.name, 'Saldo especial');
  assert.deepEqual(Views.reconcile(report, retrieved.snapshot, Filters).state.columnFilters.Competência,
    { op: 'in', values: ['013/2025', '014/2025'] });
  assert.equal(retrieved.snapshot.sort.column, 'Competência');
  assert.equal(retrieved.snapshot.pageSize, 100);
  assert.equal(retrieved.snapshot.columnWidths['NE CCor'], 350);
  assert.equal(Views.read(storage, { ...report, slug: 'outro-relatorio' }).views.length, 0);
});

test('column names survive reordering and removed columns are safely ignored', () => {
  const report = fixture();
  const snapshot = Views.capture(report, state(), Filters);
  const changed = {
    ...report,
    columns: ['Saldo - R$', 'NE CCor', 'Competência', 'Novo campo'],
    column_schema: report.column_schema.slice(0, 3)
  };
  const { state: restored, removedColumns } = Views.reconcile(changed, snapshot, Filters);
  assert.deepEqual(restored.visibleColumns, ['NE CCor', 'Competência', 'Saldo - R$']);
  assert.equal(restored.sort.column, 'Competência');
  assert.equal(restored.columnFilters['Saldo - R$'].op, 'is_zero');
  assert.ok(!restored.columnFilters['Descrição']);
  assert.equal(restored.columnWidths['NE CCor'], 350);
  assert.deepEqual(removedColumns, []);
  const changedLess = { ...changed, columns: changed.columns.filter(c => c !== 'Competência') };
  const recovered = Views.reconcile(changedLess, snapshot, Filters);
  assert.ok(recovered.removedColumns.includes('Competência'));
  assert.equal(recovered.state.sort.column, null);
  assert.equal(recovered.state.columnFilters.Competência, undefined);
});

test('invalid filters, widths and aggregation are dropped without recalculating monetary sums', () => {
  const report = fixture();
  const spec = {
    search: 'x'.repeat(800), visibleColumns: ['NE CCor', 'Saldo - R$'],
    columnFilters: {
      'Saldo - R$': { op: 'range', min: 'not a number', max: '10' },
      'NE CCor': { op: 'contains', value: 'NE' },
      'Descrição': { op: 'is_zero' }
    },
    groupSumColumns: ['NE CCor', 'Saldo - R$'],
    baseColumnWidth: 900,
    columnWidths: { 'Saldo - R$': 999, 'NE CCor': 350 },
    pageSize: -1, sort: { column: 'NE CCor', direction: 'invalid' }
  };
  const restored = Views.reconcile(report, spec, Filters).state;
  assert.equal(restored.columnFilters['Saldo - R$'], undefined);
  assert.equal(restored.columnFilters['NE CCor'].value, 'NE');
  assert.equal(restored.columnFilters['Descrição'], undefined);
  assert.deepEqual(restored.groupSumColumns, ['Saldo - R$']);
  assert.equal(restored.search.length, 500);
  assert.equal(restored.baseColumnWidth, 250);
  assert.equal(restored.columnWidths['Saldo - R$'], undefined);
  assert.equal(restored.sort.column, null);
});

test('duplicate names and capacity are handled without overwriting', () => {
  const storage = memoryStorage(), report = fixture();
  assert.equal(Views.save(storage, report, 'Minhas despesas', state(), Filters).ok, true);
  assert.equal(Views.save(storage, report, 'MINHAS DESPESAS', state(), Filters).ok, false);
  for (let i = 1; i < Views.MAX_VIEWS; i++) {
    assert.equal(Views.save(storage, report, 'Consulta ' + i, state(), Filters).ok, true);
  }
  assert.equal(Views.read(storage, report).views.length, 12);
  assert.equal(Views.save(storage, report, 'Extra', state(), Filters).ok, false);
  assert.equal(Views.remove(storage, report, 'Consulta 1').ok, true);
  assert.equal(Views.read(storage, report).views.length, 11);
  assert.equal(Views.save(storage, report, 'Extra', state(), Filters).ok, true);
});

test('corrupted storage and disabled private mode do not erase data or crash', () => {
  const storage = memoryStorage(), report = fixture();
  storage.setItem(Views.keyFor(report), 'corrupted');
  assert.equal(Views.read(storage, report).available, false);
  assert.equal(Views.save(storage, report, 'Normal', state(), Filters).ok, false);
  assert.equal(storage.getItem(Views.keyFor(report)), 'corrupted');
  const blocked = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); }
  };
  assert.equal(Views.read(blocked, report).available, false);
  assert.equal(Views.save(blocked, report, 'Normal', state(), Filters).ok, false);
  assert.equal(Views.keyFor({ slug: '../mau' }), '');
});

test('optional chart preferences are saved by column name and survive reordered reports', () => {
  const report=fixture();
  const input={...state(),chart:{mode:'sum',type:'bar',dimension:'Competência',
    measure:'Saldo - R$',limit:30,rowIndex:172}};
  const snapshot=Views.capture(report,input,Filters);
  assert.deepEqual(snapshot.chart,{mode:'sum',type:'bar',dimension:'Competência',
    measure:'Saldo - R$',limit:30});
  assert.ok(!JSON.stringify(snapshot.chart).includes('rowIndex'));
  const reordered={...report,columns:['Saldo - R$','Descrição','Competência','NE CCor']};
  const back=Views.reconcile(reordered,snapshot,Filters).state.chart;
  assert.equal(back.dimension,'Competência');
  assert.equal(back.measure,'Saldo - R$');
  assert.equal(back.mode,'sum');
  const reduced={...report,columns:['NE CCor','Competência','Descrição']};
  const recovered=Views.reconcile(reduced,snapshot,Filters);
  assert.equal(recovered.state.chart.measure,'');
  assert.ok(recovered.removedColumns.includes('Saldo - R$'));
});

test('old local views without a chart keep a compatible null preference', () => {
  assert.equal(Views.reconcile(fixture(),state(),Filters).state.chart,null);
  const unsafe={...state(),chart:{mode:'javascript:alert(1)',type:'pie',dimension:'Competência'}};
  assert.equal(Views.reconcile(fixture(),unsafe,Filters).state.chart,null);
});

test('consultas salvas preservam paginas maiores e a opcao todas sem alterar registros', () => {
  const report=fixture();
  for (const pageSize of [250,500,1000,'all']) {
    const snapshot=Views.capture(report,{...state(),pageSize},Filters);
    assert.equal(snapshot.pageSize,pageSize);
    assert.equal(Views.reconcile(report,snapshot,Filters).state.pageSize,pageSize);
  }
  assert.equal(Views.reconcile(report,{...state(),pageSize:999999},Filters).state.pageSize,50);
});

test('consulta salva recupera grafia equivalente sem deslocar filtros apos insercao de colunas', () => {
  const r=fixture();
  const old=Views.capture(r,state(),Filters);
  const updated={...r,
    columns:['Campo Novo','Saldo - R$','Ne CCor','competencia','Descrição'],
    column_schema:[{name:'Campo Novo',type:'text'},...r.column_schema.map(item=>({
      ...item,name:item.name==='NE CCor'?'Ne CCor':item.name==='Competência'?'competencia':item.name
    }))]};
  const result=Views.reconcile(updated,old,Filters);
  assert.equal(result.state.sort.column,'competencia');
  assert.equal(result.state.columnFilters['Ne CCor'].value,'NE0001');
  assert.ok(result.state.visibleColumns.includes('competencia'));
  assert.equal(result.removedColumns.length,0);
  assert.ok(result.renamedColumns.length>=2);
});

test('consulta salva nao transfere filtro financeiro para codigo com novo significado', () => {
  const r=fixture();
  const old=Views.capture(r,state(),Filters);
  const changed={...r,column_schema:r.column_schema.map(item=>item.name==='Saldo - R$'
    ? {...item,type:'identifier'}:item)};
  const result=Views.reconcile(changed,old,Filters);
  assert.equal(result.state.columnFilters['Saldo - R$'],undefined);
  assert.ok(!result.state.groupSumColumns.includes('Saldo - R$'));
});
