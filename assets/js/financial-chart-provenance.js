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
  function buildCommitmentProvisionRatio(provisions, expenditure) {
    const unavailable = reason => ({ ok: false, value: null, reason });
    const trustworthy = (doc, key) => doc && doc.quality?.ok !== false
      && Number.isFinite(doc.metrics?.[key])
      && doc.metrics_meta?.[key]?.status === 'ok'
      && doc.metrics_meta?.[key]?.fallback !== true;
    if (!trustworthy(provisions, 'provisionado') || !trustworthy(expenditure, 'empenhado')) {
      return unavailable('Valores auditáveis de provisionamento ou empenho indisponíveis.');
    }
    const date = String(provisions.date_iso || '');
    const year = Number(provisions.metadata?.exercicio);
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)
        || date !== expenditure.date_iso
        || !Number.isInteger(year) || year !== Number(expenditure.metadata?.exercicio)
        || year !== Number(date.slice(0,4))) {
      return unavailable('Relatórios de exercícios ou datas de referência diferentes.');
    }
    const provisioned = provisions.metrics.provisionado;
    const committed = expenditure.metrics.empenhado;
    if (provisioned <= 0 || committed < 0 || committed > provisioned + 0.01) {
      return unavailable('Valores nulos, negativos ou acima de 100%: escopo não comparável.');
    }
    return { ok: true, value: committed / provisioned, date, provisioned, committed,
      reason: 'Relação indicativa de relatórios distintos, não taxa formal de utilização da dotação.' };
  }

  function renderGruCodes(container, result) {
    if (!container) return;
    if (!result?.ok) {
      container.innerHTML = '<p class="chart-empty" role="status">Códigos indisponíveis: '
        + escapeHtml(result?.reason || 'Não foi possível reconciliar os códigos.') + '</p>';
      return;
    }
    const scale = Math.max(1, ...result.items.map(item => Math.abs(item.value)));
    const rows = result.items.map(item => {
      const width = Math.min(100, Math.abs(item.value) / scale * 100);
      const label = item.code + ' · ' + item.description;
      return '<div class="gru-code-row"><div class="gru-code-top">'
        + '<span class="gru-code-label" title="' + escapeHtml(label) + '"><b>'
        + escapeHtml(item.code) + '</b> ' + escapeHtml(item.description) + '</span>'
        + '<strong class="gru-code-value">' + escapeHtml(currency.format(item.value))
        + '</strong></div><div class="gru-code-track" role="img" aria-label="'
        + escapeHtml(label + ': ' + currency.format(item.value)) + '"><span class="gru-code-fill'
        + (item.value < 0 ? ' is-negative' : '') + '" style="width:'
        + width.toFixed(1) + '%"></span></div></div>';
    });
    const more = rows.length > 4
      ? '<details class="gru-code-more"><summary>Ver todos os ' + result.items.length
        + ' códigos</summary>' + rows.slice(4).join('') + '</details>' : '';
    container.innerHTML = '<div class="gru-codes" aria-label="Composição por código de recolhimento">'
      + '<h4>Por código de recolhimento</h4>'
      + '<div class="gru-code-list">' + rows.slice(0,4).join('') + '</div>' + more
      + '<p class="gru-code-period">Acumulado de ' + escapeHtml(String(result.year))
      + ' · movimentação líquida reconciliada, incluindo estornos.</p></div>';
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
      return '<div class="financial-independent-item">'
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
      return '<div class="financial-bar-row">'
        + '<span class="financial-bar-label">' + escapeHtml(entry.label) + '</span>'
        + '<span class="financial-bar-track" role="img" aria-label="' + escapeHtml(entry.label + ': ' + currency.format(entry.value)) + '">'
        + '<span class="financial-bar-fill" style="width:' + relative.toFixed(1) + '%"></span></span>'
        + '<strong class="financial-bar-value">' + escapeHtml(currency.format(entry.value)) + '</strong></div>';
    }).join('');

    const link = options.url
      ? '<a class="financial-chart-link" href="' + escapeHtml(options.url) + '">Consultar relatório de origem</a>' : '';
    container.innerHTML = '<div class="financial-comparison" role="group" aria-label="Comparação de valores atuais">'
      + items + link + '</div>';
  }

  function renderGruMonthly(container, result, options = {}) {
    if (!container) return;
    if (!result?.ok) {
      container.innerHTML = '<div class="chart-empty" role="status"><strong>Série mensal não disponível com segurança.</strong>'
        + '<p>' + escapeHtml(result?.reason || 'Dados indisponíveis.') + '</p>'
        + '<p>O total auditado permanece no indicador acima. Não usamos datas de extração para preencher os meses.</p></div>';
      return;
    }
    const scale = Math.max(1, ...result.months.filter(item => Number.isFinite(item.value))
      .map(item => Math.abs(item.value)));
    const monthRows = result.months.map(item => {
      const available = Number.isFinite(item.value);
      const width = available ? Math.max(0, Math.min(100, Math.abs(item.value) / scale * 100)) : 0;
      const title = available ? currency.format(item.value) + ' · ' + item.records + ' documento(s)' : 'Sem registros válidos';
      return '<div class="financial-bar-row financial-month-row' + (available && item.value < 0 ? ' is-negative' : '') + '">'
        + '<span class="financial-bar-label">' + escapeHtml(item.label) + '</span>'
        + '<span class="financial-bar-track" role="img" aria-label="' + escapeHtml(item.label + ': ' + title) + '">'
        + (available ? '<span class="financial-bar-fill" style="width:' + width.toFixed(1) + '%"></span>' : '')
        + '</span><strong class="financial-bar-value">' + (available ? escapeHtml(currency.format(item.value)) : 'Sem registros') + '</strong></div>';
    });
    const populated = result.months.filter(item => Number.isFinite(item.value));
    const peak = populated.reduce((best, item) =>
      !best || Math.abs(item.value) > Math.abs(best.value) ? item : best, null);
    const overview = '<div class="gru-month-summary" aria-label="Resumo dos meses de emissão">'
      + '<div><span>Meses com registros</span><strong>' + populated.length + ' de ' + result.months.length + '</strong></div>'
      + '<div><span>Maior movimentação líquida em módulo</span><strong>'
      + (peak ? escapeHtml(peak.label) + ' · ' + escapeHtml(currency.format(peak.value)) : 'Sem dado')
      + '</strong></div></div>'
      + '<p class="gru-scale-note">Comprimento relativo ao maior valor mensal em módulo. Valores negativos são movimentações líquidas negativas; a barra não representa participação percentual do total.</p>';

    const hasNegative = populated.some(item => item.value < 0);
    const year = Number.isInteger(result.year) ? String(result.year) : '';
    const timeline = '<div class="gru-timeline-viewport" tabindex="0" aria-label="Gráfico mensal da GRU; role horizontalmente para consultar todos os meses">'
      + '<div class="gru-timeline' + (hasNegative ? ' has-negative' : '') + '" role="list" aria-label="Movimentação líquida por mês de emissão">'
      + result.months.map(item => {
        const available = Number.isFinite(item.value);
        const negative = available && item.value < 0;
        const height = available ? Math.min(100, Math.abs(item.value) / scale * 100) : 0;
        const label = available ? currency.format(item.value) : 'Sem registros';
        const month = String(item.label || '').split('/')[0];
        return '<div class="gru-timeline-month' + (!available ? ' is-missing' : '') + '" role="listitem"'
          + ' tabindex="0" title="' + escapeHtml(item.label + ': ' + label) + '"'
          + ' aria-label="' + escapeHtml(item.label + ', ' + label + ', ' + item.records + ' documento(s)') + '">'
          + '<div class="gru-timeline-positive">'
          + (!negative && available ? '<span class="gru-timeline-fill" style="height:' + height.toFixed(1) + '%"></span>' : '')
          + '</div><div class="gru-timeline-negative">'
          + (negative ? '<span class="gru-timeline-fill" style="height:' + height.toFixed(1) + '%"></span>' : '')
          + '</div><span class="gru-timeline-label">' + escapeHtml(month) + '</span>'
          + '</div>';
      }).join('') + '</div>'
      + '<p class="gru-timeline-caption">Meses de emissão ' + escapeHtml(year)
      + ' · a linha separa movimentos positivos e negativos.</p></div>';
    const midpoint = Math.ceil(monthRows.length / 2);
    const bars = '<div class="gru-month-grid">'
      + '<div class="gru-month-column">' + monthRows.slice(0, midpoint).join('') + '</div>'
      + '<div class="gru-month-column">' + monthRows.slice(midpoint).join('') + '</div>'
      + '</div>';
    const note = result.records + ' registros reconciliados com o total auditado (' + currency.format(result.total)
      + '). Mês de emissão do documento, não necessariamente da arrecadação efetiva. Fonte: relatório de '
      + result.sourceDate.split('-').reverse().join('/') + '.';
    container.innerHTML = '<div class="financial-monthly" role="group" aria-label="GRU por mês de emissão">'
      + overview + timeline
      + '<details class="gru-months-details"><summary>Consultar valores exatos de cada mês</summary>' + bars + '</details>'

      + (options.url ? '<a class="financial-chart-link" href="' + escapeHtml(options.url)
        + '">Consultar documentos de GRU</a>' : '') + '</div>';
  }

  const api = { buildGruMonthly, buildGruByCode, buildCommitmentProvisionRatio, buildExpenseStages, locateGruColumns, parseAmount, amountCents, civilDate, renderComparison, renderIndependentBalances, renderGruMonthly, renderGruCodes };
  root.EmailBackupHubFinancialCharts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
