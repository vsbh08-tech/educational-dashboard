import { useEffect, useMemo, useState } from 'react';
import { useDataContext } from '../lib/data';
import { Chart } from '../components/Chart';
import { DateRange } from '../components/DateRange';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import {
  clampDateRange,
  formatCompactMoney,
  formatNumber,
  formatPercent,
  normalizeKey,
  normalizeText,
  parseDateValue,
  parseNumber,
  toIsoDate,
  uniqueSorted
} from '../lib/utils';
import type { EChartsOption } from 'echarts';

interface CapitalRow {
  date: Date;
  dateIso: string;
  section1: string;
  section2: string;
  section3: string;
  section4: string;
  amount: number;
}

export const CapitalPage = () => {
  const { sheets } = useDataContext();
  const sheetState = sheets['Капитал'];

  const capitalRows = useMemo(() => {
    if (!sheetState.data) return [] as CapitalRow[];

    const getField = (row: Record<string, unknown>, variants: string[]) => {
      for (const variant of variants) {
        if (row[variant] != null && row[variant] !== '') return row[variant];
      }
      return null;
    };

    return sheetState.data.rows
      .map((row) => {
        const date = parseDateValue(getField(row, ['Дата']));
        if (!date) return null;
        return {
          date,
          dateIso: toIsoDate(date),
          section1: normalizeText(getField(row, ['Раздел 1'])),
          section2: normalizeText(getField(row, ['Раздел 2'])),
          section3: normalizeText(getField(row, ['Раздел 3'])),
          section4: normalizeText(getField(row, ['Раздел 4'])),
          amount: parseNumber(getField(row, ['Сумма']))
        } as CapitalRow;
      })
      .filter(Boolean) as CapitalRow[];
  }, [sheetState.data]);

  const minDate = useMemo(() => {
    if (!capitalRows.length) return null;
    return capitalRows.reduce((min, row) => (row.date < min ? row.date : min), capitalRows[0].date);
  }, [capitalRows]);

  const maxDate = useMemo(() => {
    if (!capitalRows.length) return null;
    return capitalRows.reduce((max, row) => (row.date > max ? row.date : max), capitalRows[0].date);
  }, [capitalRows]);

  const [range, setRange] = useState({ start: '', end: '' });

  useEffect(() => {
    if (!minDate || !maxDate) return;
    if (!range.start && !range.end) {
      setRange({ start: toIsoDate(minDate), end: toIsoDate(maxDate) });
    }
  }, [minDate, maxDate, range.start, range.end]);

  const period = useMemo(() => {
    if (!range.start || !range.end) return null;
    const start = parseDateValue(range.start);
    const end = parseDateValue(range.end);
    if (!start || !end) return null;
    return clampDateRange(start, end);
  }, [range]);

  const rowsInPeriod = useMemo(() => {
    if (!period) return [] as CapitalRow[];
    return capitalRows.filter((row) => row.date >= period.start && row.date <= period.end);
  }, [capitalRows, period]);

  const snapshotDate = useMemo(() => {
    if (!period) return null;
    const endIso = toIsoDate(period.end);
    const dates = uniqueSorted(capitalRows.map((row) => row.dateIso))
      .filter((dateIso) => dateIso <= endIso);
    return dates.length ? dates[dates.length - 1] : null;
  }, [capitalRows, period]);

  const snapshotRows = useMemo(() => {
    if (!snapshotDate) return [] as CapitalRow[];
    return capitalRows.filter((row) => row.dateIso === snapshotDate);
  }, [capitalRows, snapshotDate]);

  const kpi = useMemo(() => {
    const ownCapital = Math.abs(snapshotRows.reduce((acc, row) => {
      return normalizeKey(row.section2) === 'капитал' ? acc + row.amount : acc;
    }, 0));

    const currentAssets = Math.abs(snapshotRows.reduce((acc, row) => {
      return normalizeKey(row.section2) === 'оборотные активы' ? acc + row.amount : acc;
    }, 0));

    const shortLiabilities = Math.abs(snapshotRows.reduce((acc, row) => {
      return normalizeKey(row.section3) === 'краткосрочные обязательства' ? acc + row.amount : acc;
    }, 0));

    const liquidity = currentAssets !== 0 ? shortLiabilities / currentAssets : 0;

    const assets = Math.abs(snapshotRows.reduce((acc, row) => {
      return normalizeKey(row.section1) === 'активы' ? acc + row.amount : acc;
    }, 0));

    const independence = assets !== 0 ? ownCapital / assets : 0;

    return { ownCapital, liquidity, independence };
  }, [snapshotRows]);

  const charts = useMemo(() => {
    const axisStyle = {
      axisLine: { lineStyle: { color: '#37517a' } },
      axisLabel: { color: '#9fb3d9' },
      splitLine: { lineStyle: { color: 'rgba(55, 81, 122, 0.3)' } }
    };

    const formatChartMoney = (value: number) => formatCompactMoney(value, 0);
    const formatChartPercent = (value: number) => formatPercent(value, 2);

    const pieFromSection1 = (section1Key: string) => {
      const map: Record<string, number> = {};
      snapshotRows.forEach((row) => {
        if (normalizeKey(row.section1) !== section1Key) return;
        const key = row.section3 || 'Без подгруппы';
        map[key] = (map[key] || 0) + Math.abs(row.amount);
      });
      return Object.keys(map).map((key) => ({ name: key, value: map[key] }));
    };

    const assetsPie: EChartsOption = {
      tooltip: { trigger: 'item', formatter: (params: any) => `${params.name}<br/>${formatChartMoney(params.value || 0)}` },
      series: [
        {
          type: 'pie',
          radius: ['35%', '65%'],
          data: pieFromSection1('активы'),
          label: { color: '#d7e4ff' }
        }
      ]
    };

    const liabilitiesPie: EChartsOption = {
      tooltip: { trigger: 'item', formatter: (params: any) => `${params.name}<br/>${formatChartMoney(params.value || 0)}` },
      series: [
        {
          type: 'pie',
          radius: ['35%', '65%'],
          data: pieFromSection1('пассивы'),
          label: { color: '#d7e4ff' }
        }
      ]
    };

    const dateSeries = uniqueSorted(rowsInPeriod.map((row) => row.dateIso));
    const buildTrend = (predicate: (row: CapitalRow) => boolean) => {
      const map: Record<string, number> = {};
      dateSeries.forEach((dateIso) => (map[dateIso] = 0));
      rowsInPeriod.forEach((row) => {
        if (!predicate(row)) return;
        map[row.dateIso] += Math.abs(row.amount);
      });
      return map;
    };

    const receivable = buildTrend((row) => normalizeKey(row.section3).includes('дебитор'));
    const payable = buildTrend((row) => normalizeKey(row.section3).includes('кредитор'));

    const receivableOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 52 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const item = params[0];
          return `${item.axisValue}<br/>${formatChartMoney(item.value || 0)}`;
        }
      },
      xAxis: { type: 'category', data: dateSeries, ...axisStyle },
      yAxis: {
        type: 'value',
        ...axisStyle,
        axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartMoney(value) }
      },
      series: [
        { type: 'line', data: dateSeries.map((date) => receivable[date] || 0), smooth: true, lineStyle: { color: '#00d9ff' } }
      ]
    };

    const payableOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 52 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const item = params[0];
          return `${item.axisValue}<br/>${formatChartMoney(item.value || 0)}`;
        }
      },
      xAxis: { type: 'category', data: dateSeries, ...axisStyle },
      yAxis: {
        type: 'value',
        ...axisStyle,
        axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartMoney(value) }
      },
      series: [
        { type: 'line', data: dateSeries.map((date) => payable[date] || 0), smooth: true, lineStyle: { color: '#ffb347' } }
      ]
    };

    const equityMap: Record<string, number> = {};
    const debtMap: Record<string, number> = {};
    dateSeries.forEach((dateIso) => {
      equityMap[dateIso] = 0;
      debtMap[dateIso] = 0;
    });

    rowsInPeriod.forEach((row) => {
      if (normalizeKey(row.section2) === 'капитал') equityMap[row.dateIso] += Math.abs(row.amount);
      if (normalizeKey(row.section2) === 'обязательства') debtMap[row.dateIso] += Math.abs(row.amount);
    });

    const debtEquityOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const equity = params.find((p: any) => p.seriesName === 'Капитал')?.value || 0;
          const debt = params.find((p: any) => p.seriesName === 'Обязательства')?.value || 0;
          const total = equity + debt;
          return `${params[0].axisValue}<br/>Капитал: ${formatChartMoney(equity)} (${formatChartPercent(total ? equity / total : 0)})<br/>Обязательства: ${formatChartMoney(debt)} (${formatChartPercent(total ? debt / total : 0)})`;
        }
      },
      legend: { textStyle: { color: '#9fb3d9' } },
      xAxis: { type: 'category', data: dateSeries, ...axisStyle },
      yAxis: { type: 'value', ...axisStyle, axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartMoney(value) } },
      series: [
        { type: 'bar', name: 'Капитал', stack: 'total', data: dateSeries.map((date) => equityMap[date] || 0), itemStyle: { color: '#2fe3a0' } },
        { type: 'bar', name: 'Обязательства', stack: 'total', data: dateSeries.map((date) => debtMap[date] || 0), itemStyle: { color: '#ff7b7b' } }
      ]
    };

    const liquidityMap: Record<string, number> = {};
    const independenceMap: Record<string, number> = {};

    dateSeries.forEach((dateIso) => {
      const rows = rowsInPeriod.filter((row) => row.dateIso === dateIso);
      const currentAssets = Math.abs(rows.reduce((acc, row) => normalizeKey(row.section2) === 'оборотные активы' ? acc + row.amount : acc, 0));
      const shortLiabilities = Math.abs(rows.reduce((acc, row) => normalizeKey(row.section3) === 'краткосрочные обязательства' ? acc + row.amount : acc, 0));
      liquidityMap[dateIso] = currentAssets !== 0 ? shortLiabilities / currentAssets : 0;

      const assets = Math.abs(rows.reduce((acc, row) => normalizeKey(row.section1) === 'активы' ? acc + row.amount : acc, 0));
      const ownCapital = Math.abs(rows.reduce((acc, row) => normalizeKey(row.section2) === 'капитал' ? acc + row.amount : acc, 0));
      independenceMap[dateIso] = assets !== 0 ? ownCapital / assets : 0;
    });

    const liquidityOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 52 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const item = params[0];
          return `${item.axisValue}<br/>${formatChartPercent(item.value || 0)}`;
        }
      },
      xAxis: { type: 'category', data: dateSeries, ...axisStyle },
      yAxis: { type: 'value', ...axisStyle, axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartPercent(value) } },
      series: [
        { type: 'line', data: dateSeries.map((date) => liquidityMap[date] || 0), smooth: true, lineStyle: { color: '#00d9ff' } }
      ]
    };

    const independenceOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 52 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const item = params[0];
          return `${item.axisValue}<br/>${formatChartPercent(item.value || 0)}`;
        }
      },
      xAxis: { type: 'category', data: dateSeries, ...axisStyle },
      yAxis: { type: 'value', ...axisStyle, axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartPercent(value) } },
      series: [
        { type: 'line', data: dateSeries.map((date) => independenceMap[date] || 0), smooth: true, lineStyle: { color: '#ffb347' } }
      ]
    };

    return {
      assetsPie,
      liabilitiesPie,
      receivableOption,
      payableOption,
      debtEquityOption,
      liquidityOption,
      independenceOption
    };
  }, [rowsInPeriod, snapshotRows]);

  if (sheetState.status === 'loading' || sheetState.status === 'idle') {
    return <LoadingState label="Загрузка листа Капитал…" />;
  }

  if (sheetState.status === 'error') {
    return <ErrorState message={sheetState.error || 'Ошибка загрузки листа Капитал.'} />;
  }

  if (!period) {
    return <ErrorState message="Не удалось определить период дат." />;
  }

  if (!snapshotDate) {
    return <ErrorState message="Нет доступной отчетной даты на выбранный период." />;
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <DateRange start={range.start} end={range.end} onChange={setRange} />
        <p className="card__hint" style={{ marginTop: 8 }}>Срез данных на дату: {snapshotDate}</p>
      </div>

      <div className="grid grid--auto">
        <div className="card">
          <p className="card__title">Собственный капитал</p>
          <p className="card__value">{formatCompactMoney(kpi.ownCapital)}</p>
        </div>
        <div className="card">
          <p className="card__title">Коэффициент текущей ликвидности</p>
          <p className="card__value">{formatNumber(kpi.liquidity, 2)}</p>
          <p className="card__hint">Норма 1,5-2</p>
        </div>
        <div className="card">
          <p className="card__title">Финансовая независимость</p>
          <p className="card__value">{formatPercent(kpi.independence)}</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="panel">
          <h3 className="section-title">Структура активов</h3>
          <Chart option={charts.assetsPie} height={300} />
        </div>
        <div className="panel">
          <h3 className="section-title">Структура пассивов</h3>
          <Chart option={charts.liabilitiesPie} height={300} />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="panel">
          <h3 className="section-title">Динамика дебиторской задолженности</h3>
          <Chart option={charts.receivableOption} height={280} />
        </div>
        <div className="panel">
          <h3 className="section-title">Динамика кредиторской задолженности</h3>
          <Chart option={charts.payableOption} height={280} />
        </div>
        <div className="panel">
          <h3 className="section-title">Заемный и собственный капитал</h3>
          <Chart option={charts.debtEquityOption} height={280} />
        </div>
        <div className="panel">
          <h3 className="section-title">Коэффициент текущей ликвидности</h3>
          <Chart option={charts.liquidityOption} height={280} />
        </div>
        <div className="panel">
          <h3 className="section-title">Финансовая независимость</h3>
          <Chart option={charts.independenceOption} height={280} />
        </div>
      </div>
    </div>
  );
};
