/* Read-only schema resilience for changing Tesouro Gerencial exports.
 * Names, types and structural observations only: never stores report rows. */
(function (root) {
  'use strict';
  const VERSION = 1;
  const PREFIX = 'emailbackuphub:structure:v1:';
  const MAX_COLUMNS = 300;
  const SAMPLE = 160;
  const VALID_TYPES = new Set(['text','category','identifier','money','number','percent','date','period','boolean']);
  const NUMERIC = new Set(['money','number','percent']);
  const FILTER_PARAMS = ['cv','vg','vgs','vs','vf'];
  const safeName = value => typeof value === 'string' && value.length > 0 && value.length <= 350;
  const canonical = name => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');

  function resolveColumn(columns, wanted) {
    if (!safeName(wanted) || !Array.isArray(columns)) return null;
    if (columns.includes(wanted)) return {name:wanted,normalized:false};
    const key=canonical(wanted);
    if (!key) return null;
    const matches=columns.filter(name=>canonical(name)===key);
    return matches.length===1 ? {name:matches[0],normalized:true} : null;
  }

  function describeColumns(report, Filters) {
    const cols=Array.isArray(report?.columns) ? report.columns.filter(safeName).slice(0,MAX_COLUMNS) : [];
    return cols.map(name=>{
      const meta=Filters.columnMeta(report,name);
      const type=VALID_TYPES.has(meta?.type) ? meta.type : 'text';
      return {name,type};
    });
  }

  function snapshot(report, Filters) {
    return {version:VERSION,columns:describeColumns(report,Filters)};
  }

  function sampleRows(rows) {
    if (!Array.isArray(rows)) return [];
    if (rows.length<=SAMPLE) return rows;
    return Array.from({length:SAMPLE},(_,i)=>rows[Math.floor(i*(rows.length-1)/(SAMPLE-1))]);
  }

  function inspect(report, previous, Filters) {
    const current=snapshot(report,Filters);
    const cols=current.columns.map(item=>item.name);
    const issues=[],changes={added:[],removed:[],reordered:false,types:[],normalized:[]};
    const flag=(level,message)=>issues.push({level,message});
    if (!Array.isArray(report?.columns) || !cols.length)flag('error','O relatório não possui cabeçalhos de coluna utilizáveis.');
    if (Array.isArray(report?.columns) && cols.length!==report.columns.length)flag('error','Há cabeçalhos inválidos ou excesso de colunas.');
    if (new Set(cols).size!==cols.length)flag('error','Cabeçalhos duplicados impedem identificar os filtros de forma segura.');
    if (!Array.isArray(report?.rows)) flag('error','A lista de registros do relatório é inválida ou está ausente.');
    const rows=Array.isArray(report?.rows)?report.rows:[];
    if (Number.isInteger(report?.metadata?.row_count) && report.metadata.row_count!==rows.length) {
      flag('warning','A quantidade declarada no metadado difere da quantidade real de linhas.');
    }
    if (Number.isInteger(report?.metadata?.column_count) && report.metadata.column_count!==cols.length) {
      flag('warning','A quantidade declarada no metadado difere da quantidade real de colunas.');
    }
    if (report?.quality?.ok===false)flag('warning','A origem já apresenta ocorrências de qualidade identificadas pelo processador.');
    const details=[];
    const sample=sampleRows(rows);
    for (const column of current.columns) {
      let filled=0,invalid=0,absent=0;
      for(const row of sample) {
        if (!row || typeof row!=='object' || Array.isArray(row)) {absent++;continue;}
        if (!Object.prototype.hasOwnProperty.call(row,column.name)) {absent++;continue;}
        const value=row[column.name];
        if (Filters.isEmpty(value))continue;
        filled++;
        if (NUMERIC.has(column.type) && Filters.parseNumber(value)===null)invalid++;
        if (column.type==='date' && Filters.parseDate(value)===null)invalid++;
        if (column.type==='period' && Filters.periodCode(value)===null)invalid++;
      }
      details.push({name:column.name,type:column.type,filled,invalid,absent,sample:sample.length});
      if (invalid>0 && invalid/filled>=.1 && filled>=5) {
        flag('warning','Coluna "'+column.name+'": '+invalid+' valor(es) incompatíveis com o tipo declarado "'+column.type+'" na amostra.');
      }
      if (absent>0 && absent/sample.length>.1 && sample.length>=5) {
        flag('warning','Coluna "'+column.name+'": '+absent+' registro(s) amostrados sem a chave correspondente.');
      }
    }
    if (previous && previous.version===VERSION && Array.isArray(previous.columns)) {
      const former=previous.columns.filter(item=>item && safeName(item.name));
      const matched=new Set();
      const mapped=[];
      for (const col of former) {
        const match=resolveColumn(cols,col.name);
        if (!match || matched.has(match.name)) {
          changes.removed.push(col.name);
          continue;
        }
        matched.add(match.name);
        mapped.push(match.name);
        if(match.normalized)changes.normalized.push({from:col.name,to:match.name});
        const next=current.columns.find(item=>item.name===match.name);
        if (col.type!==next.type)changes.types.push({name:match.name,before:col.type,after:next.type});
      }
      changes.added=cols.filter(name=>!matched.has(name));
      changes.reordered=mapped.length>1
        && mapped.some((item,index)=>item!==cols.filter(name=>matched.has(name))[index]);
      if(changes.added.length)flag('warning',changes.added.length+' coluna(s) acrescentada(s) desde a referência registrada.');
      if(changes.removed.length)flag('warning',changes.removed.length+' coluna(s) removida(s) ou renomeada(s) desde a referência registrada.');
      if(changes.types.length)flag('warning',changes.types.length+' coluna(s) com tipo de dado alterado desde a referência.');
      if(changes.reordered)flag('info','A ordem das colunas mudou; os filtros por nome continuam utilizáveis.');
      if(changes.normalized.length)flag('info','Variações apenas de grafia foram identificadas e devem ser conferidas.');
    }
    const severity=issues.some(i=>i.level==='error')?'invalid':
      issues.some(i=>i.level==='warning')?'review':'ok';
    return {severity,issues,changes,details,current,
      count:rows.length,columnCount:cols.length,hasBaseline:Boolean(previous)};
  }

  function keyFor(report) {
    const slug=String(report?.slug||'').trim();
    return /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(slug)?PREFIX+slug:'';
  }

  function read(storage,report) {
    const key=keyFor(report);
    if (!storage || !key) return {available:false,baseline:null,message:'Sem acesso às referências deste navegador.'};
    try {
      const raw=storage.getItem(key);
      if (!raw)return {available:true,baseline:null,message:''};
      const decoded=JSON.parse(raw);
      if(decoded?.version!==VERSION || !Array.isArray(decoded.columns)) {
        return {available:false,baseline:null,message:'Referência anterior incompatível; foi preservada.'};
      }
      return {available:true,baseline:decoded,message:''};
    } catch {
      return {available:false,baseline:null,message:'Não foi possível consultar a referência local; ela não foi apagada.'};
    }
  }

  function accept(storage,report,Filters) {
    const key=keyFor(report);
    if(!key || !storage) return false;
    try {
      storage.setItem(key,JSON.stringify(snapshot(report,Filters)));
      return true;
    } catch {return false;}
  }

  function observe(storage,report,Filters) {
    const previous=read(storage,report);
    const result=inspect(report,previous.baseline,Filters);
    let initialized=false;
    if(previous.available && !previous.baseline && result.severity!=='invalid'){
      initialized=accept(storage,report,Filters);
    }
    return {...result,baselineInitialized:initialized,storageMessage:previous.message,
      storageAvailable:previous.available};
  }

  function restoreNamed(report, params, Filters, metaFor) {
    if(params.get('sv')!=='2')return null;
    const columns=Array.isArray(report?.columns)?report.columns:[];
    const warnings=[];
    const lookup=old=>{
      const match=resolveColumn(columns,old);
      if(!match){if(old)warnings.push('Campo indisponível ou ambíguo: '+String(old).slice(0,90));return null;}
      if(match.normalized)warnings.push('Grafia atualizada: '+old+' → '+match.name);
      return match.name;
    };
    const parse=(key,fallback)=>{
      const value=params.get(key);
      if(value===null || value.length>24000)return fallback;
      try{return JSON.parse(value);}catch{warnings.push('Configuração '+key+' inválida e ignorada.');return fallback;}
    };
    const selected=parse('cv',[]);
    const visible=Array.isArray(selected)?[...new Set(selected.map(lookup).filter(Boolean))]:[];
    const group=lookup(params.get('vg')||'')||'';
    const sort=lookup(params.get('vs')||'')||null;
    const grouped=parse('vgs',[]);
    const groupSums=Array.isArray(grouped)
      ?[...new Set(grouped.map(lookup).filter(Boolean))].filter(name=>{
        const meta=typeof metaFor==='function'?metaFor(name):Filters.columnMeta(report,name);
        return ['money','number'].includes(meta.type);
      }):[];
    const specs=parse('vf',{});
    const columnFilters=Object.create(null);
    if(specs && typeof specs==='object' && !Array.isArray(specs)){
      for(const [name,filter] of Object.entries(specs).slice(0,MAX_COLUMNS)){
        const column=lookup(name);
        if(!column)continue;
        const meta=typeof metaFor==='function'?metaFor(column):Filters.columnMeta(report,column);
        const safe=typeof filter==='string'&&filter.length<=500&&filter.trim()
          ||filter&&typeof filter==='object'&&JSON.stringify(filter).length<=4000&&Filters.validFilter(filter,meta);
        if(safe)columnFilters[column]=filter;
        else warnings.push('Filtro incompatível com a estrutura atual: '+column);
      }
    }
    return {visible,group,sort,groupSums,columnFilters,warnings};
  }

  function writeNamed(params,report,state) {
    params.set('sv','2');
    const columns=new Set(report?.columns||[]);
    const valid=name=>typeof name==='string'&&columns.has(name);
    const list=names=>[...new Set((names||[]).filter(valid))];
    params.set('cv',JSON.stringify(list(state.visibleColumns)));
    const named={vg:valid(state.groupColumn)?state.groupColumn:'',
      vs:valid(state.sortColumn)?state.sortColumn:'',
      vgs:JSON.stringify(list(state.groupSums))};
    for(const [key,value] of Object.entries(named)){
      if(value)params.set(key,value);else params.delete(key);
    }
    const filters=Object.create(null);
    for(const [name,value] of Object.entries(state.columnFilters||{})){
      if(valid(name) && value)filters[name]=value;
    }
    if(Object.keys(filters).length)params.set('vf',JSON.stringify(filters));
    else params.delete('vf');
    return params;
  }

  const api={VERSION,keyFor,canonical,resolveColumn,describeColumns,snapshot,inspect,read,accept,observe,
    restoreNamed,writeNamed,FILTER_PARAMS};
  root.EmailBackupHubSchemaGuard=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
}(typeof window!=='undefined'?window:globalThis));
