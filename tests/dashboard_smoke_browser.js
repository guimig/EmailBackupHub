'use strict';
(function () {
  let attempts = 0;
  function verify() {
    try {
    const el = id => document.getElementById(id);

    const expense = el('expenseTrendChart');
    const credit = el('creditDonut');
    const gru = el('gruTreeChart');
    if (!expense.querySelector('.financial-comparison') || !el('gruCodesChart').querySelector('.gru-treemap')) {
      if (attempts++ < 50) return setTimeout(verify, 100);
      document.documentElement.dataset.dashboardQa = encodeURIComponent(JSON.stringify({ loaded: false,
        expense: expense.textContent.slice(0,100), gru: gru.textContent.slice(0,100) }));
      return;
    }
    const qa = {};
    qa.loaded = el('totalReports').textContent === '7';
    qa.auditedKpis = /100\.000/.test(el('budgetBase').textContent) &&
      /40\.000/.test(el('creditAvailable').textContent) &&
      /12\.000/.test(el('rapTotal').textContent) &&
      /2\.500/.test(el('gruCollected').textContent);
    qa.expenseShowsCurrentBalances = expense.querySelectorAll('.financial-bar-row').length === 3 &&
      !expense.querySelector('circle.history-point');
    qa.creditShowsDistinctBalances = credit.querySelectorAll('.financial-independent-item').length === 2 &&
      credit.querySelectorAll('.financial-bar-track').length === 0 &&
      !credit.querySelector('circle.history-point');
    qa.creditFigureIsNotTemporalPercent = credit.textContent.includes('40.000') &&
      !credit.textContent.includes('40.000%') &&
      document.querySelector('.chart-card--credit .chart-help p').textContent.includes('saldos de relatórios independentes');
    qa.monthlyGruReconciled = gru.querySelectorAll('.gru-month-button').length === 11 &&
      el('gruValue').textContent.includes('2.500');
    qa.gruCodesReconciled = el('gruCodesChart').querySelectorAll('.gru-treemap-tile').length === 3 &&
      el('gruCodesChart').textContent.includes('SERVICOS EDUCACIONAIS');
    qa.monthlySourceLabels = !!gru.querySelector('[data-gru-month="JAN/2026"]') &&
      !!gru.querySelector('[data-gru-month="NOV/2026"]') &&
      gru.closest('.chart-card').querySelector('.chart-help p').textContent.includes('mês de emissão');
    qa.gruDefaultView = !el('gruCodesChart').hidden && gru.hidden
      && el('gruViewCodesButton').getAttribute('aria-pressed') === 'true';
    el('gruViewMonthsButton').click();
    const firstMonth = gru.querySelector('.gru-month-button');
    firstMonth.click();
    qa.gruMonthInteractive = !gru.hidden && el('gruCodesChart').hidden
      && el('gruSelectionDetail').textContent.includes('JAN/2026')
      && firstMonth.getAttribute('aria-pressed') === 'true';
    el('gruViewCodesButton').click();
    const firstCode = el('gruCodesChart').querySelector('.gru-treemap-tile');
    firstCode.click();
    qa.gruCodeInteractive = !el('gruCodesChart').hidden && gru.hidden
      && el('gruSelectionDetail').textContent.includes(firstCode.dataset.gruCode)
      && firstCode.getAttribute('aria-pressed') === 'true';
    qa.gruTreemapProportional = [...el('gruCodesChart').querySelectorAll('.gru-treemap-tile')]
      .reduce((total, tile) => total + parseFloat(tile.style.width) * parseFloat(tile.style.height), 0) > 9999;
    qa.gruViewRestored = el('gruViewCodesButton').getAttribute('aria-pressed') === 'true';
    qa.noRedundantIntro = !document.querySelector('.dashboard-panel .panel-note') &&
      !document.querySelector('.dashboard-panel > .panel-actions .chart-help') &&
      !document.querySelector('.source-context') &&
      !el('otherFinancialIndicators');
    qa.noFalseHistorySelector = el('historyRange') === null;
    qa.noSnapshotLinePoints = document.querySelectorAll('circle.history-point').length === 0;
    qa.expenseSourceLink = Boolean(expense.querySelector('a.financial-chart-link[href*="report-viewer.html"]'));
    const oldTheme = document.documentElement.dataset.theme;
    el('themeToggle').click();
    qa.themeKeepsAccurateCharts = document.documentElement.dataset.theme !== oldTheme &&
      expense.querySelectorAll('.financial-bar-row').length === 3 &&
      gru.querySelectorAll('.gru-month-button').length === 11;
    qa.chartHelpAccessible = getComputedStyle(document.querySelector('.chart-help')).display !== 'none';
    qa.singleChartHeadings = cardsSafeTitles();
    function cardsSafeTitles() {
      return [...document.querySelectorAll('.dashboard-charts--overview > .chart-card')]
        .every(card => card.querySelectorAll('h3').length === 1 &&
          card.querySelectorAll('.chart-kicker').length === 0);
    }
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

    const expenseCard = chartGrid.querySelector('.chart-card--expense');
    const creditCard = chartGrid.querySelector('.chart-card--credit');
    const rapCard = chartGrid.querySelector('.chart-card--rap');
    const rect = node => node.getBoundingClientRect();
    qa.fivePurposefulPanels = cards.length === 5 &&
      ['expense', 'stages', 'credit', 'rap', 'gru'].every(type =>
        cards.some(card => card.classList.contains('chart-card--' + type)));
    qa.executionRatiosGrouped = stages.querySelectorAll('.stage-gauge-card').length === 5 &&
      el('committedGaugeValue').textContent.includes('60,0%') &&
      el('liquidatedGaugeValue').textContent.includes('66,7%') &&
      el('paidGaugeValue').textContent.includes('40,0%') &&
      el('openGaugeValue').textContent.includes('33,3%') &&
      el('provisionGaugeValue').textContent.includes('50,0%') &&
      el('stagesInterpretation').dataset.state === 'available' &&
      ['committedGauge', 'liquidatedGauge', 'paidGauge', 'openGauge', 'provisionGauge'].every(id =>
        stages.contains(el(id)) &&
        el(id).querySelectorAll('.stage-gauge-track').length === 1 &&
        el(id).querySelectorAll('.stage-gauge-progress').length === 1) &&
      !el('provisionDonut') && !el('provisionShareValue');
    qa.halfGaugesUseAccessibleSvg = [...stages.querySelectorAll('.stage-half-gauge svg')].length === 5 &&
      [...stages.querySelectorAll('.stage-half-gauge svg')].every(svg =>
        svg.getAttribute('role') === 'img' &&
        svg.getAttribute('aria-label')?.includes('%'));
    qa.gruViewsDoNotStack = gru.hidden && !el('gruCodesChart').hidden
      && gruCard.querySelectorAll('.gru-view-switch button').length === 2
      && !gruCard.querySelector('.gru-months-details');
    qa.dashboardResponsiveHierarchy = window.innerWidth > 990
      ? Math.abs(rect(expenseCard).top - rect(rapCard).top) < 5 &&
        rect(rapCard).left >= rect(expenseCard).right - 5 &&
        rect(stages).top >= rect(expenseCard).bottom - 5 &&
        Math.abs(rect(creditCard).top - rect(gruCard).top) < 5 &&
        rect(creditCard).top >= rect(stages).bottom - 5
      : cards.every((card, index) => index === 0 ||
        rect(card).top >= rect(cards[index - 1]).bottom - 5);
    qa.stageGaugeGridResponsive = (() => {
      const gaugeCards = [...stages.querySelectorAll('.stage-gauge-card')];
      const top = gaugeCards.map(rect).map(r => r.top);
      return window.innerWidth > 990
        ? top.every(value => Math.abs(value - top[0]) < 5)
        : window.innerWidth > 360
          ? Math.abs(top[0] - top[1]) < 5 && Math.abs(top[2] - top[3]) < 5 && top[2] > top[0] && top[4] > top[2]
          : Math.abs(top[0] - top[1]) < 5 && top[4] > top[2];
    })();
    // Allow concise explanatory summaries while keeping charts screen-sized.
    qa.dashboardCompactOnDesktop = window.innerWidth <= 990 ||
      (rect(expenseCard).height < 510 &&
       rect(stages).height < 460 &&
       rect(gruCard).height < 650);
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
      '.chart-card--gru .gru-view-button',
      '.chart-card--rap .rap-composition-item dt',
      '.chart-card--stages .stage-gauge-title'
    ].map(fontPx);
    const chartValues = [
      '.chart-card--expense .financial-bar-value',

      '.chart-card--rap .rap-composition-item dd strong'
    ].map(fontPx);
    const equalScale = values => values.every(v => v >= 13 && Math.abs(v - values[0]) < .3);
    qa.chartLabelsOneScale = equalScale(chartLabels);
    qa.chartValuesOneScale = equalScale(chartValues);
    qa.independentBalancesUseSummaryNumbers = fontPx('.chart-card--credit .financial-independent-item strong')
      >= chartValues[0] && credit.querySelectorAll('.financial-independent-item strong').length === 2;
    qa.captionTextReadable = [
      '.gru-selection-detail', '.chart-interaction-detail',
      '.dashboard-kpis .kpi-card small', '.management-alerts-heading small'
    ].every(selector => fontPx(selector) >= 12.5);
    qa.pageHeadingHierarchy = fontPx('h1') > fontPx('.dashboard-panel h2') &&
      fontPx('.dashboard-panel h2') > fontPx('.chart-card--expense h3') &&
      fontPx('.chart-card--expense h3') > chartLabels[0];
    qa.sameFontFamilyAcrossPage = [
      'body', 'h1', '.chart-card--expense h3', '.dashboard-kpis .kpi-card strong',
      '.chart-card--gru .gru-view-button', '.toolbar input', '.toolbar select',
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
    qa.noRedundantFinancialIndicators = !secondary &&
      document.querySelectorAll('.dashboard-panel > .dashboard-kpis > .kpi-card').length === 4;
    const glossary = document.querySelector('.glossary-panel');
    qa.glossaryAvailableOnDemand = !glossary.open &&
      glossary.querySelectorAll('.term-help').length === 6;
    glossary.open = true;
    qa.glossaryExpands = glossary.open &&
      getComputedStyle(glossary.querySelector('.term-strip')).display !== 'none';
    glossary.open = false;
    qa.methodologyStillAccessible = [...document.querySelectorAll('.chart-card .chart-help')].length === 5 &&
      !document.querySelector('.source-context');
    qa.expenseTakeawayRemoved = !el('expenseTakeaway') && !el('expenseTakeawayTitle') && !el('expenseTakeawayText');
    qa.noDuplicateRapTakeaway = !el('rapTakeaway');
    qa.financialChartsInteractive = (() => {
      const expenseRow = expense.querySelector('.financial-bar-row[role="button"]');
      const rapItem = rap.querySelector('.rap-composition-item[role="button"]');
      const creditItem = credit.querySelector('.financial-independent-item[role="button"]');
      const stageItem = stages.querySelector('.stage-gauge-card[role="button"]');
      if (![expenseRow,rapItem,creditItem,stageItem].every(Boolean)) return false;
      for (const node of [expenseRow,rapItem,creditItem,stageItem]) {
        node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
      return ['expenseChartDetail','rapChartDetail','creditChartDetail','stagesChartDetail']
        .every(id => !el(id).hidden && el(id).textContent.length > 4) &&
        [expenseRow,rapItem,creditItem,stageItem]
          .every(node => node.getAttribute('aria-pressed') === 'true');
    })();
    qa.keyboardChartSelection = (() => {
      const next = [...expense.querySelectorAll('.financial-bar-row[role="button"]')][1];
      next.dispatchEvent(new KeyboardEvent('keydown', { bubbles:true, key:'Enter' }));
      return next.getAttribute('aria-pressed') === 'true'
        && el('expenseChartDetail').textContent.includes('Liquidado');
    })();
    qa.creditAvoidsInvalidAccountingIdentity =
      creditCard.querySelector('.chart-help p').textContent.includes('saldos de relatórios independentes');
    qa.methodologyUsesQuestionMark = cards.every(card =>
      card.querySelectorAll(':scope > .chart-card-head details.chart-help > summary').length === 1 &&
      card.querySelector(':scope > .chart-card-head details.chart-help > summary').textContent.trim() === '?') &&
      cards.every(card => card.querySelectorAll('details.chart-methodology').length === 0);
    qa.originLinksRemainVisible = Boolean(expense.querySelector('a.financial-chart-link')) &&
      Boolean(credit.querySelector('a.financial-chart-link')) &&
      Boolean(el('gruReportLink').querySelector('a.financial-chart-link')) &&
      Boolean(rap.querySelector('a.rap-composition-link'));
    // Visual design contract: consistent padding, cards, typography and reading order.
    const dashboardPanel = document.querySelector('.dashboard-panel');
    const reference = document.querySelector('.dashboard-reference');
    const referenceCards = [...reference.querySelectorAll(':scope > .aux-panel')];
    const gridGap = parseFloat(getComputedStyle(chartGrid).columnGap);
    const cardPadding = cards.map(card => parseFloat(getComputedStyle(card).paddingLeft));
    qa.dashboardHasReferenceSection = referenceCards.length === 1 &&
      referenceCards[0].classList.contains('glossary-panel');
    qa.dashboardReadingOrder = rect(document.querySelector('.dashboard-panel > .dashboard-kpis')).top <
      rect(chartGrid).top && rect(chartGrid).top < rect(reference).top &&
      rect(reference).top < rect(managementPanel).top;
    qa.dashboardCardPaddingConsistent = cardPadding.every(value => value >= 12 &&
      Math.abs(value - cardPadding[0]) < .5);
    qa.dashboardGridSpacingConsistent = gridGap >= 12 && gridGap <= 24;
    qa.dashboardReferenceIsResponsive = referenceCards.length === 1 &&
      rect(referenceCards[0]).width <= rect(reference).width + 1;
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
    } catch (error) {
      document.documentElement.dataset.dashboardQa = encodeURIComponent(JSON.stringify({
        browserScriptError: String(error), stack: String(error?.stack || '').slice(0, 800)
      }));
    }
  }
  setTimeout(verify, 100);
}());
