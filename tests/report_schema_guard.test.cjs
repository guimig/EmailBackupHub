'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Guard=require('../assets/js/report-schema-guard.js');
const Filters=require('../assets/js/report-viewer-filters.js');

function report(columns=['NE CCor','Competência','Saldo - R$']) {
  return {slug:'novo-relatorio-gerado-automaticamente',columns,
    rows:[{'NE CCor':'2026NE0001','Competência':'013/2025','Saldo - R$':'1.234,56'},
      {'NE CCor':'2026NE0002','Competência':'014/2025','Saldo - R$':'0'}],
    column_schema:[
      {name:'NE CCor',type:'identifier'},
      {name:'Competência',type:'period'},
      {name:'Saldo - R$',type:'money'}
    ],
    metadata:{row_count:2,column_count:3},
    quality:{ok:true,issues:[],warnings:[]}
  };
}
function storage(){
  const db=new Map();
  return {getItem:key=>db.get(key)??null,setItem:(key,value)=>db.set(key,value),db};
}

test('new unknown report needs no per-report registry to be structurally inspected',()=>{
  const r=report();
  const result=Guard.inspect(r,null,Filters);
  assert.equal(result.severity,'ok');
  assert.equal(result.columnCount,3);
  assert.equal(result.count,2);
  assert.equal(result.details.find(x=>x.name==='Saldo - R$').filled,2);
  assert.equal(result.details.find(x=>x.name==='Competência').invalid,0);
  assert.equal(result.details.find(x=>x.name==='Saldo - R$').invalid,0);
});

test('schema reference only records column names and types, not rows or finances',()=>{
  const store=storage(),r=report();
  const result=Guard.observe(store,r,Filters);
  assert.equal(result.baselineInitialized,true);
  const value=store.getItem(Guard.keyFor(r));
  assert.ok(value);
  assert.ok(!value.includes('2026NE0001')&&!value.includes('1.234,56'));
  assert.equal(Guard.read(store,r).baseline.columns.length,3);
  assert.equal(Guard.observe(store,r,Filters).hasBaseline,true);
});

test('reordering columns is informational and does not reclassify accounting periods',()=>{
  const r=report(),before=Guard.snapshot(r,Filters);
  const newer={...r,columns:['Saldo - R$','NE CCor','Competência'],metadata:{row_count:2,column_count:3}};
  const result=Guard.inspect(newer,before,Filters);
  assert.equal(result.changes.reordered,true);
  assert.deepEqual(result.changes.added,[]);
  assert.deepEqual(result.changes.removed,[]);
  assert.equal(result.severity,'ok');
  assert.equal(Filters.periodCode('013/2025'),202513);
  assert.equal(Filters.periodCode('014/2025'),202514);
});

test('added, removed and changed types are identified before user accepts baseline',()=>{
  const r=report(),old=Guard.snapshot(r,Filters),store=storage();
  store.setItem(Guard.keyFor(r),JSON.stringify(old));
  const newReport={...r,columns:['NE CCor','Data do Lançamento','Valor'],
    column_schema:[{name:'NE CCor',type:'identifier'},{name:'Data do Lançamento',type:'date'},
      {name:'Valor',type:'money'}],metadata:{column_count:3,row_count:2}};
  const result=Guard.observe(store,newReport,Filters);
  assert.equal(result.severity,'review');
  assert.deepEqual(result.changes.added,['Data do Lançamento','Valor']);
  assert.deepEqual(result.changes.removed,['Competência','Saldo - R$']);
  assert.equal(result.baselineInitialized,false);
  assert.deepEqual(Guard.read(store,r).baseline,old,'Do not overwrite baseline automatically');
  assert.equal(Guard.accept(store,newReport,Filters),true);
  assert.equal(Guard.observe(store,newReport,Filters).changes.added.length,0);
});

test('unique accent/spacing differences can be resolved, ambiguous or semantically different names cannot',()=>{
  const columns=['Natureza de Despesa','SALDO - R$','Fonte - Recursos'];
  assert.equal(Guard.resolveColumn(columns,'natureza  de despesa').name,'Natureza de Despesa');
  assert.equal(Guard.resolveColumn(columns,'saldo r$').name,'SALDO - R$');
  assert.equal(Guard.resolveColumn(columns,'Valor Original'),null);
  assert.equal(Guard.resolveColumn(['Cód.','Cod'], 'COD'),null);
});

test('invalid rows, duplicated column names and metadata mismatches appear as warnings/errors',()=>{
  const r=report();
  const invalid={...r,columns:['X','X'],rows:null};
  assert.equal(Guard.inspect(invalid,null,Filters).severity,'invalid');
  const mismatch={...r,metadata:{column_count:20,row_count:8}};
  const result=Guard.inspect(mismatch,null,Filters);
  assert.equal(result.severity,'review');
  assert.ok(result.issues.filter(x=>x.level==='warning').length>=2);
});

test('sampled type mismatches do not silently recast numbers and dates',()=>{
  const r=report();
  const m={...r,rows:Array.from({length:15},(_,i)=>({'NE CCor':'NE'+i,'Competência':'013/2025',
    'Saldo - R$':i<8?'não numérico':'100,00'})),metadata:{column_count:3,row_count:15}};
  const result=Guard.inspect(m,null,Filters);
  assert.equal(result.severity,'review');
  assert.ok(result.issues.some(issue=>issue.message.includes('incompatíveis')));
  assert.equal(result.details.find(x=>x.name==='Saldo - R$').invalid,8);
});

test('named URLs survive reordering, added columns and removal without moving filters',()=>{
  const r=report(),params=new URLSearchParams('report=data/reports/novo.json');
  Guard.writeNamed(params,r,{
    visibleColumns:['NE CCor','Saldo - R$'],groupColumn:'NE CCor',
    sortColumn:'Saldo - R$',groupSums:['Saldo - R$'],
    columnFilters:{'NE CCor':{op:'contains',value:'2026NE0001'},
      'Saldo - R$':{op:'is_zero'}}
  });
  assert.equal(params.get('sv'),'2');
  const shifted={...r,columns:['Data extra','Saldo - R$','NE CCor','Competência'],
    column_schema:[{name:'Data extra',type:'date'},...r.column_schema]};
  const restored=Guard.restoreNamed(shifted,params,Filters);
  assert.deepEqual(restored.visible,['NE CCor','Saldo - R$']);
  assert.equal(restored.group,'NE CCor');
  assert.equal(restored.sort,'Saldo - R$');
  assert.deepEqual(restored.groupSums,['Saldo - R$']);
  assert.equal(restored.columnFilters['NE CCor'].value,'2026NE0001');
  assert.equal(restored.columnFilters['Data extra'],undefined);
  const removed={...shifted,columns:['Data extra','NE CCor','Competência']};
  const after=Guard.restoreNamed(removed,params,Filters);
  assert.equal(after.sort,null);
  assert.equal(after.columnFilters['Saldo - R$'],undefined);
  assert.ok(after.warnings.some(w=>w.includes('Saldo - R$')));
});

test('renames with identical canonical meaning can be restored with a visible warning',()=>{
  const r=report(),params=new URLSearchParams();
  Guard.writeNamed(params,r,{visibleColumns:['Saldo - R$'],columnFilters:{'Saldo - R$':{op:'is_zero'}}});
  const updated={...r,columns:['NE CCor','Competência','saldo r$'],
    column_schema:[{name:'NE CCor',type:'identifier'},{name:'Competência',type:'period'},
      {name:'saldo r$',type:'money'}]};
  const restored=Guard.restoreNamed(updated,params,Filters);
  assert.deepEqual(restored.visible,['saldo r$']);
  assert.equal(restored.columnFilters['saldo r$'].op,'is_zero');
  assert.ok(restored.warnings.some(w=>w.includes('Grafia atualizada')));
});

test('filters are rejected if the column changed into an incompatible type',()=>{
  const r=report(),params=new URLSearchParams();
  Guard.writeNamed(params,r,{visibleColumns:r.columns,columnFilters:{'Saldo - R$':{op:'is_zero'}}});
  const changed={...r,column_schema:r.column_schema.map(x=>x.name==='Saldo - R$'?{...x,type:'identifier'}:x)};
  const result=Guard.restoreNamed(changed,params,Filters);
  assert.equal(result.columnFilters['Saldo - R$'],undefined);
  assert.ok(result.warnings.some(w=>w.includes('incompatível')));
});

test('corrupt storage or localStorage disabled do not erase references or crash',()=>{
  const r=report(),store=storage();
  store.setItem(Guard.keyFor(r),'invalid-json');
  assert.equal(Guard.read(store,r).available,false);
  assert.equal(Guard.observe(store,r,Filters).baselineInitialized,false);
  assert.equal(store.getItem(Guard.keyFor(r)),'invalid-json');
  const disabled={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
  assert.equal(Guard.observe(disabled,r,Filters).storageAvailable,false);
  assert.equal(Guard.accept(disabled,r,Filters),false);
});

test('new URL state limits large or malformed payload without executing script strings',()=>{
  const r=report(),params=new URLSearchParams();
  params.set('sv','2');
  params.set('vf','{"Saldo - R$":{"op":"is_zero"}}');
  params.set('cv','["<img onerror=alert(1)>","NE CCor"]');
  const result=Guard.restoreNamed(r,params,Filters);
  assert.deepEqual(result.visible,['NE CCor']);
  assert.equal(result.columnFilters['Saldo - R$'].op,'is_zero');
  assert.ok(result.warnings.some(w=>w.includes('Campo indisponível')));
  params.set('vf','{not JSON');
  assert.deepEqual(Object.keys(Guard.restoreNamed(r,params,Filters).columnFilters),[]);
});

test('old Tesouro links retain selected columns after accidental data/header concatenation is repaired',()=>{
  const clean=['Ação Governo','Grupo Despesa','Grupo Despesa (2)','PI','PI (2)','NC',
    'Doc - Observação','Transação - Mês','Saldo - Moeda Origem (Item Informação)'];
  const old=[
    'Ação Governo / APOIO AO PROGRAMA NACIONAL DE ALIMENTACAO ESCOLAR (PNAE)',
    'Grupo Despesa / 3',
    'Grupo Despesa / OUTRAS DESPESAS CORRENTES',
    'Doc - Observação / PROVISAO PNAE',
    'Transação - Mês / MAR/2026 / ABR/2026',
    'Saldo - Moeda Origem (Item Informação) / 89.872,00'
  ];
  const params=new URLSearchParams();
  params.set('sv','2');
  params.set('cols','0,1,2,6,7,8');
  params.set('cv',JSON.stringify(old));
  params.set('vg',old[0]);
  params.set('vf',JSON.stringify({[old[0]]:{op:'contains',value:'PNAE'}}));
  const result=Guard.restoreNamed({slug:'provisionamentos',columns:clean},params,Filters);
  assert.deepEqual(result.visible,[clean[0],clean[1],clean[2],clean[6],clean[7],clean[8]]);
  assert.equal(result.group,clean[0]);
  assert.equal(result.columnFilters[clean[0]].value,'PNAE');
  assert.ok(result.warnings.some(msg=>msg.includes('Cabeçalho corrigido')));
});

test('index fallback never maps unrelated or reordered column names',()=>{
  const params=new URLSearchParams();
  params.set('sv','2');
  params.set('cols','0');
  params.set('cv',JSON.stringify(['Grupo Despesa / 3']));
  const result=Guard.restoreNamed({columns:['Ação Governo','Grupo Despesa']},params,Filters);
  assert.deepEqual(result.visible,[]);
  assert.ok(result.warnings.some(msg=>msg.includes('Campo indisponível')));
});
