import { useEffect, useMemo, useState } from 'react';
import { useDataContext } from '../lib/data';
import { Chart } from '../components/Chart';
import { DateRange } from '../components/DateRange';
import { Select } from '../components/Select';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { KpiDelta } from '../components/KpiDelta';
import {
  buildMonthSeries,
  clampDateRange,
  formatCompactMoney,
  formatMonthLabel,
  formatPercent,
  normalizeKey,
  normalizeText,
  parseDateValue,
  parseNumber,
  toIsoDate,
  toMonthKey,
  uniqueSorted
} from '../lib/utils';
import type { EChartsOption } from 'echarts';

interface ProfitRow {
  date: Date;
  dateIso: string;
  monthKey: string;
  amount: number;
  direction: string;
  project: string;
  operationType: string;
  article: string;
  section: string;
  sectionCode: number;
}

export const ProfitPage = () => {
  const { sheets } = useDataContext();
  const sheetState = sheets['Прибыль'];

  const profitRows = useMemo(() => {
    if (!sheetState.data) return [] as ProfitRow[];

    const getField = (row: Record<string, unknown>, variants: string[]) => {
      for (const variant of variants) {
        if (row[variant] != null && row[variant] !== '') return row[variant];
      }
      return null;
    };

    return sheetState.data.rows
      .map((row) => {
        const date = parseDateValue(getField(row, ['Дата', 'date']));
        if (!date) return null;
        const operationType = normalizeText(getField(row, ['Вид операции']));
        const amount = parseNumber(getField(row, ['Сумма']));
        const opKey = normalizeKey(operationType);
        let amountSigned = amount;
        if (opKey.includes('расход')) amountSigned = -Math.abs(amount);
        if (opKey.includes('приход')) amountSigned = Math.abs(amount);
        const section = normalizeText(getField(row, ['Раздел ОПиУ']));
        const match = section.match(/^(\d+)/);
        const sectionCode = match ? Number(match[1]) : -1;

        return {
          date,
          dateIso: toIsoDate(date),
          monthKey: toMonthKey(date),
          amount: amountSigned,
          direction: normalizeText(getField(row, ['Направление'])),
          project: normalizeText(getField(row, ['Наименование проекта'])),
          operationType,
          article: normalizeText(getField(row, ['Статья ОПиУ'])),
          section,
          sectionCode
        } as ProfitRow;
      })
      .filter(Boolean) as ProfitRow[];
  }, [sheetState.data]);

  const minDate = useMemo(() => {
    if (!profitRows.length) return null;
    return profitRows.reduce((min, row) => (row.date < min ? row.date : min), profitRows[0].date);
  }, [profitRows]);

  const maxDate = useMemo(() => {
    if (!profitRows.length) return null;
    return profitRows.reduce((max, row) => (row.date > max ? row.date : max), profitRows[0].date);
  }, [profitRows]);

  const [range, setRange] = useState({ start: '', end: '' });
  const [filters, setFilters] = useState({
    project: '',
    direction: '',
    article: '',
    section: ''
  });

  useEffect(() => {
    if (!minDate || !maxDate) return;
    if (range.start || range.end) return;
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fallback = defaultStart < minDate || defaultStart > maxDate;
    setRange({
      start: toIsoDate(fallback ? minDate : defaultStart),
      end: toIsoDate(fallback ? maxDate : defaultEnd)
    });
  }, [minDate, maxDate, range.start, range.end]);

  const period = useMemo(() => {
    if (!range.start || !range.end) return null;
    const start = parseDateValue(range.start);
    const end = parseDateValue(range.end);
    if (!start || !end) return null;
    return clampDateRange(start, end);
  }, [range]);

  const rowsInPeriod = useMemo(() => {
    if (!period) return [] as ProfitRow[];
    return profitRows.filter((row) => row.date >= period.start && row.date <= period.end);
  }, [profitRows, period]);

  const filterOptions = useMemo(() => ({
    projects: uniqueSorted(rowsInPeriod.map((row) => row.project)),
    directions: uniqueSorted(rowsInPeriod.map((row) => row.direction)),
    articles: uniqueSorted(rowsInPeriod.map((row) => row.article)),
    sections: uniqueSorted(rowsInPeriod.map((row) => row.section))
  }), [rowsInPeriod]);

  useEffect(() => {
    setFilters((prev) => ({
      project: prev.project && !filterOptions.projects.includes(prev.project) ? '' : prev.project,
      direction: prev.direction && !filterOptions.directions.includes(prev.direction) ? '' : prev.direction,
      article: prev.article && !filterOptions.articles.includes(prev.article) ? '' : prev.article,
      section: prev.section && !filterOptions.sections.includes(prev.section) ? '' : prev.section
    }));
  }, [filterOptions]);

  const filteredRows = useMemo(() => {
    return rowsInPeriod.filter((row) => {
      if (filters.project && filters.project !== row.project) return false;
      if (filters.direction && filters.direction !== row.direction) return false;
      if (filters.article && filters.article !== row.article) return false;
      if (filters.section && filters.section !== row.section) return false;
      return true;
    });
  }, [rowsInPeriod, filters]);

  const kpi = useMemo(() => {
    const sectionSums: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
    let expenseTotal = 0;
    let fixedExpense = 0;

    filteredRows.forEach((row) => {
      if (sectionSums.hasOwnProperty(row.sectionCode)) {
        sectionSums[row.sectionCode] += row.amount;
      }
      if (normalizeKey(row.operationType).includes('расход')) {
        const abs = Math.abs(row.amount);
        expenseTotal += abs;
        if (row.sectionCode === 4 || row.sectionCode === 5) {
          fixedExpense += abs;
        }
      }
    });

    const revenue = sectionSums[1] || 0;
    const cost = Math.abs(sectionSums[2] || 0);
    const overhead = Math.abs(sectionSums[3] || 0);
    const commercial = Math.abs(sectionSums[4] || 0);
    const admin = Math.abs(sectionSums[5] || 0);
    const belowIncome = Math.abs(sectionSums[6] || 0);
    const belowExpense = Math.abs(sectionSums[7] || 0);

    const gross = revenue - cost - overhead;
    const mrGross = revenue !== 0 ? gross / revenue : 0;
    const fixedShare = expenseTotal !== 0 ? fixedExpense / expenseTotal : 0;
    const netProfit = revenue - cost - overhead - commercial - admin + belowIncome - belowExpense;
    const netMargin = revenue !== 0 ? netProfit / revenue : 0;

    return { revenue, cost, mrGross, fixedShare, netProfit, netMargin };
  }, [filteredRows]);

  const months = useMemo(() => (period ? buildMonthSeries(period.start, period.end) : []), [period]);

  const monthlyAgg = useMemo(() => {
    const base = months.reduce((acc, month) => {
      acc[month] = {
        revenue: 0,
        cost: 0,
        overhead: 0,
        commercial: 0,
        admin: 0,
        belowIncome: 0,
        belowExpense: 0,
        expenseTotal: 0,
        fixedExpense: 0
      };
      return acc;
    }, {} as Record<string, any>);

    filteredRows.forEach((row) => {
      if (!base[row.monthKey]) return;
      if (row.sectionCode === 1) base[row.monthKey].revenue += row.amount;
      if (row.sectionCode === 2) base[row.monthKey].cost += Math.abs(row.amount);
      if (row.sectionCode === 3) base[row.monthKey].overhead += Math.abs(row.amount);
      if (row.sectionCode === 4) base[row.monthKey].commercial += Math.abs(row.amount);
      if (row.sectionCode === 5) base[row.monthKey].admin += Math.abs(row.amount);
      if (row.sectionCode === 6) base[row.monthKey].belowIncome += Math.abs(row.amount);
      if (row.sectionCode === 7) base[row.monthKey].belowExpense += Math.abs(row.amount);
      if (normalizeKey(row.operationType).includes('расход')) {
        base[row.monthKey].expenseTotal += Math.abs(row.amount);
        if (row.sectionCode === 4 || row.sectionCode === 5) {
          base[row.monthKey].fixedExpense += Math.abs(row.amount);
        }
      }
    });

    return base;
  }, [filteredRows, months]);

  const kpiDeltas = useMemo(() => {
    if (months.length < 2) return null;
    const latest = months[months.length - 1];
    const prev = months[months.length - 2];
    const curr = monthlyAgg[latest];
    const prevVal = monthlyAgg[prev];
    if (!curr || !prevVal) return null;

    const grossCurr = curr.revenue - curr.cost - curr.overhead;
    const grossPrev = prevVal.revenue - prevVal.cost - prevVal.overhead;
    const mrCurr = curr.revenue !== 0 ? grossCurr / curr.revenue : 0;
    const mrPrev = prevVal.revenue !== 0 ? grossPrev / prevVal.revenue : 0;

    const netCurr =
      curr.revenue - curr.cost - curr.overhead - curr.commercial - curr.admin + curr.belowIncome - curr.belowExpense;
    const netPrev =
      prevVal.revenue -
      prevVal.cost -
      prevVal.overhead -
      prevVal.commercial -
      prevVal.admin +
      prevVal.belowIncome -
      prevVal.belowExpense;
    const netMarginCurr = curr.revenue !== 0 ? netCurr / curr.revenue : 0;
    const netMarginPrev = prevVal.revenue !== 0 ? netPrev / prevVal.revenue : 0;

    const fixedShareCurr = curr.expenseTotal !== 0 ? curr.fixedExpense / curr.expenseTotal : 0;
    const fixedSharePrev = prevVal.expenseTotal !== 0 ? prevVal.fixedExpense / prevVal.expenseTotal : 0;

    return {
      revenue: curr.revenue - prevVal.revenue,
      cost: curr.cost - prevVal.cost,
      mrGross: mrCurr - mrPrev,
      fixedShare: fixedShareCurr - fixedSharePrev,
      netProfit: netCurr - netPrev,
      netMargin: netMarginCurr - netMarginPrev
    };
  }, [monthlyAgg, months]);

  const charts = useMemo(() => {
    const axisStyle = {
      axisLine: { lineStyle: { color: '#37517a' } },
      axisLabel: { color: '#9fb3d9' },
      splitLine: { lineStyle: { color: 'rgba(55, 81, 122, 0.3)' } }
    };

    const formatChartMoney = (value: number) => formatCompactMoney(value, 0);
    const formatChartPercent = (value: number) => formatPercent(value, 2);

    const revenueOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: months.map(formatMonthLabel), ...axisStyle },
      yAxis: {
        type: 'value',
        ...axisStyle,
        axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartMoney(value) }
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const revenue = params.find((p: any) => p.seriesName === 'Выручка');
          const mr = params.find((p: any) => p.seriesName === 'MR валовой прибыли');
          return `${params[0].axisValue}<br/>Выручка: ${formatChartMoney(revenue?.value || 0)}<br/>MR: ${formatChartPercent(mr?.value || 0)}`;
        }
      },
      series: [
        {
          type: 'bar',
          name: 'Выручка',
          data: months.map((month) => monthlyAgg[month].revenue),
          itemStyle: { color: '#2f8cff' }
        },
        {
          type: 'line',
          name: 'MR валовой прибыли',
          yAxisIndex: 0,
          data: months.map((month) => {
            const revenue = monthlyAgg[month].revenue;
            const gross = revenue - monthlyAgg[month].cost - monthlyAgg[month].overhead;
            return revenue !== 0 ? gross / revenue : 0;
          }),
          smooth: true,
          lineStyle: { color: '#00d9ff', width: 2 }
        }
      ]
    };

    const directions = uniqueSorted(filteredRows.map((row) => row.direction || 'Без направления'));
    const revenueByDirection: Record<string, Record<string, number>> = {};
    const grossByDirection: Record<string, Record<string, number>> = {};

    directions.forEach((dir) => {
      revenueByDirection[dir] = Object.fromEntries(months.map((month) => [month, 0]));
      grossByDirection[dir] = Object.fromEntries(months.map((month) => [month, 0]));
    });

    filteredRows.forEach((row) => {
      const dir = row.direction || 'Без направления';
      if (!revenueByDirection[dir]) return;
      if (row.sectionCode === 1) {
        revenueByDirection[dir][row.monthKey] += row.amount;
      }
      if (row.sectionCode === 1 || row.sectionCode === 2 || row.sectionCode === 3) {
        const sign = row.sectionCode === 1 ? 1 : -1;
        grossByDirection[dir][row.monthKey] += sign * Math.abs(row.amount);
      }
    });

    const revenueByDirectionOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 70 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const items = params
            .map((p: any) => `${p.seriesName}: ${formatChartMoney(p.value || 0)}`)
            .join('<br/>');
          return `${params[0].axisValue}<br/>${items}`;
        }
      },
      legend: { textStyle: { color: '#9fb3d9' }, bottom: 0, left: 0, right: 0, itemGap: 12 },
      xAxis: { type: 'category', data: months.map(formatMonthLabel), ...axisStyle },
      yAxis: {
        type: 'value',
        ...axisStyle,
        axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartMoney(value) }
      },
      series: directions.map((dir) => ({
        type: 'bar',
        name: dir,
        stack: 'revenue',
        data: months.map((month) => revenueByDirection[dir][month])
      }))
    };

    const grossByDirectionOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 70 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const items = params
            .map((p: any) => `${p.seriesName}: ${formatChartMoney(p.value || 0)}`)
            .join('<br/>');
          return `${params[0].axisValue}<br/>${items}`;
        }
      },
      legend: { textStyle: { color: '#9fb3d9' }, bottom: 0, left: 0, right: 0, itemGap: 12 },
      xAxis: { type: 'category', data: months.map(formatMonthLabel), ...axisStyle },
      yAxis: {
        type: 'value',
        ...axisStyle,
        axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartMoney(value) }
      },
      series: directions.map((dir) => ({
        type: 'bar',
        name: dir,
        stack: 'gross',
        data: months.map((month) => grossByDirection[dir][month])
      }))
    };

    const netOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: months.map(formatMonthLabel), ...axisStyle },
      yAxis: {
        type: 'value',
        ...axisStyle,
        axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartMoney(value) }
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const net = params.find((p: any) => p.seriesName === 'Чистая прибыль');
          const margin = params.find((p: any) => p.seriesName === 'Рентабельность');
          return `${params[0].axisValue}<br/>Чистая прибыль: ${formatChartMoney(net?.value || 0)}<br/>Рентабельность: ${formatChartPercent(margin?.value || 0)}`;
        }
      },
      series: [
        {
          type: 'bar',
          name: 'Чистая прибыль',
          data: months.map((month) => {
            const item = monthlyAgg[month];
            return item.revenue - item.cost - item.overhead - item.commercial - item.admin + item.belowIncome - item.belowExpense;
          }),
          itemStyle: { color: '#2fe3a0' }
        },
        {
          type: 'line',
          name: 'Рентабельность',
          data: months.map((month) => {
            const item = monthlyAgg[month];
            const net = item.revenue - item.cost - item.overhead - item.commercial - item.admin + item.belowIncome - item.belowExpense;
            return item.revenue !== 0 ? net / item.revenue : 0;
          }),
          smooth: true,
          lineStyle: { color: '#ffb347' }
        }
      ]
    };

    return { revenueOption, revenueByDirectionOption, grossByDirectionOption, netOption };
  }, [filteredRows, months]);

  const projectTables = useMemo(() => {
    const build = (directionKey: string) => {
      const map: Record<string, { revenue: number; cost: number; overhead: number }> = {};
      filteredRows.forEach((row) => {
        if (normalizeKey(row.direction) !== directionKey) return;
        if (!row.project) return;
        if (!map[row.project]) map[row.project] = { revenue: 0, cost: 0, overhead: 0 };
        if (row.sectionCode === 1) map[row.project].revenue += row.amount;
        if (row.sectionCode === 2) map[row.project].cost += Math.abs(row.amount);
        if (row.sectionCode === 3) map[row.project].overhead += Math.abs(row.amount);
      });
      return Object.keys(map).map((project) => {
        const revenue = map[project].revenue;
        const gross = revenue - map[project].cost - map[project].overhead;
        return {
          project,
          revenue,
          gross,
          profitability: revenue !== 0 ? gross / revenue : 0
        };
      }).sort((a, b) => b.profitability - a.profitability);
    };

    return {
      construction: build('стройка'),
      repair: build('ремонт')
    };
  }, [filteredRows]);

  if (sheetState.status === 'loading' || sheetState.status === 'idle') {
    return <LoadingState label="Загрузка листа Прибыль…" />;
  }

  if (sheetState.status === 'error') {
    return <ErrorState message={sheetState.error || 'Ошибка загрузки листа Прибыль.'} />;
  }

  if (!period) {
    return <ErrorState message="Не удалось определить период дат." />;
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <div className="grid" style={{ gap: 12 }}>
          <DateRange start={range.start} end={range.end} onChange={setRange} />
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <Select
              label="Проект"
              value={filters.project}
              options={filterOptions.projects}
              allLabel="Все проекты"
              onChange={(value) => setFilters((prev) => ({ ...prev, project: value }))}
            />
            <Select
              label="Направление"
              value={filters.direction}
              options={filterOptions.directions}
              allLabel="Все направления"
              onChange={(value) => setFilters((prev) => ({ ...prev, direction: value }))}
            />
            <Select
              label="Статья ОПиУ"
              value={filters.article}
              options={filterOptions.articles}
              allLabel="Все статьи"
              onChange={(value) => setFilters((prev) => ({ ...prev, article: value }))}
            />
            <Select
              label="Раздел ОПиУ"
              value={filters.section}
              options={filterOptions.sections}
              allLabel="Все разделы"
              onChange={(value) => setFilters((prev) => ({ ...prev, section: value }))}
            />
          </div>
        </div>
      </div>

      <div className="grid grid--kpi-3">
        <div
          className={`card ${kpiDeltas?.revenue ? (kpiDeltas.revenue > 0 ? 'card--up' : kpiDeltas.revenue < 0 ? 'card--down' : 'card--flat') : 'card--flat'}`}
          data-tooltip="Δ к предыдущему месяцу (последний месяц выбранного периода)"
        >
          <p className="card__title">Выручка</p>
          <p className="card__value">{formatCompactMoney(kpi.revenue)}</p>
          <KpiDelta delta={kpiDeltas?.revenue ?? null} format={(value) => formatCompactMoney(value)} />
        </div>
        <div
          className={`card ${kpiDeltas?.cost ? (kpiDeltas.cost > 0 ? 'card--up' : kpiDeltas.cost < 0 ? 'card--down' : 'card--flat') : 'card--flat'}`}
          data-tooltip="Δ к предыдущему месяцу (последний месяц выбранного периода)"
        >
          <p className="card__title">Себестоимость</p>
          <p className="card__value">{formatCompactMoney(kpi.cost)}</p>
          <p className="card__hint">Доля {formatPercent(kpi.revenue ? kpi.cost / kpi.revenue : 0)}</p>
          <KpiDelta delta={kpiDeltas?.cost ?? null} format={(value) => formatCompactMoney(value)} />
        </div>
        <div
          className={`card ${kpiDeltas?.mrGross ? (kpiDeltas.mrGross > 0 ? 'card--up' : kpiDeltas.mrGross < 0 ? 'card--down' : 'card--flat') : 'card--flat'}`}
          data-tooltip="Δ к предыдущему месяцу, в %‑пунктах"
        >
          <p className="card__title">MR валовой прибыли</p>
          <p className="card__value">{formatPercent(kpi.mrGross)}</p>
          <KpiDelta delta={kpiDeltas?.mrGross ?? null} format={(value) => formatPercent(value, 1)} />
        </div>
        <div
          className={`card ${kpiDeltas?.fixedShare ? (kpiDeltas.fixedShare > 0 ? 'card--up' : kpiDeltas.fixedShare < 0 ? 'card--down' : 'card--flat') : 'card--flat'}`}
          data-tooltip="Δ к предыдущему месяцу, в %‑пунктах"
        >
          <p className="card__title">Доля постоянных затрат</p>
          <p className="card__value">{formatPercent(kpi.fixedShare)}</p>
          <KpiDelta delta={kpiDeltas?.fixedShare ?? null} format={(value) => formatPercent(value, 1)} />
        </div>
        <div
          className={`card ${kpiDeltas?.netProfit ? (kpiDeltas.netProfit > 0 ? 'card--up' : kpiDeltas.netProfit < 0 ? 'card--down' : 'card--flat') : 'card--flat'}`}
          data-tooltip="Δ к предыдущему месяцу (последний месяц выбранного периода)"
        >
          <p className="card__title">Чистая прибыль</p>
          <p className="card__value">{formatCompactMoney(kpi.netProfit)}</p>
          <KpiDelta delta={kpiDeltas?.netProfit ?? null} format={(value) => formatCompactMoney(value)} />
        </div>
        <div
          className={`card ${kpiDeltas?.netMargin ? (kpiDeltas.netMargin > 0 ? 'card--up' : kpiDeltas.netMargin < 0 ? 'card--down' : 'card--flat') : 'card--flat'}`}
          data-tooltip="Δ к предыдущему месяцу, в %‑пунктах"
        >
          <p className="card__title">Рентабельность по ЧП</p>
          <p className="card__value">{formatPercent(kpi.netMargin)}</p>
          <KpiDelta delta={kpiDeltas?.netMargin ?? null} format={(value) => formatPercent(value, 1)} />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="panel">
          <h3 className="section-title">Выручка и MR по валовой прибыли</h3>
          <Chart option={charts.revenueOption} height={320} />
        </div>
        <div className="panel">
          <h3 className="section-title">Выручка по направлениям</h3>
          <Chart option={charts.revenueByDirectionOption} height={320} />
        </div>
        <div className="panel">
          <h3 className="section-title">Валовая прибыль по направлениям</h3>
          <Chart option={charts.grossByDirectionOption} height={320} />
        </div>
        <div className="panel">
          <h3 className="section-title">Чистая прибыль и рентабельность</h3>
          <Chart option={charts.netOption} height={320} />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="panel">
          <h3 className="section-title">Проекты: Стройка</h3>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Проект</th>
                  <th>Выручка</th>
                  <th>Валовая прибыль</th>
                  <th>Рентабельность</th>
                </tr>
              </thead>
              <tbody>
                {projectTables.construction.map((row) => (
                  <tr key={row.project}>
                    <td>{row.project}</td>
                    <td>{formatCompactMoney(row.revenue)}</td>
                    <td>{formatCompactMoney(row.gross)}</td>
                    <td>{formatPercent(row.profitability)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <h3 className="section-title">Проекты: Ремонт</h3>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Проект</th>
                  <th>Выручка</th>
                  <th>Валовая прибыль</th>
                  <th>Рентабельность</th>
                </tr>
              </thead>
              <tbody>
                {projectTables.repair.map((row) => (
                  <tr key={row.project}>
                    <td>{row.project}</td>
                    <td>{formatCompactMoney(row.revenue)}</td>
                    <td>{formatCompactMoney(row.gross)}</td>
                    <td>{formatPercent(row.profitability)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
