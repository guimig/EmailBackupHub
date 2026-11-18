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
    qa.creditShowsDistinctBalances = credit.querySelectorAll('.financial-bar-row').length === 2 &&
      !credit.querySelector('circle.history-point');
    qa.creditFigureIsNotTemporalPercent = el('creditShareValue').textContent.includes('40.000');
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
      ['committedGauge', 'liquidatedGauge', 'paidGauge'].every(id =>
        stages.contains(el(id)) && el(id).querySelectorAll('.ratio-meter').length === 1) &&
      !el('provisionDonut') && !el('provisionShareValue');
    qa.gruMonthlyColumnsPreserveData = monthColumns.length === 2 &&
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
    qa.dashboardCompactOnDesktop = window.innerWidth <= 990 ||
      (rect(expenseCard).height < 410 &&
       rect(stages).height < 410 &&
       rect(gruCard).height < 420);
    qa.dashboardFitsViewport = rect(chartGrid).width <= Math.min(1242, window.innerWidth) + 5;
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
    document.documentElement.dataset.dashboardQa = encodeURIComponent(JSON.stringify(qa));
  }
  setTimeout(verify, 100);
}());
