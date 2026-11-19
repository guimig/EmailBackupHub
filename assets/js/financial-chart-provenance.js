/* Financial dashboard views with explicit data provenance.
 * Accounting snapshots are NOT transaction-date series.
 * Monthly GRU values are built only from the current report's document emission dates
 * and reconciled with its independently audited overall metric. */
(function (root) {
  'use strict';

  const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const MAX_YEAR = 2100;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
    }[char]));
  }

  function normalize(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }

  function parseAmount(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    let text = String(value ?? '').trim();
    const accountingNegative = text.startsWith('(') && text.endsWith(')');
    if (accountingNegative) text = text.slice(1, -1).trim();
    text = text.replace(/^R\$\s*/i, '');
    if (!text || !/^[+-]?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)$/.test(text)
      || (accountingNegative && /^[+-]/.test(text))) return null;
    const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.')
      : /^[+-]?\d{1,3}(?:\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : text;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? (accountingNegative ? -amount : amount) : null;
  }

  function amountCents(value) {
    const amount = parseAmount(value);
    if (amount === null) return null;
    const cents = Math.round(amount * 100);
    return Number.isSafeInteger(cents) && Math.abs(amount * 100 - cents) < 0.001 ? cents : null;
  }

  function civilDate(value) {
    const text = String(value ?? '').trim();
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    if (!match) return null;
    const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
    const iso = new Date(Date.UTC(year, month - 1, day));
    if (iso.getUTCFullYear() !== year || iso.getUTCMonth() + 1 !== month || iso.getUTCDate() !== day) return null;
    return { year, month, day, iso: year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0') };
  }

  function locateGruColumns(columns) {
    const names = (columns || []).map(column => ({ name: column, normal: normalize(column) }));
    const day = names.find(item => /^emissao\s*[-–]\s*dia$/.test(item.normal));
    const month = names.find(item => /^emissao\s*[-–]\s*mes$/.test(item.normal));
    const net = names.find(item =>
      item.normal.includes('arrecadacao liquida por cod de recolhimento')
      && item.normal.includes('movim') && item.normal.includes('liquido')
    );
    const code = names.find(item => item.normal === 'cod. recolhimento gru');
    const description = names.find(item => item.normal === 'cod. recolhimento gru (2)');
    return { day: day?.name, month: month?.name, value: net?.name, code: code?.name, description: description?.name };
  }

  function invalid(reason) {
    return { ok: false, reason, months: [], records: 0, total: null };
  }

  function buildGruMonthly(report, expectedAuditedTotal) {
    if (!report || !Array.isArray(report.rows) || !report.rows.length) {
      return invalid('O relatório de GRU não contém registros para recompor os valores por data de emissão.');
    }
    const columns = locateGruColumns(report.columns);
    if (!columns.day || !columns.month || !columns.value) {
      return invalid('O relatório não identifica de forma inequívoca a data de emissão e a movimentação líquida.');
    }
    const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(String(report.date_iso || ''))
      ? report.date_iso : null;
    const year = Number(report?.metadata?.exercicio);
    if (!reportDate || !Number.isInteger(year) || year < 2000 || year > MAX_YEAR
      || Number(reportDate.slice(0, 4)) !== year) {
      return invalid('O exercício e a data de referência do relatório não estão consistentes.');
    }
    const expectedCents = amountCents(expectedAuditedTotal);
    const ownCents = amountCents(report?.metrics?.gru_arrecadada);
    if (expectedCents === null || ownCents === null || ownCents !== expectedCents
      || report?.metrics_meta?.gru_arrecadada?.status !== 'ok'
      || report?.quality?.ok === false) {
      return invalid('A métrica auditável de GRU não coincide com o relatório atual.');
    }

    const sums = new Map();
    const counts = new Map();
    let totalCents = 0, latestMonth = 0;
    for (const row of report.rows) {
      const date = civilDate(row?.[columns.day]);
      const period = String(row?.[columns.month] ?? '').trim().toUpperCase();
      const match = /^([A-Z]{3})\/(\d{4})$/.exec(period);
      const monthNumber = match ? MONTHS.indexOf(match[1]) + 1 : 0;
      const cents = amountCents(row?.[columns.value]);
      if (!date || date.year !== year || date.iso > reportDate
        || !match || monthNumber < 1 || monthNumber !== date.month
        || Number(match[2]) !== year || cents === null) {
        return invalid('Há datas, competências de emissão ou valores inválidos/incompatíveis nos registros de GRU.');
      }
      latestMonth = Math.max(latestMonth, date.month);
      sums.set(date.month, (sums.get(date.month) || 0) + cents);
      counts.set(date.month, (counts.get(date.month) || 0) + 1);
      totalCents += cents;
      if (!Number.isSafeInteger(totalCents)) return invalid('A soma dos valores excede a precisão segura.');
    }
    if (Math.abs(totalCents - expectedCents) > 1) {
      return invalid('A soma mensal dos registros não reconcilia com o total auditado de GRU.');
    }

    const months = Array.from({ length: latestMonth }, (_, index) => {
      const month = index + 1;
      return {
        month,
        label: MONTHS[index] + '/' + year,
        value: sums.has(month) ? sums.get(month) / 100 : null,
        records: counts.get(month) || 0
      };
    });
    return {
      ok: true,
      year,
      sourceDate: reportDate,
      records: report.rows.length,
      total: totalCents / 100,
      months,
      description: 'Movimentação líquida de GRU agrupada pelo mês de emissão dos documentos; não representa necessariamente a data da efetiva arrecadação.'
    };
  }


  function buildGruByCode(report, auditedTotal) {
    const monthly = buildGruMonthly(report, auditedTotal);
    if (!monthly.ok) return { ok: false, reason: monthly.reason, items: [] };
    const columns = locateGruColumns(report.columns);
    if (!columns.code || !columns.description) {
      return { ok: false, reason: 'Códigos e descrições de recolhimento não identificados.', items: [] };
    }
    const groups = new Map();
    let grandCents = 0;
    for (const row of report.rows) {
      const code = String(row?.[columns.code] ?? '').trim();
      const description = String(row?.[columns.description] ?? '').trim();
      const cents = amountCents(row?.[columns.value]);
      if (!/^[0-9]{4,8}$/.test(code) || !description || cents === null) {
        return { ok: false, reason: 'Há códigos, descrições ou valores inválidos na GRU.', items: [] };
      }
      const key = code + ':' + description;
      const entry = groups.get(key) || { code, description, cents: 0, records: 0 };
      entry.cents += cents;
      entry.records++;
      if (!Number.isSafeInteger(entry.cents)) {
        return { ok: false, reason: 'Valor por código acima da precisão segura.', items: [] };
      }
      groups.set(key, entry);
      grandCents += cents;
      if (!Number.isSafeInteger(grandCents)) {
        return { ok: false, reason: 'Soma por código acima da precisão segura.', items: [] };
      }
    }
    if (Math.abs(grandCents - amountCents(auditedTotal)) > 1) {
      return { ok: false, reason: 'A soma por código não reconcilia com o total auditado.', items: [] };
    }
    return { ok: true, year: monthly.year, sourceDate: monthly.sourceDate,
      total: grandCents / 100,
      items: [...groups.values()].map(item => ({
        code: item.code, description: item.description,
        value: item.cents / 100, records: item.records
      })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.code.localeCompare(b.code))
    };
  }

  // A cross-report relation for orientation only; not formal budget utilization.
  // Indicative cross-report relationship, never a formal appropriation execution rate.
  // Optional exercise metadata in compact summaries cannot invalidate audited totals.
  function buildCommitmentProvisionRatio(provisions, expenditure) {
    const unavailable = reason => ({ ok: false, value: null, reason });
    const reliable = (doc, key) => doc && doc.quality?.ok !== false
      && Number.isFinite(doc.metrics?.[key])
      && doc.metrics_meta?.[key]?.status === 'ok'
      && doc.metrics_meta?.[key]?.fallback !== true;
    if (!reliable(provisions, 'provisionado') || !reliable(expenditure, 'empenhado')) {
      return unavailable('Totais auditados de empenho ou provisionamento indisponíveis.');
    }
    const budget = provisions.metrics.provisionado;
    const committed = expenditure.metrics.empenhado;
    if (budget <= 0 || committed < 0) {
      return unavailable('O provisionamento deve ser positivo e o empenho não pode ser negativo.');
    }
    const dateA = String(provisions.date_iso || '');
    const dateB = String(expenditure.date_iso || '');
    const yearA = Number(provisions.metadata?.exercicio || (/^\d{4}-/.test(dateA) ? dateA.slice(0,4) : 0));
    const yearB = Number(expenditure.metadata?.exercicio || (/^\d{4}-/.test(dateB) ? dateB.slice(0,4) : 0));
    if (yearA && yearB && yearA !== yearB) {
      return unavailable('Os relatórios pertencem a exercícios diferentes.');
    }
    const sameDate = Boolean(dateA && dateB && dateA === dateB);
    const value = committed / budget;
    return {
      ok: true, value, committed, provisioned: budget,
      date: sameDate ? dateA : null,
      provisional: !sameDate || !yearA || !yearB,
      aboveScale: value > 1,
      reason: (sameDate ? 'Posições coincidentes. ' : 'Datas distintas ou não informadas. ')
        + 'Comparação indicativa entre totais auditados; não equivale à taxa formal de utilização da dotação.'
        + (value > 1 ? ' O empenhado supera o provisionado; conferir escopo dos relatórios.' : '')
    };
  }

  // Binary partition treemap: every positive tile has area proportional to its
  // net value; nonpositive categories remain in a separate, accurately signed list.
  function treemapLayout(items) {
    const positive = (items || []).filter(item => Number.isFinite(item.value) && item.value > 0);
    const result = [];
    function partition(rows, x, y, w, h) {
      if (!rows.length || w <= 0 || h <= 0) return;
      if (rows.length === 1) {
        result.push({ ...rows[0], x, y, w, h });
        return;
      }
      const total = rows.reduce((sum, item) => sum + item.value, 0);
      let until = 1, accum = rows[0].value;
      while (until < rows.length - 1 && accum < total / 2) {
        accum += rows[until++].value;
      }
      const fraction = accum / total;
      if (w >= h) {
        partition(rows.slice(0, until), x, y, w * fraction, h);
        partition(rows.slice(until), x + w * fraction, y, w * (1 - fraction), h);
      } else {
        partition(rows.slice(0, until), x, y, w, h * fraction);
        partition(rows.slice(until), x, y + h * fraction, w, h * (1 - fraction));
      }
    }
    partition(positive, 0, 0, 100, 100);
    return result;
  }

  // Remove labels that cannot fit entirely rather than showing clipped text.
  // Re-check when panels become visible or their width changes.
  function fitTreemapLabels(container) {
    if (!container?.querySelectorAll) return;
    for (const tile of container.querySelectorAll('.gru-treemap-tile')) {
      if (!tile.clientWidth || !tile.clientHeight) continue;
      tile.classList.remove('is-compact');
      const labels = [...tile.querySelectorAll('.gru-tile-code, .gru-tile-name, .gru-tile-amount')];
      labels.forEach(label => {
        label.hidden = false;
        label.style.display = 'block';
        label.style.overflow = 'visible';
        label.style.webkitLineClamp = 'unset';
        label.style.maxHeight = 'none';
      });
      const style = getComputedStyle(tile);
      const innerW = tile.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 3;
      const innerH = tile.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 3;
      const gap = parseFloat(style.rowGap) || 0;
      const fits = () => {
        const visible = labels.filter(label => !label.hidden);
        if (visible.some(label => label.scrollWidth > innerW + 1)) return false;
        return visible.reduce((sum, label) => sum + label.scrollHeight, 0)
          + Math.max(0, visible.length - 1) * gap <= innerH;
      };
      // Keep a complete label, or no label. Full details are always accessible
      // through aria-label/title, and appear on activation.
      for (const kind of ['.gru-tile-name', '.gru-tile-amount', '.gru-tile-code']) {
        if (fits()) break;
        const element = tile.querySelector(kind);
        if (element) element.hidden = true;
      }
    }
  }

  function renderGruCodes(container, result) {
    if (!container) return;
    if (!result?.ok) {
      container.innerHTML = '<p class="chart-empty" role="status">Composição indisponível: '
        + escapeHtml(result?.reason || 'Sem conciliação dos códigos de GRU.') + '</p>';
      return;
    }
    const positive = result.items.filter(item => item.value > 0);
    const negative = result.items.filter(item => item.value <= 0);
    const positiveTotal = positive.reduce((sum, item) => sum + item.value, 0);
    const layout = treemapLayout(positive);
    const blocks = layout.map((item, i) => {
      const share = positiveTotal > 0 ? item.value / positiveTotal * 100 : 0;
      const tiny = item.w < 18 || item.h < 20;
      const name = item.description;
      const coordinates = 'left:' + item.x.toFixed(4) + '%;top:' + item.y.toFixed(4)
        + '%;width:' + item.w.toFixed(4) + '%;height:' + item.h.toFixed(4) + '%;';
      return '<button type="button" class="gru-treemap-tile gru-tile-color-' + (i % 8)
        + (tiny ? ' is-compact' : '') + '" style="' + coordinates + '" data-gru-code="'
        + escapeHtml(item.code) + '" data-gru-description="' + escapeHtml(name)
        + '" data-gru-value="' + escapeHtml(currency.format(item.value))
        + '" data-gru-share="' + share.toFixed(1)
        + '" data-gru-records="' + item.records + '" aria-pressed="false" title="'
        + escapeHtml(item.code + ' · ' + name + ': ' + currency.format(item.value)
          + ' (' + share.toFixed(1).replace('.', ',') + '% do valor positivo). '
          + item.records + ' registro(s). Selecione para ver detalhes; mês de emissão não representa data de pagamento.')
        + '" aria-label="' + escapeHtml(item.code + ': ' + name + ', ' + currency.format(item.value)
        + ', ' + share.toFixed(1).replace('.', ',') + '% do valor positivo por código, '
        + item.records + ' registro(s). Selecione para ver detalhes.')
        + '"><span class="gru-tile-code">' + escapeHtml(item.code)
        + '</span><span class="gru-tile-name">' + escapeHtml(name)
        + '</span><strong class="gru-tile-amount">' + escapeHtml(currency.format(item.value))
        + '</strong></button>';
    }).join('');
    const zeroOrNegative = negative.length
      ? '<div class="gru-adjustments"><strong>Ajustes e códigos sem saldo positivo</strong>'
        + negative.map(item => '<span>' + escapeHtml(item.code + ' · ' + item.description)
          + ': ' + escapeHtml(currency.format(item.value)) + '</span>').join('') + '</div>' : '';
    const note = '';
    container.innerHTML = '<div class="gru-treemap-panel" aria-label="Mapa de áreas da GRU por descrição">'
      + (layout.length ? '<div class="gru-treemap" role="group" aria-label="Selecione uma área para detalhes">'
        + blocks + '</div>' : '<p class="chart-empty">Nenhum código com saldo positivo.</p>')
      + zeroOrNegative + note + '</div>';
  }

  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  /*
   * A rate between expenditure stages is meaningful only for the same accounting
   * perimeter and reference. The caller passes metrics from ONE report snapshot.
   * Do not silently clamp impossible stage values to 100%.
   */
  function buildExpenseStages(metrics, options = {}) {
    const raw = ['committed', 'liquidated', 'paid'].map(key => metrics?.[key]);
    const reason = message => ({
      ok: false, reason: message, rates: null,
      unliquidated: null, unpaidLiquidated: null
    });
    if (options.audited === false) return reason('Uma ou mais métricas não têm origem auditável na mesma posição.');
    if (options.quality === false) return reason('O relatório de origem apresenta problemas de qualidade.');
    if (options.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(options.date))) {
      return reason('Data de referência do relatório indisponível ou inválida.');
    }
    if (raw.some(value => !Number.isFinite(value) || value < 0)) {
      return reason('Há valores ausentes, negativos ou não numéricos nas etapas da despesa.');
    }
    const [committed, liquidated, paid] = raw;
    if (liquidated > committed + 0.01 || paid > liquidated + 0.01) {
      return reason('As etapas não formam uma sequência comparável (empenhado ≥ liquidado ≥ pago).');
    }
    if (committed <= 0) {
      return reason('O valor empenhado não possui base positiva para os percentuais.');
    }
    return {
      ok: true, reason: '', committed, liquidated, paid,
      date: options.date || null,
      rates: {
        liquidatedOfCommitted: liquidated / committed,
        paidOfLiquidated: liquidated > 0 ? paid / liquidated : null,
        paidOfCommitted: paid / committed
      },
      unliquidated: Math.max(0, committed - liquidated),
      unpaidLiquidated: Math.max(0, liquidated - paid)
    };
  }

  function renderIndependentBalances(container, entries, options = {}) {
    if (!container) return;
    const balances = (entries || []).map(item => {
      const value = Number.isFinite(item.value) ? currency.format(item.value) : 'Indisponível';
      const source = item.date ? '<small>Posição ' + escapeHtml(item.date) + '</small>' : '';
      return '<div class="financial-independent-item" role="button" tabindex="0" aria-pressed="false"'
        + ' title="' + escapeHtml(item.label + ': ' + value) + '">'
        + '<span class="financial-bar-label">' + escapeHtml(item.label) + '</span>'
        + '<strong class="financial-bar-value">' + escapeHtml(value) + '</strong>'
        + source + '</div>';
    }).join('');

    const links = (options.links || []).filter(item => item?.url).map(item =>
      '<a class="financial-chart-link" href="' + escapeHtml(item.url) + '">'
      + escapeHtml(item.label) + '</a>').join('');
    container.innerHTML = '<div class="financial-independent" role="group" aria-label="Saldos orçamentários independentes">'
      + '<div class="financial-independent-grid">' + balances + '</div>'
      + '<div class="financial-independent-links">' + links + '</div></div>';
  }


  function renderComparison(container, entries, options = {}) {
    if (!container) return;
    const valid = (entries || []).filter(entry => Number.isFinite(entry.value));
    if (!valid.length) {
      container.innerHTML = '<div class="chart-empty">Não há valores auditáveis disponíveis para esta comparação.</div>';
      return;
    }
    const scale = Math.max(1, ...valid.map(entry => Math.abs(entry.value)));
    const items = valid.map(entry => {
      const relative = Math.max(0, Math.min(100, Math.abs(entry.value) / scale * 100));
      return '<div class="financial-bar-row" role="button" tabindex="0" data-chart-selectable="1" aria-pressed="false" title="' + escapeHtml(entry.label + ': ' + currency.format(entry.value)) + '">'
        + '<span class="financial-bar-label">' + escapeHtml(entry.label) + '</span>'
        + '<span class="financial-bar-track" role="img" aria-label="' + escapeHtml(entry.label + ': ' + currency.format(entry.value)) + '">'
        + '<span class="financial-bar-fill" style="width:' + relative.toFixed(1) + '%"></span></span>'
        + '<strong class="financial-bar-value">' + escapeHtml(currency.format(entry.value)) + '</strong></div>';
    }).join('');

    const link = options.url
      ? '<a class="financial-chart-link" href="' + escapeHtml(options.url) + '">Ver relatório ↗</a>' : '';
    container.innerHTML = '<div class="financial-comparison" role="group" aria-label="Comparação de valores atuais">'
      + items + link + '</div>';
  }

  // Keep a readable shared currency scale for all bars. Negative net
  // adjustments occupy an equally scaled area below the real zero baseline.
  function monthlyAxisMaximum(months) {
    const highest = Math.max(0, ...(months || []).map(item =>
      Number.isFinite(item.value) ? Math.abs(item.value) : 0));
    if (highest <= 0) return 1;
    const stepSize = highest / 4;
    const power = Math.pow(10, Math.floor(Math.log10(stepSize)));
    const candidate = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find(unit => unit * power >= stepSize);
    return 4 * (candidate || 10) * power;
  }

  const axisCurrency = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', notation: 'compact',
    maximumFractionDigits: 1
  });

  function renderGruMonthly(container, result, options = {}) {
    if (!container) return;
    if (!result?.ok) {
      container.innerHTML = '<p class="chart-empty" role="status">Série mensal indisponível: '
        + escapeHtml(result?.reason || 'Sem dados auditáveis.') + '</p>';
      return;
    }
    const months = result.months || [];
    const maximum = monthlyAxisMaximum(months);
    const hasNegative = months.some(item => Number.isFinite(item.value) && item.value < 0);
    const ticks = hasNegative
      ? [maximum, maximum / 2, 0, -maximum / 2, -maximum]
      : [maximum, maximum * .75, maximum / 2, maximum * .25, 0];
    const axis = ticks.map((value, index) =>
      '<span class="gru-month-axis-tick" style="top:' + (index * 25) + '%"'
      + ' title="' + escapeHtml(currency.format(value)) + '">'
      + escapeHtml(axisCurrency.format(value)) + '</span>'
    ).join('');
    const bars = months.map(item => {
      const valid = Number.isFinite(item.value);
      const percent = valid ? Math.min(100, Math.abs(item.value) / maximum * 100) : 0;
      const negative = valid && item.value < 0;
      const valueLabel = valid ? currency.format(item.value) : 'Sem registros';
      const description = item.label + ': ' + valueLabel + '. ' + item.records
        + ' documento(s). Mês de emissão, não necessariamente do efetivo recolhimento. '
        + 'Selecione para conferir os detalhes.';
      const fill = '<span class="gru-month-column-fill" style="height:'
        + percent.toFixed(1) + '%"></span>';
      return '<button type="button" class="gru-month-button'
        + (negative ? ' is-negative' : '') + (!valid ? ' is-missing' : '')
        + '" data-gru-month="' + escapeHtml(item.label) + '" data-gru-value="'
        + escapeHtml(valueLabel)
        + '" data-gru-records="' + item.records + '" title="'
        + escapeHtml(description)
        + '" aria-pressed="false" aria-label="' + escapeHtml(description) + '">'
        + '<span class="gru-month-plot">'
        + '<span class="gru-month-positive">' + (!negative && valid ? fill : '') + '</span>'
        + '<span class="gru-month-negative">' + (negative ? fill : '') + '</span>'
        + '</span><span class="gru-month-short">' + escapeHtml(item.label.split('/')[0]) + '</span>'
        + '</button>';
    }).join('');
    container.innerHTML = '<div class="gru-month-panel">'
      + '<p class="gru-axis-heading">Movimentação líquida (R$) · escala comum</p>'
      + '<div class="gru-month-chart-layout" style="--gru-upper-height:'
      + (hasNegative ? '105px' : '210px') + ';--gru-lower-height:'
      + (hasNegative ? '105px' : '0px') + '">'
      + '<div class="gru-month-axis" aria-label="Eixo vertical em reais">' + axis + '</div>'
      + '<div class="gru-month-chart-scroll"><div class="gru-month-chart" role="group"'
      + ' aria-label="Valores líquidos por mês de emissão, com referência de zero">'
      + bars + '</div></div></div>'
      + '<p class="gru-visual-note">Eixo vertical em reais. Colunas acima do zero representam valores positivos;'
      + ' valores abaixo do zero representam estornos líquidos. Selecione um mês para ver o valor exato.'
      + ' Mês de emissão não equivale necessariamente ao mês do recolhimento.</p>'
      + (options.url ? '<a class="financial-chart-link" href="' + escapeHtml(options.url)
        + '">Consultar relatório de origem</a>' : '')
      + '</div>';
  }


  // The NE CCor amount is repeated for NEs that have multiple ND lines.
  // The three stage balances are distributed across those lines, so ONLY they
  // can be summed by ND. Reconcile against audited totals and distinct NEs.
  const ND_STAGE_CODES = ['622920101', '622920103', '622920104'];
  const ND_STAGE_METRICS = ['saldo_a_liquidar', 'liquidado_a_pagar', 'pago'];

  function buildNdCommitments(report, expectedAuditedTotal = null) {
    const unavailable = reason => ({ ok: false, reason, items: [] });
    if (!report || report.quality?.ok === false || !Array.isArray(report.rows) || !report.rows.length) {
      return unavailable('Não há registros detalhados válidos no relatório de empenhos.');
    }
    const fields = (report.columns || []).map(name => ({ name, normalized: normalize(name) }));
    const nd = fields.find(f => f.normalized === 'natureza despesa detalhada (2)')?.name;
    const stages = ND_STAGE_CODES.map(code => {
      const matches = fields.filter(f => f.normalized.startsWith(code + ' /')
        && f.normalized.includes('saldo'));
      return matches.length === 1 ? matches[0].name : null;
    });
    if (!nd || stages.some(name => !name)) {
      return unavailable('Natureza detalhada ou saldos das contas 622920101, 622920103 e 622920104 indisponíveis.');
    }
    const ne = fields.find(f => f.normalized === 'ne ccor')?.name;
    const gross = fields.find(f => f.normalized === 'conta contabil / ne ccor - valor')?.name;
    // Validate per-NE only if both source dimensions are present.
    if (Boolean(ne) !== Boolean(gross)) {
      return unavailable('Chave da nota de empenho e valor total não estão disponíveis para conferência.');
    }

    const entries = new Map();
    const generalEntries = new Map();
    const detailedEntries = new Map();
    const generalField = fields.find(f => f.normalized === 'natureza despesa')?.name;
    const codeField = fields.find(f => f.normalized === 'natureza despesa detalhada')?.name;
    const perNe = new Map();
    const totals = [0, 0, 0];
    let total = 0;
    for (const row of report.rows) {
      const description = String(row?.[nd] ?? '').trim();
      // Tesouro Gerencial can leave an unused stage cell empty, meaning zero.
      // Never convert malformed non-empty data or entirely empty rows to zero.
      const rawStages = stages.map(name => String(row?.[name] ?? '').trim());
      const cents = rawStages.map(value => value === '' ? 0 : amountCents(value));
      if (!description || /^total(?:\s+geral)?$/i.test(description)
        || rawStages.every(value => value === '')
        || cents.some(value => value === null)) {
        return unavailable('Descrição da ND ou saldo contábil inválido; conferir relatório de origem.');
      }
      const rowTotal = cents.reduce((sum, value) => sum + value, 0);
      const entry = entries.get(description) || { description, cents: 0, records: 0 };
      entry.cents += rowTotal;
      entry.records++;
      total += rowTotal;
      for (let i = 0; i < totals.length; i++) totals[i] += cents[i];
      if (!Number.isSafeInteger(total) || !Number.isSafeInteger(entry.cents)
        || !totals.every(Number.isSafeInteger)) {
        return unavailable('Os valores excedem a precisão monetária de centavos.');
      }
      entries.set(description, entry);
      const generalName = String(row?.[generalField] ?? '').trim() || 'Natureza não identificada';
      const detailCode = String(row?.[codeField] ?? '').trim() || description;
      const detailKey = generalName + '\\u0000' + detailCode + '\\u0000' + description;
      const general = generalEntries.get(generalName) || { key: generalName, description: generalName, cents: 0, records: 0 };
      general.cents += rowTotal;
      general.records++;
      generalEntries.set(generalName, general);
      const detail = detailedEntries.get(detailKey) || {
        key: detailKey, code: detailCode, description, generalKey: generalName, cents: 0, records: 0
      };
      detail.cents += rowTotal;
      detail.records++;
      detailedEntries.set(detailKey, detail);

      if (ne && gross) {
        const key = String(row?.[ne] ?? '').trim();
        const grossCents = amountCents(row?.[gross]);
        if (!key || grossCents === null) {
          return unavailable('Número de empenho ou valor da NE inválido.');
        }
        const previously = perNe.get(key);
        if (previously && previously.gross !== grossCents) {
          return unavailable('Valor total da mesma NE diverge entre as linhas detalhadas.');
        }
        perNe.set(key, { gross: grossCents, sum: (previously?.sum || 0) + rowTotal });
        if (!Number.isSafeInteger(perNe.get(key).sum)) {
          return unavailable('O agrupamento por NE excede a precisão de centavos.');
        }
      }
    }
    if ([...perNe.values()].some(value => Math.abs(value.sum - value.gross) > 1)) {
      return unavailable('Os saldos contábeis não conciliam com o valor único de uma ou mais NEs.');
    }
    if (ND_STAGE_METRICS.some(key => key in (report.metrics || {}))) {
      const auditCents = ND_STAGE_METRICS.map(key => {
        const meta = report.metrics_meta?.[key];
        return meta?.status === 'ok' && meta?.fallback !== true
          ? amountCents(report.metrics?.[key]) : null;
      });
      if (auditCents.some(value => value === null)
        || auditCents.some((value, i) => Math.abs(value - totals[i]) > 1)) {
        return unavailable('A soma das contas por ND diverge dos três saldos auditados do relatório.');
      }
    }
    if (expectedAuditedTotal !== null) {
      const expected = amountCents(expectedAuditedTotal);
      if (expected === null || Math.abs(expected - total) > 1) {
        return unavailable('Total dos empenhos por ND diverge do relatório auditado de despesas do exercício.');
      }
    }

    const items = [...entries.values()].map(item => ({
      description: item.description, value: item.cents / 100, records: item.records
    })).sort((a, b) => b.value - a.value || a.description.localeCompare(b.description, 'pt-BR'));
    const asItems = map => [...map.values()].map(item => ({
      ...item, value: item.cents / 100
    })).sort((a, b) => b.value - a.value || a.description.localeCompare(b.description, 'pt-BR'));
    return {
      ok: true, items, generalItems: asItems(generalEntries), detailedItems: asItems(detailedEntries),
      records: report.rows.length, uniqueCommitments: perNe.size,
      groups: entries.size, total: total / 100,
      groupColumn: nd, valueColumns: stages, date: report.date || '',
      positiveTotal: items.filter(item => item.value > 0).reduce((sum, item) => sum + item.value, 0)
    };
  }

  // Shared source totals are immutable: switching hierarchy only changes the
  // displayed grouping, never the three audited stage balances.
  function buildNdCommitmentView(model, options = {}) {
    if (!model?.ok) return model;
    const mode = options.mode === 'detailed' ? 'detailed' : 'general';
    const parent = mode === 'detailed' ? String(options.parent || '') : '';
    const universe = mode === 'general' ? (model.generalItems || model.items)
      : (model.detailedItems || model.items).filter(item => !parent || item.generalKey === parent);
    const limit = options.showAll ? universe.length : mode === 'general' ? 20 : parent ? 24 : 18;
    const positives = universe.filter(item => item.value > 0);
    const negative = universe.filter(item => item.value < 0);
    const scopeTotal = universe.reduce((sum, item) => sum + item.value, 0);
    const positiveTotal = positives.reduce((sum, item) => sum + item.value, 0);
    const shown = positives.slice(0, limit).map(item => ({ ...item }));
    const remaining = positives.slice(limit);
    if (remaining.length) shown.push({
      key: '__other__', description: 'Outras naturezas (' + remaining.length + ')',
      value: remaining.reduce((sum, item) => sum + item.value, 0),
      records: remaining.reduce((sum, item) => sum + item.records, 0),
      aggregate: true
    });
    return {
      ...model, mode, parent, items: shown, allCount: universe.length,
      remainingCount: remaining.length, negativeCount: negative.length,
      scopeTotal, positiveTotal, filtered: Boolean(parent)
    };
  }

  function renderNdCommitments(container, result, options = {}) {
    if (!container) return;
    if (!result?.ok) {
      container.innerHTML = '<p class="chart-empty" role="status">'
        + escapeHtml(result?.reason || 'Relatório de empenhos indisponível.') + '</p>';
      return;
    }
    // Backwards-compatible default: grouped detailed view with a compact map.
    const view = result.mode ? result : buildNdCommitmentView(result, {
      mode: 'detailed', showAll: false
    });
    const tiles = treemapLayout(view.items).map((item, index) => {
      const percentage = view.positiveTotal > 0 ? item.value / view.positiveTotal * 100 : 0;
      const compact = item.w < 21 || item.h < 25;
      const style = 'left:' + item.x.toFixed(4) + '%;top:' + item.y.toFixed(4)
        + '%;width:' + item.w.toFixed(4) + '%;height:' + item.h.toFixed(4) + '%';
      const text = (item.code && !item.aggregate ? item.code + ' · ' : '') + item.description
        + ' · ' + currency.format(item.value)
        + ' · ' + percentage.toFixed(1).replace('.', ',') + '% do total positivo'
        + ' · ' + item.records + ' registro(s). '
        + (item.aggregate ? 'Selecione para mostrar outras naturezas.'
          : view.mode === 'general' ? 'Selecione para aprofundar as NDs deste grupo.'
          : 'Selecione para conferir o detalhamento.');
      const drill = view.mode === 'general' && !item.aggregate ? ' data-nd-drill="general"' : '';
      return '<button type="button" class="gru-treemap-tile nd-treemap-tile gru-tile-color-'
        + (index % 8) + (compact ? ' is-compact' : '') + '" style="' + style
        + '" data-nd-description="' + escapeHtml(item.description)
        + '" data-nd-key="' + escapeHtml(item.key || item.description)
        + '" data-nd-other="' + (item.aggregate ? 'true' : 'false') + '"'
        + drill
        + ' data-nd-value="' + escapeHtml(currency.format(item.value))
        + '" data-nd-share="' + percentage.toFixed(1)
        + '" data-nd-records="' + item.records
        + '" aria-pressed="false" title="' + escapeHtml(text)
        + '" aria-label="' + escapeHtml(text)
        + '"><span class="gru-tile-name">' + escapeHtml(item.description)
        + '</span><strong class="gru-tile-amount">' + escapeHtml(currency.format(item.value))
        + '</strong></button>';
    }).join('');
    const adjustments = view.negativeCount
      ? '<p class="nd-chart-adjustments">' + view.negativeCount
        + ' natureza(s) com saldo negativo, fora do mapa; consultar relatório completo.</p>' : '';
    container.innerHTML = '<div class="gru-treemap nd-treemap" role="group"'
      + ' aria-label="Empenhos por natureza com valores conciliados">'
      + (tiles || '<p class="chart-empty">Nenhum valor positivo.</p>') + '</div>'
      + adjustments;
  }

  const api = { buildGruMonthly, buildGruByCode, buildNdCommitments, buildNdCommitmentView, renderNdCommitments, treemapLayout, fitTreemapLabels, buildCommitmentProvisionRatio, buildExpenseStages, locateGruColumns, parseAmount, amountCents, civilDate, renderComparison, renderIndependentBalances, renderGruMonthly, renderGruCodes };
  root.EmailBackupHubFinancialCharts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
