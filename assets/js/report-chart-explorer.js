/* Generic, source-aware report chart explorer. No dependencies, no implicit financial aggregation. */
(function (root) {
  'use strict';

  const MONTHS = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  const MONTH_INDEX = Object.fromEntries(MONTHS.map((m,i)=>[m,i+1]));
  const COUNTS = new Set(['count','records','sum','wide']);
  const TYPES = new Set(['bar','pie','line']);
  const LIMITS = new Set([10,15,30,60]);
  const MAX_ROWS = 60;
  const money = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2});
  const decimal = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
  const compact = new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1});

  function clean(value) { return String(value ?? '').trim(); }
  function norm(value) { return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
  function escape(value) { return String(value ?? '').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function extract(item) { return item?.raw || item || {}; }
  function dataRows(rows) { return (rows || []).map((item,index)=>({row:extract(item),index,type:item?.type||'data'})).filter(item=>item.type!=='total'); }
  function isIdHeader(header) {
    const h=norm(header);
    return /(?:^|[\s/(-])(ptres|cpf|cnpj|uasg|rip|codigo|cod\.?|numero|num\.?|n[uú]m\.?|ne ccor|processo|fonte recursos|natureza despesa detalhada|vinculacao pagamento codigo|ug executora codigo)(?:[\s/)-]|$)/.test(h)
      && !/(doc\s*-\s*valor|movim.*liquido|saldo\s*-|valor\s*-\s*r\$)/.test(h);
  }
  function typeFor(report,column,F) {
    if (isIdHeader(column)) return 'identifier';
    const t=F.columnMeta(report,column).type;
    return ['money','number','percent','date','period','category','identifier','text'].includes(t)?t:'text';
  }
  function numericColumns(report,F) {
    return (report?.columns||[]).filter(column=>{
      if (!['money','number','percent'].includes(typeFor(report,column,F))) return false;
      let observed=0, valid=0;
      for(const row of (report?.rows||[]).slice(0,200)){
        const raw=row[column];
        if(F.isEmpty(raw))continue;
        observed++;
        if(F.parseNumber(raw)!==null) valid++;
      }
      return observed>0 && valid/observed>=.75;
    });
  }
  function dimensions(report,F) {
    return (report?.columns||[]).filter(column=>!numericColumnsByName(report,F,column));
  }
  function numericColumnsByName(report,F,column) {
    return ['money','number','percent'].includes(typeFor(report,column,F));
  }
  function temporalValue(value,kind,F) {
    if(kind==='date'){
      const n=F.parseDate(value);
      if(n===null)return null;
      const year=Math.floor(n/10000),month=Math.floor(n/100)%100,day=n%100;
      return {order:Date.UTC(year,month-1,day),monthIndex:year*12+month,periodSpecial:false};
    }
    if(kind==='period'){
      const n=F.periodCode(value);
      if(n===null)return null;
      const month=n%100,year=Math.floor(n/100);
      return {order:month<=12?Date.UTC(year,month-1,1):null,monthIndex:year*12+month,periodSpecial:month>12};
    }
    return null;
  }
  function wideColumns(report,F) {
    const output=[];
    for(const column of (report?.columns||[])){
      const match=/^(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ|0?13|0?14)\/(\d{4})(?:\b|\s|\/)/i.exec(column);
      if(!match || !['money','number'].includes(typeFor(report,column,F)))continue;
      const month=MONTH_INDEX[match[1].toUpperCase()]||Number(match[1]),year=Number(match[2]);
      if(year<2000||year>2100)continue;
      output.push({column,month,year,order:year*100+month,label:(month<=12?MONTHS[month-1]:String(month).padStart(3,'0'))+'/'+year});
    }
    return output.sort((a,b)=>a.order-b.order);
  }
  function descriptiveDimension(report,rows,F,preferUnique) {
    const data=dataRows(rows);
    const candidates=dimensions(report,F);
    let best=null,score=-Infinity;
    for(const column of candidates){
      const t=typeFor(report,column,F);
      const seen=new Set();let filled=0,avgLength=0;
      for(const item of data.slice(0,300)){
        const value=clean(item.row[column]); if(!value)continue;
        seen.add(value);filled++;avgLength+=value.length;
      }
      if(!filled)continue;
      const uniqueRatio=seen.size/filled;
      const reasonable=seen.size>1 && seen.size<=40;
      let s=t==='category'?12:t==='period'?9:t==='date'?8:t==='identifier'?4:3;
      if(preferUnique) s+=uniqueRatio*19 + (t==='identifier'?8:0);
      else s+=reasonable?12:seen.size===1?-15:seen.size>80?-11:1;
      s+=Math.min(3,filled/40);
      if(avgLength/filled>95)s-=18;
      if(/desc(ricao)?|observacao|favorecido/.test(norm(column)))s-=12;
      if(/natureza despesa$|grupo despesa|recolhimento.*\(2\)|emissao.*mes/.test(norm(column)))s+=4;
      if(/ne ccor$|ptres$|rip$|cod.*recolhimento/.test(norm(column))&&preferUnique)s+=5;
      if(s>score){best=column;score=s;}
    }
    return best||candidates[0]||'';
  }
  function preferredMeasure(report,F) {
    const measures=numericColumns(report,F);
    const rank=column=>{
      const h=norm(column);
      let score=0;
      if(/movim.*liquido|arrecadacao liquida/.test(h))score+=35;
      if(/a pagar/.test(h))score+=25;
      if(/saldo/.test(h))score+=12;
      if(/valor|pago|empenhad|liquidad/.test(h))score+=6;
      if(/doc\s*-\s*valor/.test(h))score-=7;
      if(typeFor(report,column,F)==='money')score+=10;
      return score;
    };
    return [...measures].sort((a,b)=>rank(b)-rank(a))[0]||'';
  }
  function genuinelyTransactional(column) {
    const h=norm(column);
    return /movim.*liquido|arrecadacao liquida|receita arrecadada|valor recolhido/.test(h)
      && !/saldo|a liquidar|a pagar|acumulad/.test(h);
  }
  function suggest(report,rows,F) {
    const data=dataRows(rows);
    const measures=numericColumns(report,F);
    const wide=wideColumns(report,F);
    const measure=preferredMeasure(report,F);
    const periods=dimensions(report,F).filter(column=>['date','period'].includes(typeFor(report,column,F)));
    const bestTime=periods.map(column=>{
      const type=typeFor(report,column,F);
      const valid=new Set(data.map(item=>clean(item.row[column])).filter(value=>{
        const p=temporalValue(value,type,F);return p&&p.order!==null;
      }));
      return {column,type,count:valid.size};
    }).sort((a,b)=>{
      const rank=item=>item.type==='period'&&item.count>=3&&item.count<=24?100+item.count
        :item.type==='date'&&item.count>=3?60+Math.min(item.count,24):item.count;
      return rank(b)-rank(a);
    })[0];
    if(wide.length>=6 && data.length && data.some(item=>wide.some(m=>F.parseNumber(item.row[m.column])!==null))) {
      const sample=data.find(item=>wide.filter(m=>F.parseNumber(item.row[m.column])!==null).length>=2)||data[0];
      const special=wide.some(m=>m.month>12);
      return {mode:'wide',type:special?'bar':'line',dimension:'',measure:'',rowIndex:sample.index,limit:30,
        title:'Saldos do mesmo registro entre competências',
        reason:'As competências estão nas colunas. A comparação acompanha um único registro, sem somar saldos de empenhos distintos. '+(special?'Os períodos contábeis 013/014 permanecem visíveis como categorias.':'')};
    }
    if(measure && bestTime?.count>=3 && genuinelyTransactional(measure)) {
      return {mode:'sum',type:bestTime.count>=5?'line':'bar',dimension:bestTime.column,measure,rowIndex:0,limit:30,
        title:'Movimentações por '+bestTime.column,
        reason:'A coluna de valores indica movimentação líquida e o relatório possui datas/competências próprias. Os valores são somados por período de '+bestTime.column+' (não por data de extração).'};
    }
    if(measures.length && data.length) {
      return {mode:'records',type:'bar',dimension:descriptiveDimension(report,rows,F,true),
        measure,rowIndex:0,limit:15,title:'Maiores valores por registro',
        reason:'Cada barra corresponde a um registro financeiro filtrado, sem somas automáticas de saldos. É possível abrir o registro clicando na barra.'};
    }
    const dimension=descriptiveDimension(report,rows,F,false);
    const distinct=new Set(data.map(item=>clean(item.row[dimension])).filter(Boolean));
    return {mode:'count',type:distinct.size>1&&distinct.size<=6?'pie':'bar',dimension,measure:'',rowIndex:0,limit:15,
      title:'Distribuição dos registros',
      reason:'Não há medida monetária segura para comparar. O gráfico mostra quantos registros pertencem a cada categoria, sem atribuir valores financeiros.'};
  }

  function formatValue(value,unit) {
    return unit==='money'?money.format(value):unit==='percent'?decimal.format(value)+'%':decimal.format(value);
  }
  function safeKey(row,column) { return clean(row?.[column]); }
  function build(report,rows,settings,F) {
    const data=dataRows(rows), opts={...suggest(report,rows,F),...(settings||{})};
    const mode=COUNTS.has(opts.mode)?opts.mode:'records';
    const chart=TYPES.has(opts.type)?opts.type:'bar';
    const limit=LIMITS.has(Number(opts.limit))?Number(opts.limit):15;
    const dimension=opts.dimension,measure=opts.measure;
    const type=typeFor(report,dimension,F);
    const unit=mode==='count'?'count':typeFor(report,measure,F);
    const wide=wideColumns(report,F);
    let result={ok:false,mode,chart,dimension,measure,unit,points:[],totalDataRows:data.length,used:0,omitted:0,
      warning:'',description:'',reason:'',sort:'',limited:false};
    if(!data.length){result.reason='Nenhum registro corresponde aos filtros atuais.';return result;}
    let points=[];
    if(mode==='wide') {
      if(wide.length<2){result.reason='Este relatório não possui múltiplas competências em colunas.';return result;}
      const row=data.find(item=>item.index===Number(opts.rowIndex))||data[0];
      points=wide.map(m=>({key:m.label,label:m.label,value:F.parseNumber(row.row[m.column]),rowIndex:row.index,
        order:m.order,temporal:m.month<=12?temporalValue(m.label,'period',F):{periodSpecial:true},
        count:1})).filter(p=>p.value!==null);
      result.unit='money';
      result.used=points.length;
      result.description='Valores de um único registro nas competências do relatório. Não representa lançamentos individuais.';
      if(wide.some(m=>m.month>12))result.warning='Períodos 013/014 são competências contábeis, não meses civis.';
    } else if(mode==='records') {
      if(!numericColumns(report,F).includes(measure)){result.reason='Escolha uma coluna de valores válida.';return result;}
      points=data.map(item=>({key:String(item.index),label:safeKey(item.row,dimension)||'Registro '+(item.index+1),
        value:F.parseNumber(item.row[measure]),rowIndex:item.index,
        temporal:temporalValue(item.row[dimension],type,F),count:1})).filter(item=>item.value!==null);
      points.sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)||a.rowIndex-b.rowIndex);
      result.used=points.length;
      result.description='Uma barra por registro, em ordem de valor absoluto. Não existem somas automáticas.';
    } else {
      if(!dimensions(report,F).includes(dimension)){result.reason='Escolha um campo de classificação ou período.';return result;}
      if(mode==='sum' && !numericColumns(report,F).includes(measure)){result.reason='Selecione uma coluna numérica para a soma explícita.';return result;}
      const map=new Map();
      for(const item of data) {
        const key=safeKey(item.row,dimension);
        if(!map.has(key))map.set(key,{key,label:key||'(vazio)',value:0,count:0,rowIndexes:[],temporal:temporalValue(key,type,F)});
        const group=map.get(key);
        if(mode==='count') {
          group.value++;group.count++;group.rowIndexes.push(item.index);
        } else {
          const value=F.parseNumber(item.row[measure]);
          if(value===null) {result.omitted++;continue;}
          if(typeFor(report,measure,F)==='money'){
            group.value+=Math.round(value*100);  // cents avoid binary-float drift
          } else group.value+=value;
          group.count++;group.rowIndexes.push(item.index);
        }
      }
      points=[...map.values()].filter(item=>item.count>0);
      if(mode==='sum' && typeFor(report,measure,F)==='money')points.forEach(item=>{item.value/=100;});
      result.used=points.reduce((sum,p)=>sum+p.count,0);
      result.description=(mode==='count'?'Quantidade de registros':'Soma dos valores da coluna selecionada')
        +' por '+dimension+', considerando todos os registros filtrados (exceto linhas de total).';
      if(mode==='sum'){
        result.warning=genuinelyTransactional(measure)
          ? 'Movimentações agrupadas por '+dimension+'. O campo temporal é da própria fonte; confira a abrangência e a competência.'
          : 'Soma configurada pelo usuário. Confira se os registros são mutuamente exclusivos e se a medida é aditiva; saldos e valores de exercícios distintos podem não ser comparáveis.';
      }
    }
    if(!points.length){result.reason='Não há valores válidos suficientes para a visualização escolhida.';return result;}
    if(chart==='pie') {
      if(mode==='records'||mode==='wide'){result.reason='Rosca/pizza exige categorias com contagem ou soma explícita, não valores individuais.';return result;}
      if(points.length>10){result.reason='Rosca/pizza exige até 10 categorias para não ocultar parcelas. Use barras ou aplique filtros.';return result;}
      if(points.some(item=>item.value<0)||points.reduce((sum,item)=>sum+item.value,0)<=0) {
        result.reason='Rosca/pizza não representa corretamente valores negativos ou total nulo. Escolha barras.';return result;
      }
    }
    if(chart==='line') {
      if(mode==='records'){result.reason='Linha exige um valor único por data/competência. Use contagem por período ou soma explícita, se contabilmente adequada.';return result;}
      if(mode!=='wide' && !['date','period'].includes(type)){
        result.reason='Linha exige uma coluna com datas ou competências válidas do próprio relatório.';return result;
      }
      if(points.some(p=>!p.temporal || p.temporal.order===null || p.temporal.periodSpecial)){
        result.reason='Há períodos não civis (como 013/014) ou datas inválidas. Use barras para preservar essas competências.';return result;
      }
      if(mode==='wide' && points.length<2){result.reason='São necessárias pelo menos duas competências para uma linha.';return result;}
      points.sort((a,b)=>a.temporal.order-b.temporal.order);
    } else if(mode==='wide'){
      points.sort((a,b)=>a.order-b.order);
    } else if(chart==='bar'||chart==='pie'){
      points.sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)||a.label.localeCompare(b.label,'pt-BR'));
    }
    result.limited=points.length>Math.min(limit,MAX_ROWS);
    if(result.limited && chart==='line') {
      points=points.slice(-Math.min(limit,MAX_ROWS));
      result.warning+=(result.warning?' ':'')+'São mostrados apenas os últimos '+points.length+' períodos para manter a leitura; há períodos anteriores.';
    } else if(result.limited){
      points=points.slice(0,Math.min(limit,MAX_ROWS));
      result.warning+=(result.warning?' ':'')+'Exibindo as '+points.length+' maiores categorias/registros, sem incluir os demais no total visual.';
    }
    result.points=points;
    result.ok=true;
    return result;
  }

  function renderBars(container,result,handlers) {
    const html=result.points.map((point,i)=>{
      const width=Math.max(0,Math.min(100,Math.abs(point.value)/(Math.max(1,...result.points.map(p=>Math.abs(p.value))))*100));
      const label=point.label.length>85?point.label.slice(0,82)+'…':point.label;
      const action=result.mode==='records'||result.mode==='wide'?'Abrir registro':'Filtrar tabela por categoria';
      return '<button type="button" class="smart-chart-row" data-smart-chart-index="'+i+'"'
        +(result.mode==='records'||result.mode==='wide'?' data-record-index="'+point.rowIndex+'"':'')
        +' aria-label="'+escape(point.label+', '+formatValue(point.value,result.unit)+'. '+action)+'">'
        +'<span class="smart-chart-label" title="'+escape(point.label)+'">'+escape(label)+'</span>'
        +'<span class="smart-chart-track"><span class="smart-chart-fill'+(point.value<0?' negative':'')+'" style="width:'+width.toFixed(1)+'%"></span></span>'
        +'<span class="smart-chart-amount">'+escape(formatValue(point.value,result.unit))+'</span></button>';
    }).join('');
    container.innerHTML='<div class="smart-chart-bars">'+html+'</div>';
    bind(container,result,handlers);
  }

  function renderPie(container,result,handlers) {
    const positive=result.points.filter(p=>p.value>0);
    const total=positive.reduce((sum,p)=>sum+p.value,0);
    if(total<=0){container.textContent='Não há parcelas positivas para esta rosca.';return;}
    const colors=['var(--chart-palette-1)','var(--chart-palette-2)','var(--chart-palette-3)','var(--chart-palette-4)',
      'var(--chart-palette-5)','var(--chart-palette-6)','var(--chart-palette-7)','var(--chart-palette-8)',
      'var(--chart-palette-9)','var(--chart-palette-10)'];
    let offset=0;
    const arcs=positive.map((item,i)=>{
      const share=item.value/total*100;
      const arc='<circle cx="80" cy="80" r="61" fill="none" stroke="'+colors[i]+'" stroke-width="23"'
        +' stroke-dasharray="'+share.toFixed(5)+' '+(100-share).toFixed(5)+'"'
        +' stroke-dashoffset="'+(-offset).toFixed(5)+'" pathLength="100"></circle>';
      offset+=share;return arc;
    }).join('');
    const buttons=positive.map((p,i)=>{
      const index=result.points.indexOf(p);
      return '<button class="smart-chart-slice" type="button" data-smart-chart-index="'+index
        +'" aria-label="Filtrar '+escape(p.label)+'; '+(p.value/total*100).toFixed(1)+' por cento">'
        +'<span class="smart-chart-swatch" style="background:'+colors[i]+'"></span>'
        +'<span class="smart-chart-slice-label">'+escape(p.label||'(vazio)')+'</span>'
        +'<strong>'+escape(formatValue(p.value,result.unit))+'</strong>'
        +'<small>'+decimal.format(p.value/total*100)+'%</small></button>';
    }).join('');
    container.innerHTML='<div class="smart-chart-pie-layout"><svg viewBox="0 0 160 160" class="smart-chart-pie" aria-hidden="true">'
      +'<circle cx="80" cy="80" r="61" fill="none" stroke="var(--line)" stroke-width="23"></circle>'
      +arcs+'<circle cx="80" cy="80" r="46" fill="var(--card)"></circle></svg>'
      +'<div class="smart-chart-slices">'+buttons+'</div></div>';
    bind(container,result,handlers);
  }

  function renderLine(container,result,handlers) {
    const points=result.points,w=740,h=268,top=25,left=68,right=14,bottom=47;
    const time=points.map(item=>item.temporal.order);
    const xMin=Math.min(...time),xMax=Math.max(...time);
    const min=Math.min(...points.map(p=>p.value)),max=Math.max(...points.map(p=>p.value));
    const minY=Math.min(0,min),maxY=Math.max(1,max);
    const padding=(maxY-minY)*.08||1,low=minY-padding,high=maxY+padding;
    const x=val=>left+(xMin===xMax?.5:(val-xMin)/(xMax-xMin))*(w-left-right);
    const y=val=>top+(high-val)/(high-low)*(h-top-bottom);
    const grid=[0,1,2,3,4].map(i=>{
      const value=low+(high-low)/4*i,position=y(value);
      return '<line x1="'+left+'" x2="'+(w-right)+'" y1="'+position+'" y2="'+position+'" stroke="var(--line)" stroke-dasharray="4 5"></line>'
        +'<text x="'+(left-8)+'" y="'+(position+4)+'" text-anchor="end" fill="var(--muted)" font-size="11">'+escape(compact.format(value))+'</text>';
    }).join('');
    const segments=[];
    for(let i=0;i<points.length;i++){
      const p=points[i],prior=points[i-1],gap=i>0&&(
        result.mode==='wide'||(result.dimension&&result.dimension.length)
      ) && (
        p.temporal.monthIndex-prior.temporal.monthIndex>1 &&
        ((p.temporal.order-prior.temporal.order)>45*86400000)
      );
      segments.push((i===0||gap?'M':'L')+x(p.temporal.order).toFixed(2)+','+y(p.value).toFixed(2));
    }
    const dot=points.map((p,i)=>'<circle class="smart-chart-point" data-smart-chart-index="'+i
      +'" tabindex="0" role="button" cx="'+x(p.temporal.order).toFixed(2)
      +'" cy="'+y(p.value).toFixed(2)+'" r="6" fill="var(--accent)"'
      +' aria-label="'+escape(p.label+': '+formatValue(p.value,result.unit))+'"><title>'
      +escape(p.label+' — '+formatValue(p.value,result.unit))+'</title></circle>').join('');
    const first=points[0],last=points[points.length-1];
    container.innerHTML='<div class="smart-chart-line-wrap"><svg viewBox="0 0 '+w+' '+h
      +'" role="img" aria-label="Valores por datas ou competências do relatório">'
      +grid+'<path d="'+segments.join(' ')+'" fill="none" stroke="var(--accent)" stroke-width="3"></path>'
      +dot+'<text x="'+left+'" y="'+(h-12)+'" font-size="11" fill="var(--muted)">'+escape(first.label)+'</text>'
      +'<text x="'+(w-right)+'" y="'+(h-12)+'" text-anchor="end" font-size="11" fill="var(--muted)">'+escape(last.label)+'</text></svg>'
      +'<p class="smart-chart-line-selection" role="status" aria-live="polite">Selecione um ponto para ver seu valor e explorar os registros.</p></div>';
    bind(container,result,handlers);
  }

  function bind(container,result,handlers) {
    const choose=i=>{
      const point=result.points[i];
      if(!point)return;
      const status=container.querySelector('.smart-chart-line-selection');
      if(status)status.textContent=point.label+' · '+formatValue(point.value,result.unit);
      if(typeof handlers?.onSelect==='function')handlers.onSelect(point,result);
    };
    container.querySelectorAll('[data-smart-chart-index]').forEach(node=>{
      node.addEventListener('click',()=>choose(Number(node.dataset.smartChartIndex)));
      if(node.tagName?.toLowerCase()==='circle'){
        node.addEventListener('keydown',event=>{
          if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(Number(node.dataset.smartChartIndex));}
        });
      }
    });
  }

  function render(container,result,handlers={}) {
    if(!container)return;
    if(!result?.ok){container.innerHTML='<p class="chart-empty" role="status">'+escape(result?.reason||'Sem dados adequados para a visualização.')+'</p>';return;}
    if(result.chart==='pie')renderPie(container,result,handlers);
    else if(result.chart==='line')renderLine(container,result,handlers);
    else renderBars(container,result,handlers);
  }

  const api={typeFor,numericColumns,dimensions,wideColumns,descriptiveDimension,preferredMeasure,
    genuinelyTransactional,suggest,build,render,formatValue,temporalValue};
  root.EmailBackupHubChartExplorer=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
}(typeof window!=='undefined'?window:globalThis));
