/* Eixos adaptativos compartilhados pelas duas séries do laboratório IFC.
 * Usa valores em reais; a divisão em mil/milhões/bilhões é apenas visual.
 * Não depende de DOM, de biblioteca externa nem da fonte de dados.
 */
(function (root) {
  'use strict';

  const isAmount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const ROUNDING = [1, 1.5, 2, 2.5, 5, 10];

  function niceStep(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const exponent = Math.floor(Math.log10(value));
    const magnitude = 10 ** exponent;
    const fraction = value / magnitude;
    const multiplier = ROUNDING.find(candidate => fraction <= candidate + 1e-10) || 10;
    return multiplier * magnitude;
  }

  function unitFor(maxValue) {
    if (maxValue >= 1e12) return {divisor:1e12, label:'R$ trilhões', description:'Valores em trilhões de reais'};
    if (maxValue >= 1e9) return {divisor:1e9, label:'R$ bilhões', description:'Valores em bilhões de reais'};
    if (maxValue >= 1e6) return {divisor:1e6, label:'R$ milhões', description:'Valores em milhões de reais'};
    if (maxValue >= 1e3) return {divisor:1e3, label:'R$ mil', description:'Valores em milhares de reais'};
    return {divisor:1, label:'R$', description:'Valores em reais'};
  }

  function formatTick(value, scaledStep) {
    const roundedStep = Number(scaledStep.toPrecision(8));
    const decimals = Math.min(4, (String(roundedStep).split('.')[1] || '').length);
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    }).format(value);
  }

  function compute(rows, activeKeys, options = {}) {
    if (!Array.isArray(rows) || !Array.isArray(activeKeys) || !activeKeys.length) return null;
    const validRows = rows.filter(row => row && Number.isInteger(row.year) &&
      activeKeys.some(key => isAmount(row[key])));
    if (!validRows.length) return null;
    const values = validRows.flatMap(row => activeKeys.map(key => row[key]).filter(isAmount));
    const yearMin = Math.min(...validRows.map(row => row.year));
    const yearMax = Math.max(...validRows.map(row => row.year));
    const top = Math.max(...values);
    const paddedTop = top === 0 ? 1 : top * 1.08;
    const step = niceStep(paddedTop / ((options.mobile ? 5 : 6) - 1));
    const yMax = Math.max(step, Math.ceil(paddedTop / step) * step);
    const tickCount = Math.max(1, Math.min(20, Math.round(yMax / step)));
    const yTicks = Array.from({length:tickCount + 1}, (_, index) =>
      Number((index * step).toPrecision(12)));

    const maxYearLabels = options.mobile ? 6 : 8;
    const xStep = Math.max(1, Math.ceil((yearMax - yearMin) / (maxYearLabels - 1)));
    const xTicks = [];
    for (let year = yearMin; year <= yearMax; year += xStep) xTicks.push(year);
    if (xTicks[xTicks.length - 1] !== yearMax) xTicks.push(yearMax);

    return {
      x: {min:yearMin, max:yearMax, ticks:xTicks},
      y: {min:0, max:yMax, step, ticks:yTicks},
      unit: unitFor(yMax),
      count: validRows.length
    };
  }

  root.IFCChartScale = Object.freeze({compute, formatTick});
})(globalThis);