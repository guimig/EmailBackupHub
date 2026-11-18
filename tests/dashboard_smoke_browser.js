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
    const chartColumns = [...document.querySelectorAll('.dashboard-chart-column')];
    const gaugeCards = ['committedGauge', 'liquidatedGauge', 'paidGauge']
      .map(id => el(id).closest('.chart-card'));
    qa.chartColumnsAreIndependent = chartColumns.length === 2 &&
      chartColumns.every(column => column.children.length >= 3);
    qa.compactRatiosWithoutDuplicateLabels = gaugeCards.every(card =>
      card && card.querySelectorAll('.ratio-meter').length === 1 &&
      !card.querySelector('svg') && card.getBoundingClientRect().height < 180);
    qa.monthlyGruDoesNotStretchGauges =
      el('gruTreeChart').closest('.chart-card').getBoundingClientRect().height >
      Math.max(...gaugeCards.map(card => card.getBoundingClientRect().height));
    qa.chartWidthAndResponsiveFlow = (() => {
      const first = chartColumns[0].getBoundingClientRect();
      const second = chartColumns[1].getBoundingClientRect();
      const panel = document.querySelector('.dashboard-panel').getBoundingClientRect();
      return panel.width <= 1322 && (window.innerWidth > 950
        ? second.left >= first.right - 2 && Math.abs(first.top - second.top) < 4
        : second.top >= first.bottom - 2);
    })();
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
