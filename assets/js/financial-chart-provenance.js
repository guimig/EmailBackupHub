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
    return { day: day?.name, month: month?.name, value: net?.name };
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

  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

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
    const foot = options.note
      ? '<p class="financial-chart-note">' + escapeHtml(options.note) + '</p>' : '';
    const link = options.url
      ? '<a class="financial-chart-link" href="' + escapeHtml(options.url) + '">Consultar relatório de origem</a>' : '';
    container.innerHTML = '<div class="financial-comparison" role="group" aria-label="Comparação de valores atuais">'
      + items + foot + link + '</div>';
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
    const bars = result.months.map(item => {
      const available = Number.isFinite(item.value);
      const width = available ? Math.max(0, Math.min(100, Math.abs(item.value) / scale * 100)) : 0;
      const title = available ? currency.format(item.value) + ' · ' + item.records + ' documento(s)' : 'Sem registros válidos';
      return '<div class="financial-bar-row financial-month-row">'
        + '<span class="financial-bar-label">' + escapeHtml(item.label) + '</span>'
        + '<span class="financial-bar-track" role="img" aria-label="' + escapeHtml(item.label + ': ' + title) + '">'
        + (available ? '<span class="financial-bar-fill" style="width:' + width.toFixed(1) + '%"></span>' : '')
        + '</span><strong class="financial-bar-value">' + (available ? escapeHtml(currency.format(item.value)) : 'Sem registros') + '</strong></div>';
    }).join('');
    const note = result.records + ' registros reconciliados com o total auditado (' + currency.format(result.total)
      + '). Mês de emissão do documento, não necessariamente da arrecadação efetiva. Fonte: relatório de '
      + result.sourceDate.split('-').reverse().join('/') + '.';
    container.innerHTML = '<div class="financial-monthly" role="group" aria-label="GRU por mês de emissão">'
      + bars + '<p class="financial-chart-note">' + escapeHtml(note) + '</p>'
      + (options.url ? '<a class="financial-chart-link" href="' + escapeHtml(options.url)
        + '">Consultar documentos de GRU</a>' : '') + '</div>';
  }

  const api = { buildGruMonthly, locateGruColumns, parseAmount, amountCents, civilDate, renderComparison, renderGruMonthly };
  root.EmailBackupHubFinancialCharts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
