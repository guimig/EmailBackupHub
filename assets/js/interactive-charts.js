/* Dependency-free, read-only chart primitives for static reports. */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const chartState = new WeakMap();
  const ALLOWED_RANGES = new Set([30, 90, 365, 0]);

  function isoDate(value) {
    const text = String(value ?? '').trim();
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!br && !iso) return null;
    const year = Number(br ? br[3] : iso[1]);
    const month = Number(br ? br[2] : iso[2]);
    const day = Number(br ? br[1] : iso[3]);
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
    return { iso: String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'), time };
  }

  function money(value) {
    return Number.isFinite(value)
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(value)
      : 'Sem dado';
  }
  function escape(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[char]));
  }

  function prepareTimeSeries(series, rangeDays = 0, hidden = []) {
    const hiddenSet = new Set(hidden || []);
    const all = (series || []).map(item => ({
      label: String(item.label || 'Série'), color: item.color || 'var(--accent)', metric: item.metric || '',
      points: (item.points || []).map(point => {
        const date = isoDate(point.dateIso || point.date);
        return date && Number.isFinite(point.value)
          ? { date: date.iso, time: date.time, value: point.value }
          : null;
      }).filter(Boolean).sort((a,b) => a.time - b.time)
    }));
    const allTimes = all.flatMap(item => item.points.map(point => point.time));
    const latest = allTimes.length ? Math.max(...allTimes) : null;
    const days = ALLOWED_RANGES.has(Number(rangeDays)) ? Number(rangeDays) : 0;
    const start = latest === null || !days ? null : latest - (days - 1) * DAY;
    const visible = all.filter(item => !hiddenSet.has(item.label)).map(item => ({
      ...item, points: item.points.filter(point => start === null || point.time >= start)
    }));
    return { latest, start, days, series: visible, available: all.map(item => item.label) };
  }

  function renderTime(container, series, options = {}) {
    if (!container) return;
    const state = chartState.get(container) || { hidden: new Set() };
    chartState.set(container, state);
    const all = prepareTimeSeries(series, options.rangeDays || 0);
    const prepared = prepareTimeSeries(series, options.rangeDays || 0, [...state.hidden]);
    const points = prepared.series.flatMap(item => item.points);
    const label = String(options.ariaLabel || 'Evolução histórica');
    const allLegend = all.series.map(item => {
      const checked = !state.hidden.has(item.label);
      return `<button type="button" class="history-series-toggle" data-series-label="${escape(item.label)}"
        aria-pressed="${checked}" title="${checked ? 'Ocultar' : 'Exibir'} ${escape(item.label)}">
        <i class="legend-dot" style="background:${item.color}"></i>${escape(item.label)}
      </button>`;
    }).join('');
    if (!points.length || prepared.series.length === 0) {
      container.innerHTML = `<div class="chart-empty" role="status">Sem pontos confiáveis no período selecionado.</div>
        <div class="history-series-actions">${allLegend}</div>`;
      bindSeriesToggles(container, state, series, options);
      return;
    }

    const width = 640, height = 230, left = 70, right = 18, top = 18, bottom = 37;
    const xMin = Math.min(...points.map(p => p.time));
    const xMax = Math.max(...points.map(p => p.time));
    const yValues = points.map(p => p.value);
    let yMin = Math.min(...yValues), yMax = Math.max(...yValues);
    const yPadding = (yMax - yMin) * .1 || Math.max(Math.abs(yMax) * .08, 1);
    yMin -= yPadding;
    yMax += yPadding;
    const xFor = time => left + (xMax === xMin ? .5 : (time - xMin) / (xMax - xMin)) * (width - left - right);
    const yFor = value => top + (yMax - value) / (yMax - yMin) * (height - top - bottom);
    const yTicks = Array.from({length:4},(_,i)=>yMin + i*(yMax-yMin)/3);
    const grid = yTicks.map(value => {
      const y = yFor(value);
      return `<line x1="${left}" x2="${width-right}" y1="${y}" y2="${y}"
        stroke="var(--line)" stroke-dasharray="3 4"/>
        <text x="${left-8}" y="${y+3}" text-anchor="end" font-size="10" fill="var(--muted)">${escape(new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(value))}</text>`;
    }).join('');
    const paths = prepared.series.map(item => {
      const segments = [];
      for (let i=0;i<item.points.length;i++) {
        const p = item.points[i];
        // Deliberately break the path on missing calendar intervals: no fabricated interpolation.
        const longGap = i>0 && p.time-item.points[i-1].time > 45*DAY;
        segments.push((i===0 || longGap ? 'M' : 'L')+xFor(p.time).toFixed(2)+','+yFor(p.value).toFixed(2));
      }
      const dots = item.points.map(point => `<circle class="history-point" cx="${xFor(point.time)}"
        cy="${yFor(point.value)}" r="4.5" tabindex="0" role="button"
        data-series="${escape(item.label)}" data-date="${escape(point.date)}"
        data-value="${point.value}" fill="${item.color}"
        aria-label="${escape(item.label)} em ${escape(point.date)}: ${escape(money(point.value))}">
        <title>${escape(item.label)} • ${escape(point.date)} • ${escape(money(point.value))}</title>
      </circle>`).join('');
      return `<path d="${segments.join(' ')}" fill="none" stroke="${item.color}"
        stroke-width="2.8" stroke-linejoin="round"/>${dots}`;
    }).join('');
    const first = new Date(xMin).toLocaleDateString('pt-BR',{timeZone:'UTC'});
    const last = new Date(xMax).toLocaleDateString('pt-BR',{timeZone:'UTC'});
    container.innerHTML = `<div class="history-visual">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(label)}">
        ${grid}
        <text x="${left}" y="${height-10}" font-size="11" fill="var(--muted)">${escape(first)}</text>
        <text x="${width-right}" y="${height-10}" text-anchor="end" font-size="11" fill="var(--muted)">${escape(last)}</text>
        ${paths}
      </svg>
      <div class="history-hover" role="status" aria-live="polite">Passe o mouse ou selecione um ponto para consultar data e valor.</div>
      <div class="history-series-actions" aria-label="Séries disponíveis">${allLegend}</div>
      <div class="history-meta">Dados confiáveis observados: ${points.length} ponto(s).
      Eixo horizontal proporcional às datas; intervalos superiores a 45 dias não são interpolados.
      Último ponto: ${escape(last)}.</div>
      ${options.reportUrl ? '<a class="history-source-link" href="'+escape(options.reportUrl)+'">Consultar relatório e registros</a>' : ''}
    </div>`;
    bindSeriesToggles(container, state, series, options);
    const hover = container.querySelector('.history-hover');
    container.querySelectorAll('circle.history-point').forEach(node => {
      const show = () => { hover.textContent = node.dataset.series+' · '+node.dataset.date+' · '+money(Number(node.dataset.value)); };
      node.addEventListener('mouseenter', show);
      node.addEventListener('focus', show);
      node.addEventListener('click', show);
      node.addEventListener('keydown', event => { if(event.key==='Enter' || event.key===' ') {event.preventDefault();show();} });
    });
  }

  function bindSeriesToggles(container, state, series, options) {
    container.querySelectorAll('[data-series-label]').forEach(button => button.addEventListener('click', () => {
      const label = button.dataset.seriesLabel;
      if (state.hidden.has(label)) state.hidden.delete(label);
      else state.hidden.add(label);
      renderTime(container,series,options);
    }));
  }

  function renderCategory(container, items, options = {}) {
    if (!container) return;
    const max = Number.isSafeInteger(options.limit) ? Math.min(40,Math.max(1,options.limit)) : 25;
    const valid = (items || []).filter(item => Number.isFinite(item.value));
    const shown = valid.slice(0,max);
    const scale = Math.max(1,...shown.map(item=>Math.abs(item.value)));
    if (!shown.length) {
      container.innerHTML = '<p class="chart-empty">Não há registros numéricos confiáveis para o gráfico. Nenhum valor ausente foi convertido em zero.</p>';
      return;
    }
    const bars = shown.map((item,i) => {
      const p=Math.max(1,Math.abs(item.value)/scale*100);
      const neg=item.value<0;
      return `<button type="button" class="record-chart-bar" data-record-index="${item.rowIndex}"
        title="Abrir registro: ${escape(item.label)}"
        aria-label="${escape(item.label)}, ${escape(money(item.value))}. Abrir registro completo">
        <span class="record-chart-label" title="${escape(item.label)}">${escape(item.label)}</span>
        <span class="record-chart-track"><span class="record-chart-fill${neg?' is-negative':''}" style="width:${p.toFixed(1)}%"></span></span>
        <span class="record-chart-value">${escape(money(item.value))}</span>
      </button>`;
    }).join('');
    container.innerHTML = `<div class="record-chart-bars">${bars}</div>
      <p class="chart-coverage">Exibindo ${shown.length} de ${valid.length} registros com valor numérico.
      Cada barra representa uma linha, sem somar registros nem períodos.</p>`;
    container.querySelectorAll('[data-record-index]').forEach(button=>button.addEventListener('click',()=>{
      if(typeof options.onSelect==='function')options.onSelect(Number(button.dataset.recordIndex));
    }));
  }

  const api = { isoDate, prepareTimeSeries, renderTime, renderCategory };
  root.EmailBackupHubCharts = api;
  if(typeof module !== 'undefined' && module.exports)module.exports=api;
}(typeof window !== 'undefined'?window:globalThis));
