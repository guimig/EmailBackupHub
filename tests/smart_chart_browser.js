/* Browser smoke checks for actual reports served from sparse-checkout JSON fixtures. */
(function () {
  'use strict';
  let tries=0;
  function verify() {
    const $=id=>document.getElementById(id);
    const slug=new URLSearchParams(location.search).get('report')||'';
    const gru=slug.includes('recolhimento-proprio-gru');
    const page=$('pageInfo');
    if (!page?.textContent.includes('registros') || !$('chartSuggestedTitle')?.textContent.includes('Sugestão:')) {
      if (tries++<60)return setTimeout(verify,100);
      document.documentElement.dataset.viewerQa=encodeURIComponent(JSON.stringify({loaded:false,slug,tip:page?.textContent}));
      return;
    }
    $('reportChart').open=true;
    $('reportChart').dispatchEvent(new Event('toggle'));
    const results={loaded:true};
    if (gru) {
      const vis=$('reportChartVisual');
      results.suggestsActualEmissionMonths=$('chartMode').value==='sum' &&
        $('chartType').value==='line' && $('chartDimension').value==='Emissão - Mês';
      results.actualMonthsAndNetData=vis.querySelectorAll('.smart-chart-point').length===11 &&
        vis.textContent.includes('JAN/2026') && vis.textContent.includes('NOV/2026') &&
        $('chartMeasure').value.includes('Movim. Líquido');
      results.notHtmlOriginalChanged=$('htmlLink').href.includes('/emails/');
      const first=vis.querySelector('.smart-chart-point');
      if(first) first.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      results.clickActualMonthFiltersTable=$('pageInfo').textContent.includes(' de 20 registros') &&
        $('chartSummary').textContent.includes('Filtro aplicado');
      $('clearFilters').click();
      results.clearingFilterRestoresData=$('pageInfo').textContent.includes(' de 242 registros');
      $('chartType').value='pie';
      $('chartType').dispatchEvent(new Event('change',{bubbles:true}));
      results.pieDoesNotHide11Months=$('chartSummary').textContent.includes('até 10 categorias');
      $('chartType').value='line';
      $('chartType').dispatchEvent(new Event('change',{bubbles:true}));
      results.restoredLine=vis.querySelectorAll('.smart-chart-point').length===11;
    } else {
      const vis=$('reportChartVisual');
      results.suggestsOneEmpenho=$('chartMode').value==='wide'&&$('chartType').value==='bar';
      results.specialAccountingPeriods=vis.textContent.includes('013/2025')&&vis.textContent.includes('014/2025');
      $('chartType').value='line';
      $('chartType').dispatchEvent(new Event('change',{bubbles:true}));
      results.specialPeriodsNotConvertedToDates=$('chartSummary').textContent.includes('013/014');
      $('chartUseSuggestion').click();
      const second=$('chartRecord').options[1];
      if(second) {
        $('chartRecord').value=second.value;
        $('chartRecord').dispatchEvent(new Event('change',{bubbles:true}));
      }
      const btn=vis.querySelector('[data-record-index]');
      if(btn)btn.click();
      results.openSelectedEmpenho=$('rowDialog').open&&$('rowDetails').querySelectorAll('dt').length===21;
      if($('rowDialog').open)$('closeRowDialog').click();
      results.noAutomaticCrossEmpenhoSum=$('chartMode').value==='wide' &&
        !$('chartSummary').textContent.includes('Soma configurada pelo usuário');
    }
    if (gru) {
      $('pageSize').value = 'all';
      $('pageSize').dispatchEvent(new Event('change', { bubbles: true }));
      let frames = 0;
      const checkAllRows = () => {
        const count = $('table').querySelectorAll('tbody tr[data-row-index]').length;
        if (count < 242 && frames++ < 50) return setTimeout(checkAllRows, 40);
        results.allGruRowsLoaded = count === 242 &&
          $('pageInfo').textContent.includes('todas as 242 linhas filtradas');
        results.allGruRowsOnOnePage = $('pageNumber').textContent === 'Página 1 de 1' &&
          $('nextPage').disabled && $('previousPage').disabled;
        results.allGruRowsShareable = new URLSearchParams(location.search).get('ps') === 'all';
        results.internalVerticalScrollRemains = $('tableWrap').scrollHeight > $('tableWrap').clientHeight;
        results.noHorizontalOverflow = document.documentElement.scrollWidth <= window.innerWidth + 4;
        document.documentElement.dataset.viewerQa = encodeURIComponent(JSON.stringify(results));
      };
      checkAllRows();
      return;
    }
    results.noHorizontalOverflow=document.documentElement.scrollWidth<=window.innerWidth+4;
    document.documentElement.dataset.viewerQa=encodeURIComponent(JSON.stringify(results));
  }
  setTimeout(verify,100);
}());
