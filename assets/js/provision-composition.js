/* Composição auditada dos provisionamentos por Grupo de Natureza da Despesa.
 * Não confunde provisões recebidas com empenhos ou dotação disponível. */
(function (root) {
  'use strict';

  const financial = root.EmailBackupHubFinancialCharts
    || (typeof require === 'function' ? require('./financial-chart-provenance') : null);
  const groups = [
    { code: '3', label: 'Outras despesas correntes', key: 'current' },
    { code: '4', label: 'Investimentos', key: 'investment' }
  ];
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const percent = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const normalize = value => String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const invalid = reason => ({ ok: false, reason });
  const amountCents = value => financial?.amountCents?.(value) ?? null;

  function buildModel(report, summary = null) {
    if (!report || !Array.isArray(report.rows) || !report.rows.length) {
      return invalid('O relatório não contém lançamentos de provisionamento.');
    }
    if (report.quality?.ok !== true || report.metrics_meta?.provisionado?.status !== 'ok'
      || report.metrics_meta.provisionado.fallback === true) {
      return invalid('O total de provisionamentos não possui validação contábil suficiente.');
    }
    if (summary && (summary.date_iso && summary.date_iso !== report.date_iso
      || summary.metadata?.hash_conteudo && summary.metadata.hash_conteudo !== report.metadata?.hash_conteudo
      || amountCents(summary.metrics?.provisionado) !== amountCents(report.metrics?.provisionado))) {
      return invalid('A posição do relatório detalhado não coincide com o resumo auditado.');
    }
    const audited = amountCents(report.metrics?.provisionado);
    if (audited === null || audited <= 0) return invalid('O total auditado é nulo ou inválido.');

    const columns = report.columns || [];
    const categoryColumns = columns.filter(col => /^grupo despesa(?:\s*\/|\s*\(|$)/.test(normalize(col)));
    const valueColumn = columns.find(col => normalize(col).startsWith('saldo - moeda origem (item informacao)'));
    const actionColumn = columns.find(col => normalize(col).startsWith('acao governo'));
    if (categoryColumns.length !== 2 || !valueColumn || !actionColumn) {
      return invalid('Não foi possível identificar as colunas de grupo de despesa e valor monetário.');
    }
    const [codeColumn, labelColumn] = categoryColumns;
    const cents = { '3': 0, '4': 0 };
    const counts = { '3': 0, '4': 0 };
    const actionSums = new Map();
    for (const row of report.rows) {
      const code = String(row[codeColumn] ?? '').trim();
      const group = groups.find(item => item.code === code);
      const amount = amountCents(row[valueColumn]);
      const action = normalize(row[actionColumn]);
      if (!group || normalize(row[labelColumn]) !== normalize(group.label)
        || amount === null || !action) {
        return invalid('Há lançamentos sem grupo de despesa válido ou com valores não interpretáveis.');
      }
      cents[code] += amount;
      counts[code]++;
      actionSums.set(action, (actionSums.get(action) || 0) + amount);
      if (!Number.isSafeInteger(cents[code]) || !Number.isSafeInteger(actionSums.get(action))) {
        return invalid('A soma excede a precisão monetária segura.');
      }
    }

    // Na versão antiga do parser a primeira ação PNAE foi incorporada aos
    // cabeçalhos. Recuperação restrita a UM subtotal órfão, conciliado com o
    // total auditado e classificado explicitamente pelo cabeçalho original.
    const missingSubtotals = [];
    for (const total of report.totals || []) {
      const action = normalize(total.label);
      if (action === 'total' || action === 'total geral') continue;
      const value = amountCents(total.values?.[valueColumn] ?? total.raw?.[valueColumn]);
      if (!action || value === null) return invalid('Há subtotais sem valor auditável.');
      if (actionSums.has(action)) {
        if (Math.abs(actionSums.get(action) - value) > 1) {
          return invalid('Os lançamentos não conciliam com o subtotal da ação ' + total.label + '.');
        }
      } else {
        missingSubtotals.push({ action: total.label, cents: value });
      }
    }

    let recovered = null;
    let sum = cents['3'] + cents['4'];
    if (sum !== audited) {
      const orphan = missingSubtotals.length === 1 ? missingSubtotals[0] : null;
      const headerCode = /\/\s*([34])\s*$/.exec(codeColumn)?.[1];
      const headerLabel = labelColumn.includes('/') ? labelColumn.split('/').pop().trim() : '';
      const headerGroup = groups.find(item => item.code === headerCode);
      if (!orphan || !headerGroup || normalize(headerLabel) !== normalize(headerGroup.label)
        || orphan.cents <= 0 || audited - sum !== orphan.cents) {
        return invalid('Os grupos não reconciliam com o total auditado dos provisionamentos.');
      }
      cents[headerCode] += orphan.cents;
      sum += orphan.cents;
      recovered = { label: orphan.action, code: headerCode, value: orphan.cents / 100 };
    }
    if (sum !== audited || groups.some(group => cents[group.code] < 0)) {
      return invalid('Os saldos líquidos dos grupos são incompatíveis com a composição em rosca.');
    }
    return {
      ok: true, total: audited / 100, date: report.date || '',
      groups: groups.map(group => ({
        ...group, value: cents[group.code] / 100,
        count: counts[group.code], share: cents[group.code] / audited
      })),
      recovered, source: 'data/reports/provisionamentos.json'
    };
  }

  let selectedGroup = null;

  function syncSelection(container, model, detail) {
    const chosen = model?.groups?.find(group => group.code === selectedGroup);
    for (const item of container.querySelectorAll('[data-provision-group]')) {
      const active = Boolean(chosen && item.dataset.provisionGroup === chosen.code);
      item.setAttribute('aria-pressed', String(active));
      item.classList.toggle('is-selected', active);
    }
    if (!detail) return;
    detail.hidden = !chosen;
    detail.textContent = chosen
      ? chosen.label + ': ' + currency.format(chosen.value) + ' de '
        + currency.format(model.total) + ' (' + percent.format(chosen.share * 100)
        + '%). ' + chosen.count + ' lançamento(s) detalhado(s).'
        + (model.recovered?.code === chosen.code
          ? ' Inclui ' + currency.format(model.recovered.value)
            + ' do totalizador ' + model.recovered.label + ', conferido no relatório original.'
          : '')
      : '';
  }

  function render(container, model, detail) {
    if (!container) return;
    if (!model?.ok) {
      selectedGroup = null;
      container.innerHTML = '<p class="chart-empty" role="status">Composição indisponível: '
        + escapeHtml(model?.reason || 'dados não carregados') + '</p>';
      if (detail) { detail.hidden = true; detail.textContent = ''; }
      return;
    }
    const radius = 70;
    const perimeter = 2 * Math.PI * radius;
    let offset = 0;
    const arcs = model.groups.filter(group => group.value > 0).map(group => {
      const length = perimeter * group.share;
      const title = group.label + ': ' + currency.format(group.value)
        + ', ' + percent.format(group.share * 100) + '% do total provisionado. Selecione para detalhar.';
      const markup = '<circle class="provision-donut-arc provision-donut-arc--' + group.key
        + '" cx="100" cy="100" r="' + radius + '" fill="none" stroke-width="25"'
        + ' transform="rotate(-90 100 100)" stroke-dasharray="' + length.toFixed(5) + ' '
        + perimeter.toFixed(5) + '" stroke-dashoffset="' + (-offset).toFixed(5) + '"'
        + ' data-provision-group="' + group.code + '" role="button" tabindex="0"'
        + ' aria-pressed="false" aria-label="' + escapeHtml(title) + '" title="'
        + escapeHtml(title) + '"></circle>';
      offset += length;
      return markup;
    }).join('');
    const legend = model.groups.map(group => {
      const title = group.label + ': ' + currency.format(group.value)
        + ', ' + percent.format(group.share * 100) + '%. Clique para detalhar.';
      return '<button type="button" class="provision-legend-item" data-provision-group="'
        + group.code + '" aria-pressed="false" title="' + escapeHtml(title)
        + '" aria-label="' + escapeHtml(title) + '">'
        + '<span class="provision-legend-swatch provision-legend-swatch--' + group.key
        + '" aria-hidden="true"></span><span class="provision-legend-copy">'
        + '<span class="provision-legend-label">' + escapeHtml(group.label) + '</span>'
        + '<strong>' + escapeHtml(currency.format(group.value)) + '</strong>'
        + '<span class="provision-legend-share">' + percent.format(group.share * 100)
        + '% do total</span></span></button>';
    }).join('');
    const note = model.recovered
      ? '<p class="provision-composition-note">Conciliação: '
        + escapeHtml(currency.format(model.recovered.value))
        + ' identificado no totalizador de ' + escapeHtml(model.recovered.label)
        + ' (grupo confirmado no cabeçalho do relatório original).</p>'
      : '';
    const totalShort = model.total >= 1000000
      ? 'R$ ' + (model.total / 1000000).toLocaleString('pt-BR',
        { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' mi'
      : model.total >= 10000
        ? 'R$ ' + (model.total / 1000).toLocaleString('pt-BR',
          { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mil'
        : currency.format(model.total);
    container.innerHTML = '<div class="provision-composition-body">'
      + '<div class="provision-donut-frame"><svg class="provision-donut" viewBox="0 0 200 200"'
      + ' role="group" aria-label="Rosca de composição por grupo da despesa">'
      + '<circle class="provision-donut-track" cx="100" cy="100" r="' + radius
      + '" fill="none" stroke-width="25"></circle>' + arcs + '</svg>'
      + '<div class="provision-donut-center" aria-hidden="true"><span>Total provisionado</span>'
      + '<strong>' + escapeHtml(totalShort) + '</strong></div></div>'
      + '<div class="provision-legend" role="group" aria-label="Selecionar grupo da despesa">'
      + legend + '</div></div>'
      + '<p class="provision-composition-note">Total: <strong>'
      + escapeHtml(currency.format(model.total)) + '</strong> · Posição de ' + escapeHtml(model.date)
      + ' · valores líquidos recebidos por provisão, não valores empenhados.</p>' + note;
    syncSelection(container, model, detail);

    if (typeof container.addEventListener === 'function' && !container.dataset.provisionBound) {
      container.dataset.provisionBound = '1';
      const select = target => {
        const item = target.closest?.('[data-provision-group]');
        if (!item || !container.contains(item)) return;
        selectedGroup = selectedGroup === item.dataset.provisionGroup
          ? null : item.dataset.provisionGroup;
        syncSelection(container, container.provisionModel, container.provisionDetail);
      };
      container.addEventListener('click', event => select(event.target));
      container.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const item = event.target.closest?.('.provision-donut-arc[data-provision-group]');
        if (!item) return; // Buttons have their own native keyboard activation.
        event.preventDefault();
        select(item);
      });
    }
    container.provisionModel = model;
    container.provisionDetail = detail;
  }

  const api = { buildModel, render };
  root.EmailBackupHubProvisions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
