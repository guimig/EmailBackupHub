'use strict';
(function () {
  let attempts = 0;
  function verify() {
    const el = id => document.getElementById(id);

    const expense = el('expenseTrendChart');
    const credit = el('creditDonut');
    const gru = el('gruTreeChart');
    if (!expense.querySelector('.financial-comparison') || !gru.querySelector('.financial-monthly')) {
      if (attempts++ < 50) return setTimeout(verify, 100);
      document.documentElement.dataset.dashboardQa = encodeURIComponent(JSON.stringify({ loaded: false,
        expense: expense.textContent.slice(0,100), gru: gru.textContent.slice(0,100) }));
      return;
    }
    const qa = {};
    qa.loaded = el('totalReports').textContent === '7';
    qa.auditedKpis = /50\.000/.test(el('committedTotal').textContent) &&
      /100\.000/.test(el('budgetBase').textContent);
    qa.expenseShowsCurrentBalances = expense.querySelectorAll('.financial-bar-row').length === 3 &&
      !expense.querySelector('circle.history-point');
    qa.creditShowsDistinctBalances = credit.querySelectorAll('.financial-independent-item').length === 2 &&
      credit.querySelectorAll('.financial-bar-track').length === 0 &&
      !credit.querySelector('circle.history-point');
    qa.creditFigureIsNotTemporalPercent = credit.textContent.includes('40.000') &&
      !credit.textContent.includes('40.000%') &&
      credit.textContent.includes('não são fatias');
    qa.monthlyGruReconciled = gru.querySelectorAll('.financial-month-row').length === 11 &&
      gru.textContent.includes('2.500');
    qa.monthlySourceLabels = gru.textContent.includes('JAN/2026') &&
      gru.textContent.includes('NOV/2026') &&
      gru.textContent.toLocaleLowerCase('pt-BR').includes('mês de emissão');
    qa.provenanceInfoVisible = document.querySelector('.dashboard-provenance')
      ?.textContent.includes('não a data de cada lançamento');
    qa.noFalseHistorySelector = el('historyRange') === null;
    qa.noSnapshotLinePoints = document.querySelectorAll('circle.history-point').length === 0;
    qa.expenseSourceLink = Boolean(expense.querySelector('a.financial-chart-link[href*="report-viewer.html"]'));
    const oldTheme = document.documentElement.dataset.theme;
    el('themeToggle').click();
    qa.themeKeepsAccurateCharts = document.documentElement.dataset.theme !== oldTheme &&
      expense.querySelectorAll('.financial-bar-row').length === 3 &&
      gru.querySelectorAll('.financial-month-row').length === 11;
    qa.chartHelpAccessible = getComputedStyle(document.querySelector('.chart-help')).display !== 'none';
    const rap = el('rapStackChart');
    qa.rapPercentClearlyNamed = el('rapShareValue').textContent.includes('83,3')
      && el('rapShareMeaning').textContent.includes('do total de RAP acompanhado');
    qa.rapShowsOneStackedComposition = rap.querySelectorAll('.rap-composition-track').length === 1
      && rap.querySelectorAll('.rap-composition-fill').length === 2
      && rap.querySelectorAll('.rap-bars').length === 0;
    qa.rapExplainsBothPercentagesAndDenominator = ['10.000','2.000','12.000','83,3','16,7']
      .every(part => rap.textContent.includes(part))
      && rap.textContent.includes('base dos percentuais');
    qa.rapOpensOriginalReport = Boolean(rap.querySelector('.rap-composition-link[href*="restos-a-pagar-rap"]'));
    const managementPanel = el('managementAlertsPanel');
    const managementList = el('managementAlerts');
    qa.managementInitiallyCollapsed = !managementPanel.open
      && managementPanel.tagName.toLowerCase() === 'details';
    const managementCount = managementList.querySelectorAll('.alert-item').length;
    qa.managementCountMatchesGeneratedAlerts = el('managementAlertCount').textContent ===
      (managementCount === 1 ? '1 aviso' : managementCount + ' avisos');
    managementPanel.open = true;
    qa.managementExpandsWithoutDroppingAlerts = managementPanel.open
      && managementList.querySelectorAll('.alert-item').length === managementCount;
    managementPanel.open = false;
    qa.managementClosesAgain = !managementPanel.open;
    const chartGrid = document.querySelector('.dashboard-charts--overview');
    const cards = [...chartGrid.querySelectorAll(':scope > .chart-card')];
    const stages = chartGrid.querySelector('.chart-card--stages');
    const gruCard = chartGrid.querySelector('.chart-card--gru');
    const monthColumns = [...gruCard.querySelectorAll('.gru-month-column')];
    const expenseCard = chartGrid.querySelector('.chart-card--expense');
    const creditCard = chartGrid.querySelector('.chart-card--credit');
    const rapCard = chartGrid.querySelector('.chart-card--rap');
    const rect = node => node.getBoundingClientRect();
    qa.fivePurposefulPanels = cards.length === 5 &&
      ['expense', 'stages', 'credit', 'rap', 'gru'].every(type =>
        cards.some(card => card.classList.contains('chart-card--' + type)));
    qa.executionRatiosGrouped = stages.querySelectorAll('.flow-metric').length === 3 &&
      el('committedGaugeValue').textContent.includes('60,0%') &&
      el('liquidatedGaugeValue').textContent.includes('66,7%') &&
      el('paidGaugeValue').textContent.includes('40,0%') &&
      el('stagesInterpretation').dataset.state === 'available' &&
      ['committedGauge', 'liquidatedGauge', 'paidGauge'].every(id =>
        stages.contains(el(id)) && el(id).querySelectorAll('.ratio-meter').length === 1) &&
      !el('provisionDonut') && !el('provisionShareValue');
    qa.gruMonthlyColumnsPreserveData = gru.querySelectorAll('.gru-timeline-month').length === 11 &&
      gru.querySelector('.gru-months-details:not([open])') !== null &&
      monthColumns.length === 2 &&
      monthColumns[0].querySelectorAll('.financial-month-row').length === 6 &&
      monthColumns[1].querySelectorAll('.financial-month-row').length === 5;
    qa.dashboardResponsiveHierarchy = window.innerWidth > 990
      ? Math.abs(rect(expenseCard).top - rect(stages).top) < 5 &&
        rect(stages).left >= rect(expenseCard).right - 5 &&
        Math.abs(rect(creditCard).top - rect(rapCard).top) < 5 &&
        rect(gruCard).top > rect(creditCard).top &&
        rect(gruCard).width > rect(expenseCard).width
      : cards.every((card, index) => index === 0 ||
        rect(card).top >= rect(cards[index - 1]).bottom - 5);
    // Allow concise explanatory summaries while keeping charts screen-sized.
    qa.dashboardCompactOnDesktop = window.innerWidth <= 990 ||
      (rect(expenseCard).height < 480 &&
       rect(stages).height < 480 &&
       rect(gruCard).height < 530);
    qa.dashboardFitsViewport = rect(chartGrid).width <= Math.min(1242, window.innerWidth) + 5;
    qa.mobileKpisUseTwoColumns = window.innerWidth > 730 || window.innerWidth <= 360 || (() => {
      const items = [...document.querySelectorAll('.dashboard-kpis .kpi-card')];
      return items.length >= 2 && Math.abs(rect(items[0]).top - rect(items[1]).top) < 4 &&
        rect(items[1]).left >= rect(items[0]).right - 4;
    })();
    qa.mobileNavigationIsCondensed = window.innerWidth > 730 || (() => {
      const links = [...document.querySelectorAll('.header-actions .header-link')];
      return links.length === 2 && Math.abs(rect(links[0]).top - rect(links[1]).top) < 4;
    })();

    // Typography checks are evaluated from rendered CSS in real desktop/mobile Chromium.
    const styled = selector => getComputedStyle(document.querySelector(selector));
    const fontPx = selector => parseFloat(styled(selector).fontSize);
    const chartLabels = [
      '.chart-card--expense .financial-bar-label',
      '.chart-card--credit .financial-bar-label',
      '.chart-card--gru .financial-bar-label',
      '.chart-card--rap .rap-composition-item dt',
      '.chart-card--stages .flow-metric-top span'
    ].map(fontPx);
    const chartValues = [
      '.chart-card--expense .financial-bar-value',
      '.chart-card--gru .financial-bar-value',
      '.chart-card--rap .rap-composition-item dd strong'
    ].map(fontPx);
    const equalScale = values => values.every(v => v >= 13 && Math.abs(v - values[0]) < .3);
    qa.chartLabelsOneScale = equalScale(chartLabels);
    qa.chartValuesOneScale = equalScale(chartValues);
    qa.independentBalancesUseSummaryNumbers = fontPx('.chart-card--credit .financial-independent-item strong')
      >= chartValues[0] && credit.querySelectorAll('.financial-independent-item strong').length === 2;
    qa.captionTextReadable = [
      '.chart-kicker', '.financial-chart-note', '.chart-bottom-note',
      '.dashboard-kpis .kpi-card small', '.management-alerts-heading small'
    ].every(selector => fontPx(selector) >= 12.5);
    qa.pageHeadingHierarchy = fontPx('h1') > fontPx('.dashboard-panel h2') &&
      fontPx('.dashboard-panel h2') > fontPx('.chart-card--expense h3') &&
      fontPx('.chart-card--expense h3') > chartLabels[0];
    qa.sameFontFamilyAcrossPage = [
      'body', 'h1', '.chart-card--expense h3', '.dashboard-kpis .kpi-card strong',
      '.chart-card--gru .financial-bar-label', '.toolbar input', '.toolbar select',
      '.toolbar button', '.table-wrap td', '.site-footer'
    ].every(selector => styled(selector).fontFamily === styled('body').fontFamily);
    qa.uniformControlText = [
      '.toolbar input', '.toolbar select', '.toolbar button',
      '.header-actions .header-link', '.header-actions #themeToggle'
    ].every(selector => Math.abs(fontPx(selector) - fontPx('.toolbar input')) < .3);
    qa.unifiedCardCorners = [
      '.dashboard-kpis .kpi-card', '.chart-card--expense', '.summary .metric'
    ].every(selector => styled(selector).borderTopLeftRadius === '11px');

    qa.creditLabelsStayWholeOnDesktop = window.innerWidth <= 650 || (() => {
      const labels = [...credit.querySelectorAll('.financial-independent-item .financial-bar-label')];
      return labels.length === 2 && labels.every(label => label.scrollWidth <= label.clientWidth + 2);
    })();
    qa.rapHelpAlignsWithHeading = (() => {
      const heading = rapCard.querySelector('.chart-card-heading');
      const help = rapCard.querySelector('.chart-help');
      return Math.abs(heading.getBoundingClientRect().top - help.getBoundingClientRect().top) < 5;
    })();
    const secondary = el('otherFinancialIndicators');
    qa.progressiveKpis = !secondary.open &&
      document.querySelectorAll('.dashboard-panel > .dashboard-kpis > .kpi-card').length === 4 &&
      secondary.querySelectorAll('.kpi-card').length === 3 &&
      secondary.getBoundingClientRect().top >= chartGrid.getBoundingClientRect().bottom - 5;
    secondary.open = true;
    qa.secondaryKpisRetainAuditedValues = secondary.open &&
      el('committedTotal').textContent.includes('50.000') &&
      el('liquidatedTotal').textContent.includes('30.000') &&
      el('paidTotal').textContent.includes('20.000');
    secondary.open = false;
    const glossary = document.querySelector('.glossary-panel');
    qa.glossaryAvailableOnDemand = !glossary.open &&
      glossary.querySelectorAll('.term-help').length === 6;
    glossary.open = true;
    qa.glossaryExpands = glossary.open &&
      getComputedStyle(glossary.querySelector('.term-strip')).display !== 'none';
    glossary.open = false;
    const provenance = document.querySelector('.source-context');
    qa.methodologyStillAccessible = !provenance.open &&
      provenance.querySelector('.dashboard-provenance').textContent.includes('não a data de cada lançamento');
    qa.expenseTakeawayExplainsAuditedRatio =
      el('expenseTakeawayTitle').textContent.includes('40,0% do valor empenhado') &&
      el('expenseTakeawayText').textContent.includes('não indica pagamentos realizados no dia');
    qa.rapTakeawayShowsRemainingAmount = /R\$\s+2\.000,00/.test(el('rapTakeaway').textContent);
    qa.creditAvoidsInvalidAccountingIdentity =
      creditCard.querySelector('.chart-lead').textContent.includes('saldos distintos') &&
      creditCard.querySelector('.chart-lead').textContent.includes('Não representam parcelas');
    qa.methodologyUsesDisclosure = [expense, credit, gru, rap].every(container =>
      Boolean(container.closest('.chart-card')?.querySelector('details.chart-methodology:not([open])')));
    qa.originLinksRemainVisible = Boolean(expense.querySelector('a.financial-chart-link')) &&
      Boolean(credit.querySelector('a.financial-chart-link')) &&
      Boolean(gru.querySelector('a.financial-chart-link')) &&
      Boolean(rap.querySelector('a.rap-composition-link'));
    // Visual design contract: consistent padding, cards, typography and reading order.
    const dashboardPanel = document.querySelector('.dashboard-panel');
    const reference = document.querySelector('.dashboard-reference');
    const referenceCards = [...reference.querySelectorAll(':scope > .aux-panel')];
    const gridGap = parseFloat(getComputedStyle(chartGrid).columnGap);
    const cardPadding = cards.map(card => parseFloat(getComputedStyle(card).paddingLeft));
    qa.dashboardHasReferenceSection = referenceCards.length === 2 &&
      referenceCards.some(card => card.classList.contains('glossary-panel')) &&
      referenceCards.some(card => card.classList.contains('source-context'));
    qa.dashboardReadingOrder = rect(document.querySelector('.dashboard-panel > .dashboard-kpis')).top <
      rect(chartGrid).top && rect(chartGrid).top < rect(reference).top &&
      rect(reference).top < rect(managementPanel).top;
    qa.dashboardCardPaddingConsistent = cardPadding.every(value => value >= 12 &&
      Math.abs(value - cardPadding[0]) < .5);
    qa.dashboardGridSpacingConsistent = gridGap >= 12 && gridGap <= 24;
    qa.dashboardReferenceIsResponsive = window.innerWidth > 800
      ? Math.abs(rect(referenceCards[0]).top - rect(referenceCards[1]).top) < 5
      : rect(referenceCards[1]).top >= rect(referenceCards[0]).bottom - 5;
    qa.dashboardPanelFitsScreen = rect(dashboardPanel).right <= window.innerWidth + 3;
    qa.dashboardTypographyUsesTokens = getComputedStyle(document.body).fontFamily ===
      getComputedStyle(expenseCard).fontFamily;
    qa.noHorizontalPageOverflow = document.documentElement.scrollWidth <= window.innerWidth+4;
    qa.catalogTracksAllReports = document.querySelectorAll('#rows [data-favorite-report]').length === 7;
    const firstFavorite = document.querySelector('#rows [data-favorite-report]');
    if (firstFavorite) firstFavorite.click();
    qa.favoriteTogglePersists = document.querySelector('#rows [data-favorite-report]')?.getAttribute('aria-pressed') === 'true' &&
      Boolean(localStorage.getItem('emailbackuphub:catalog:v1')?.includes('favorites'));
    el('catalogScope').value = 'favorites';
    el('catalogScope').dispatchEvent(new Event('change', { bubbles: true }));
    qa.favoriteFilterWorks = document.querySelectorAll('#rows tr').length === 1;
    el('catalogScope').value = 'all';
    el('catalogScope').dispatchEvent(new Event('change', { bubbles: true }));
    qa.allReportsRestored = document.querySelectorAll('#rows [data-favorite-report]').length === 7;
    // Restore the initial theme before taking viewport screenshots. Headless
    // Chromium can capture a blank frame if the page is scrolled mid-render.
    if (document.documentElement.dataset.theme !== oldTheme) el('themeToggle').click();
    qa.themeRestoredForScreenshots = document.documentElement.dataset.theme === oldTheme;
    document.documentElement.dataset.dashboardQa = encodeURIComponent(JSON.stringify(qa));
  }
  setTimeout(verify, 100);
}());
