import { useEffect, useMemo, useState } from 'react';
import { useDataContext } from '../lib/data';
import { Chart } from '../components/Chart';
import { DateRange } from '../components/DateRange';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { KpiDelta } from '../components/KpiDelta';
import {
  buildMonthSeries,
  clampDateRange,
  daysBetween,
  formatCompactMoney,
  formatMonthLabel,
  formatNumber,
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

interface CashRow {
  date: Date;
  dateIso: string;
  monthKey: string;
  amount: number;
  operationType: string;
  oddsSection: string;
  direction: string;
}

interface ProfitRow {
  date: Date;
  dateIso: string;
  monthKey: string;
  amount: number;
  direction: string;
  sectionCode: number;
}

interface CapitalRow {
  date: Date;
  dateIso: string;
  amount: number;
  section1: string;
  section2: string;
  section3: string;
}

export const DashboardPage = () => {
  const { sheets } = useDataContext();
  const cashState = sheets['Деньги'];
  const profitState = sheets['Прибыль'];
  const capitalState = sheets['Капитал'];

  const cashRows = useMemo(() => {
    if (!cashState.data) return [] as CashRow[];
    const getField = (row: Record<string, unknown>, variants: string[]) => {
      for (const variant of variants) {
        if (row[variant] != null && row[variant] !== '') return row[variant];
      }
      return null;
    };
    return cashState.data.rows
      .map((row) => {
        const date = parseDateValue(getField(row, ['Дата']));
        if (!date) return null;
        const operationType = normalizeText(getField(row, ['Вид операции']));
        const amount = parseNumber(getField(row, ['Сумма']));
        const opKey = normalizeKey(operationType);
        let amountSigned = amount;
        if (opKey.includes('расход')) amountSigned = -Math.abs(amount);
        if (opKey.includes('приход')) amountSigned = Math.abs(amount);
        return {
          date,
          dateIso: toIsoDate(date),
          monthKey: toMonthKey(date),
          amount: amountSigned,
          operationType,
          oddsSection: normalizeText(getField(row, ['Раздел ОДДС'])),
          direction: normalizeText(getField(row, ['Направление']))
        } as CashRow;
      })
      .filter(Boolean) as CashRow[];
  }, [cashState.data]);

  const profitRows = useMemo(() => {
    if (!profitState.data) return [] as ProfitRow[];
    const getField = (row: Record<string, unknown>, variants: string[]) => {
      for (const variant of variants) {
        if (row[variant] != null && row[variant] !== '') return row[variant];
      }
      return null;
    };
    return profitState.data.rows
      .map((row) => {
        const date = parseDateValue(getField(row, ['Дата']));
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
          sectionCode
        } as ProfitRow;
      })
      .filter(Boolean) as ProfitRow[];
  }, [profitState.data]);

  const capitalRows = useMemo(() => {
    if (!capitalState.data) return [] as CapitalRow[];
    const getField = (row: Record<string, unknown>, variants: string[]) => {
      for (const variant of variants) {
        if (row[variant] != null && row[variant] !== '') return row[variant];
      }
      return null;
    };
    return capitalState.data.rows
      .map((row) => {
        const date = parseDateValue(getField(row, ['Дата']));
        if (!date) return null;
        return {
          date,
          dateIso: toIsoDate(date),
          amount: parseNumber(getField(row, ['Сумма'])),
          section1: normalizeText(getField(row, ['Раздел 1'])),
          section2: normalizeText(getField(row, ['Раздел 2'])),
          section3: normalizeText(getField(row, ['Раздел 3']))
        } as CapitalRow;
      })
      .filter(Boolean) as CapitalRow[];
  }, [capitalState.data]);

  const capitalDates = useMemo(() => uniqueSorted(capitalRows.map((row) => row.dateIso)), [capitalRows]);

  const [range, setRange] = useState({ start: '', end: '' });

  useEffect(() => {
    if (!capitalDates.length) return;
    if (range.start || range.end) return;
    const latest = capitalDates[capitalDates.length - 1];
    const latestDate = parseDateValue(latest)!;
    const start = new Date(latestDate.getFullYear(), 0, 1);
    setRange({ start: toIsoDate(start), end: latest });
  }, [capitalDates, range.start, range.end]);

  const period = useMemo(() => {
    if (!range.start || !range.end) return null;
    const start = parseDateValue(range.start);
    const end = parseDateValue(range.end);
    if (!start || !end) return null;
    return clampDateRange(start, end);
  }, [range]);

  const snapshotDate = useMemo(() => {
    if (!period) return null;
    const endIso = toIsoDate(period.end);
    const filtered = capitalDates.filter((date) => date <= endIso);
    return filtered.length ? filtered[filtered.length - 1] : null;
  }, [capitalDates, period]);

  const snapshotDateObj = snapshotDate ? parseDateValue(snapshotDate) : null;
  const flowPeriod = useMemo(() => {
    if (!snapshotDateObj) return null;
    const start = new Date(snapshotDateObj.getFullYear(), 0, 1);
    const end = new Date(snapshotDateObj.getFullYear(), snapshotDateObj.getMonth(), snapshotDateObj.getDate(), 23, 59, 59, 999);
    return { start, end };
  }, [snapshotDateObj]);

  const cashRowsFlow = useMemo(() => {
    if (!flowPeriod) return [] as CashRow[];
    return cashRows.filter((row) => row.date >= flowPeriod.start && row.date <= flowPeriod.end);
  }, [cashRows, flowPeriod]);

  const profitRowsFlow = useMemo(() => {
    if (!flowPeriod) return [] as ProfitRow[];
    return profitRows.filter((row) => row.date >= flowPeriod.start && row.date <= flowPeriod.end);
  }, [profitRows, flowPeriod]);

  const capitalRowsYear = useMemo(() => {
    if (!flowPeriod) return [] as CapitalRow[];
    return capitalRows.filter((row) => row.date >= flowPeriod.start && row.date <= flowPeriod.end);
  }, [capitalRows, flowPeriod]);

  const snapshotRows = useMemo(() => {
    if (!snapshotDate) return [] as CapitalRow[];
    return capitalRows.filter((row) => row.dateIso === snapshotDate);
  }, [capitalRows, snapshotDate]);

  const prevSnapshotDate = useMemo(() => {
    if (!snapshotDate) return null;
    const idx = capitalDates.indexOf(snapshotDate);
    return idx > 0 ? capitalDates[idx - 1] : null;
  }, [capitalDates, snapshotDate]);

  const prevSnapshotRows = useMemo(() => {
    if (!prevSnapshotDate) return [] as CapitalRow[];
    return capitalRows.filter((row) => row.dateIso === prevSnapshotDate);
  }, [capitalRows, prevSnapshotDate]);

  const warnings = useMemo(() => {
    if (!period || !flowPeriod || !snapshotDate) return [] as string[];
    const messages: string[] = [];
    const flowStartIso = toIsoDate(flowPeriod.start);
    const flowEndIso = toIsoDate(flowPeriod.end);
    if (range.start < flowStartIso || range.end > flowEndIso) {
      messages.push(`Потоки Деньги/Прибыль рассчитаны за период ${flowStartIso} — ${flowEndIso} относительно snapshotDate.`);
    }
    if (snapshotDate !== range.end) {
      messages.push(`Дата snapshotDate скорректирована до ${snapshotDate} (последняя доступная дата <= выбранной).`);
    }
    return messages;
  }, [period, flowPeriod, snapshotDate, range]);

  const isMovement = (section: string) => normalizeKey(section).includes('перемещ');
  const isBalance = (op: string) => normalizeKey(op).includes('остаток');
  const isExpense = (op: string) => normalizeKey(op).includes('расход');
  const isMainActivity = (section: string) => normalizeKey(section).includes('основн');

  const kpi = useMemo(() => {
    if (!flowPeriod) return null;
    let cashNet = 0;
    let expenseMain = 0;

    cashRowsFlow.forEach((row) => {
      if (isBalance(row.operationType)) return;
      if (isMovement(row.oddsSection)) return;
      cashNet += row.amount;
      if (isExpense(row.operationType) && isMainActivity(row.oddsSection)) {
        expenseMain += Math.abs(row.amount);
      }
    });

    const calendarDays = daysBetween(flowPeriod.start, flowPeriod.end);
    const avgDailyExpense = expenseMain / calendarDays;
    const cashBuffer = avgDailyExpense !== 0 ? cashNet / avgDailyExpense : 0;

    const currentAssets = Math.abs(snapshotRows.reduce((acc, row) => normalizeKey(row.section2) === 'оборотные активы' ? acc + row.amount : acc, 0));
    const shortLiabilities = Math.abs(snapshotRows.reduce((acc, row) => normalizeKey(row.section3) === 'краткосрочные обязательства' ? acc + row.amount : acc, 0));
    const liquidity = shortLiabilities !== 0 ? currentAssets / shortLiabilities : 0;

    const sectionAgg: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
    profitRowsFlow.forEach((row) => {
      if (sectionAgg.hasOwnProperty(row.sectionCode)) {
        sectionAgg[row.sectionCode] += row.amount;
      }
    });

    const revenue = sectionAgg[1] || 0;
    const cost = Math.abs(sectionAgg[2] || 0);
    const overhead = Math.abs(sectionAgg[3] || 0);
    const commercial = Math.abs(sectionAgg[4] || 0);
    const admin = Math.abs(sectionAgg[5] || 0);
    const belowIncome = Math.abs(sectionAgg[6] || 0);
    const belowExpense = Math.abs(sectionAgg[7] || 0);

    const netProfit = revenue - cost - overhead - commercial - admin + belowIncome - belowExpense;
    const netMargin = revenue !== 0 ? netProfit / revenue : 0;
    const grossMr = revenue !== 0 ? (revenue - cost - overhead) / revenue : 0;

    const ownCapital = Math.abs(snapshotRows.reduce((acc, row) => normalizeKey(row.section2) === 'капитал' ? acc + row.amount : acc, 0));

    const capitalAtOrBefore = (dateIso: string, predicate: (row: CapitalRow) => boolean) => {
      const dates = uniqueSorted(capitalRows.filter(predicate).map((row) => row.dateIso));
      let candidate: string | null = null;
      dates.forEach((date) => {
        if (date <= dateIso) candidate = date;
      });
      if (!candidate) return { dateIso: null, value: 0 };
      const value = capitalRows.reduce((acc, row) => {
        return row.dateIso === candidate && predicate(row) ? acc + Math.abs(row.amount) : acc;
      }, 0);
      return { dateIso: candidate, value };
    };

    const endIso = snapshotDate || '';
    const startIso = toIsoDate(flowPeriod.start);

    const roeEnd = capitalAtOrBefore(endIso, (row) => normalizeKey(row.section2) === 'капитал');
    const roeStart = capitalAtOrBefore(startIso, (row) => normalizeKey(row.section2) === 'капитал');
    const avgCapital = (roeStart.value + roeEnd.value) / 2;
    const roeValue = avgCapital !== 0 ? netProfit / avgCapital : 0;

    const arEnd = capitalAtOrBefore(endIso, (row) => normalizeKey(row.section3).includes('дебитор'));
    const arStart = capitalAtOrBefore(startIso, (row) => normalizeKey(row.section3).includes('дебитор'));
    const avgAr = (arStart.value + arEnd.value) / 2;
    const arTurns = avgAr !== 0 && revenue !== 0 ? revenue / avgAr : 0;
    const arDays = arTurns !== 0 ? calendarDays / arTurns : 0;

    const costAbs = Math.abs(sectionAgg[2] || 0);
    const apEnd = capitalAtOrBefore(endIso, (row) => normalizeKey(row.section3).includes('кредитор'));
    const apStart = capitalAtOrBefore(startIso, (row) => normalizeKey(row.section3).includes('кредитор'));
    const avgAp = (apStart.value + apEnd.value) / 2;
    const apTurns = avgAp !== 0 && costAbs !== 0 ? costAbs / avgAp : 0;
    const apDays = apTurns !== 0 ? calendarDays / apTurns : 0;

    return {
      cashNet,
      cashBuffer,
      liquidity,
      netProfit,
      netMargin,
      grossMr,
      ownCapital,
      roe: {
        value: roeValue,
        percent: roeValue * 100,
        periodStart: roeStart.dateIso,
        periodEnd: roeEnd.dateIso
      },
      receivable: {
        turns: arTurns,
        days: arDays,
        periodStart: arStart.dateIso,
        periodEnd: arEnd.dateIso
      },
      payable: {
        turns: apTurns,
        days: apDays,
        periodStart: apStart.dateIso,
        periodEnd: apEnd.dateIso
      }
    };
  }, [cashRowsFlow, flowPeriod, profitRowsFlow, snapshotRows, snapshotDate, capitalRows]);

  const flowMonths = useMemo(() => {
    if (!flowPeriod) return [] as string[];
    return buildMonthSeries(flowPeriod.start, flowPeriod.end);
  }, [flowPeriod]);

  const cashMonthlyStats = useMemo(() => {
    const map: Record<string, { net: number; mainExpense: number }> = {};
    flowMonths.forEach((month) => {
      map[month] = { net: 0, mainExpense: 0 };
    });
    cashRowsFlow.forEach((row) => {
      if (isBalance(row.operationType) || isMovement(row.oddsSection)) return;
      if (!map[row.monthKey]) return;
      map[row.monthKey].net += row.amount;
      if (isExpense(row.operationType) && isMainActivity(row.oddsSection)) {
        map[row.monthKey].mainExpense += Math.abs(row.amount);
      }
    });
    return map;
  }, [cashRowsFlow, flowMonths]);

  const profitMonthlyAgg = useMemo(() => {
    const map: Record<string, any> = {};
    flowMonths.forEach((month) => {
      map[month] = {
        revenue: 0,
        cost: 0,
        overhead: 0,
        commercial: 0,
        admin: 0,
        belowIncome: 0,
        belowExpense: 0
      };
    });
    profitRowsFlow.forEach((row) => {
      if (!map[row.monthKey]) return;
      if (row.sectionCode === 1) map[row.monthKey].revenue += row.amount;
      if (row.sectionCode === 2) map[row.monthKey].cost += Math.abs(row.amount);
      if (row.sectionCode === 3) map[row.monthKey].overhead += Math.abs(row.amount);
      if (row.sectionCode === 4) map[row.monthKey].commercial += Math.abs(row.amount);
      if (row.sectionCode === 5) map[row.monthKey].admin += Math.abs(row.amount);
      if (row.sectionCode === 6) map[row.monthKey].belowIncome += Math.abs(row.amount);
      if (row.sectionCode === 7) map[row.monthKey].belowExpense += Math.abs(row.amount);
    });
    return map;
  }, [flowMonths, profitRowsFlow]);

  const kpiDeltas = useMemo(() => {
    if (!flowMonths.length || flowMonths.length < 2) return null;
    const latest = flowMonths[flowMonths.length - 1];
    const prev = flowMonths[flowMonths.length - 2];

    const cashCurr = cashMonthlyStats[latest];
    const cashPrev = cashMonthlyStats[prev];
    const cashNetDelta = cashCurr && cashPrev ? cashCurr.net - cashPrev.net : null;

    const getMonthBuffer = (monthKey: string) => {
      const stats = cashMonthlyStats[monthKey];
      if (!stats) return null;
      const [y, m] = monthKey.split('-').map(Number);
      const days = new Date(y, m, 0).getDate();
      const avgDaily = stats.mainExpense / days;
      return avgDaily !== 0 ? stats.net / avgDaily : 0;
    };

    const cashBufferDelta = (() => {
      const curr = getMonthBuffer(latest);
      const prevVal = getMonthBuffer(prev);
      if (curr == null || prevVal == null) return null;
      return curr - prevVal;
    })();

    const currProfit = profitMonthlyAgg[latest];
    const prevProfit = profitMonthlyAgg[prev];
    const netCurr =
      currProfit.revenue -
      currProfit.cost -
      currProfit.overhead -
      currProfit.commercial -
      currProfit.admin +
      currProfit.belowIncome -
      currProfit.belowExpense;
    const netPrev =
      prevProfit.revenue -
      prevProfit.cost -
      prevProfit.overhead -
      prevProfit.commercial -
      prevProfit.admin +
      prevProfit.belowIncome -
      prevProfit.belowExpense;
    const netMarginCurr = currProfit.revenue !== 0 ? netCurr / currProfit.revenue : 0;
    const netMarginPrev = prevProfit.revenue !== 0 ? netPrev / prevProfit.revenue : 0;

    const grossCurr = currProfit.revenue - currProfit.cost - currProfit.overhead;
    const grossPrev = prevProfit.revenue - prevProfit.cost - prevProfit.overhead;
    const grossMrCurr = currProfit.revenue !== 0 ? grossCurr / currProfit.revenue : 0;
    const grossMrPrev = prevProfit.revenue !== 0 ? grossPrev / prevProfit.revenue : 0;

    const ownCapitalPrev = prevSnapshotRows.length
      ? Math.abs(
          prevSnapshotRows.reduce((acc, row) => (normalizeKey(row.section2) === 'капитал' ? acc + row.amount : acc), 0)
        )
      : null;
    const currentAssetsPrev = prevSnapshotRows.length
      ? Math.abs(
          prevSnapshotRows.reduce(
            (acc, row) => (normalizeKey(row.section2) === 'оборотные активы' ? acc + row.amount : acc),
            0
          )
        )
      : null;
    const shortLiabilitiesPrev = prevSnapshotRows.length
      ? Math.abs(
          prevSnapshotRows.reduce(
            (acc, row) =>
              normalizeKey(row.section3) === 'краткосрочные обязательства' ? acc + row.amount : acc,
            0
          )
        )
      : null;
    const liquidityPrev =
      shortLiabilitiesPrev && currentAssetsPrev ? currentAssetsPrev / shortLiabilitiesPrev : null;

    return {
      cashNet: cashNetDelta,
      cashBuffer: cashBufferDelta,
      liquidity: kpi && liquidityPrev != null ? kpi.liquidity - liquidityPrev : null,
      netProfit: netCurr - netPrev,
      netMargin: netMarginCurr - netMarginPrev,
      grossMr: grossMrCurr - grossMrPrev,
      ownCapital: kpi && ownCapitalPrev != null ? kpi.ownCapital - ownCapitalPrev : null
    };
  }, [cashMonthlyStats, flowMonths, kpi, prevSnapshotRows, profitMonthlyAgg]);

  const charts = useMemo(() => {
    if (!flowPeriod) return null;
    const axisStyle = {
      axisLine: { lineStyle: { color: '#37517a' } },
      axisLabel: { color: '#9fb3d9' },
      splitLine: { lineStyle: { color: 'rgba(55, 81, 122, 0.3)' } }
    };

    const formatChartMoney = (value: number) => formatCompactMoney(value, 0);
    const formatChartPercent = (value: number) => formatPercent(value, 2);

    const months = buildMonthSeries(flowPeriod.start, flowPeriod.end);
    const cashMonthly: Record<string, number> = {};
    months.forEach((month) => (cashMonthly[month] = 0));
    cashRowsFlow.forEach((row) => {
      if (isBalance(row.operationType) || isMovement(row.oddsSection)) return;
      if (!cashMonthly.hasOwnProperty(row.monthKey)) cashMonthly[row.monthKey] = 0;
      cashMonthly[row.monthKey] += row.amount;
    });

    const cashMonthlyOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 52 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const item = params[0];
          return `${item.axisValue}<br/>${formatChartMoney(item.value || 0)}`;
        }
      },
      xAxis: {
        type: 'category',
        data: months.map(formatMonthLabel),
        ...axisStyle,
        axisLabel: { color: '#9fb3d9', interval: 0, rotate: 45, margin: 12, fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        ...axisStyle,
        axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartMoney(value) }
      },
      series: [
        {
          type: 'line',
          data: months.map((month) => cashMonthly[month] || 0),
          smooth: true,
          lineStyle: { color: '#00d9ff', width: 2 },
          areaStyle: { color: 'rgba(0, 217, 255, 0.18)' }
        }
      ]
    };

    const directions = uniqueSorted(cashRowsFlow.map((row) => row.direction || 'Без направления'));
    const cashByDirection: Record<string, Record<string, number>> = {};
    directions.forEach((dir) => {
      cashByDirection[dir] = Object.fromEntries(months.map((month) => [month, 0]));
    });
    cashRowsFlow.forEach((row) => {
      if (isBalance(row.operationType) || isMovement(row.oddsSection)) return;
      const dir = row.direction || 'Без направления';
      if (!cashByDirection[dir]) return;
      cashByDirection[dir][row.monthKey] += row.amount;
    });

    const cashByDirectionOption: EChartsOption = {
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
        stack: 'cash',
        data: months.map((month) => cashByDirection[dir][month])
      }))
    };

    const monthlyProfitAgg: Record<string, any> = {};
    months.forEach((month) => {
      monthlyProfitAgg[month] = {
        revenue: 0,
        cost: 0,
        overhead: 0,
        commercial: 0,
        admin: 0,
        belowIncome: 0,
        belowExpense: 0
      };
    });
    profitRowsFlow.forEach((row) => {
      if (!monthlyProfitAgg[row.monthKey]) return;
      if (row.sectionCode === 1) monthlyProfitAgg[row.monthKey].revenue += row.amount;
      if (row.sectionCode === 2) monthlyProfitAgg[row.monthKey].cost += Math.abs(row.amount);
      if (row.sectionCode === 3) monthlyProfitAgg[row.monthKey].overhead += Math.abs(row.amount);
      if (row.sectionCode === 4) monthlyProfitAgg[row.monthKey].commercial += Math.abs(row.amount);
      if (row.sectionCode === 5) monthlyProfitAgg[row.monthKey].admin += Math.abs(row.amount);
      if (row.sectionCode === 6) monthlyProfitAgg[row.monthKey].belowIncome += Math.abs(row.amount);
      if (row.sectionCode === 7) monthlyProfitAgg[row.monthKey].belowExpense += Math.abs(row.amount);
    });

    const revenueMrOption: EChartsOption = {
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
          data: months.map((month) => monthlyProfitAgg[month].revenue),
          itemStyle: { color: '#2f8cff' }
        },
        {
          type: 'line',
          name: 'MR валовой прибыли',
          data: months.map((month) => {
            const item = monthlyProfitAgg[month];
            const gross = item.revenue - item.cost - item.overhead;
            return item.revenue !== 0 ? gross / item.revenue : 0;
          }),
          smooth: true,
          lineStyle: { color: '#00d9ff' }
        }
      ]
    };

    const profitDirections = uniqueSorted(profitRowsFlow.map((row) => row.direction || 'Без направления'));
    const grossByDirection: Record<string, Record<string, number>> = {};
    profitDirections.forEach((dir) => {
      grossByDirection[dir] = Object.fromEntries(months.map((month) => [month, 0]));
    });
    profitRowsFlow.forEach((row) => {
      const dir = row.direction || 'Без направления';
      if (!grossByDirection[dir]) return;
      if (row.sectionCode === 1) grossByDirection[dir][row.monthKey] += row.amount;
      if (row.sectionCode === 2 || row.sectionCode === 3) grossByDirection[dir][row.monthKey] -= Math.abs(row.amount);
    });

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
      series: profitDirections.map((dir) => ({
        type: 'bar',
        name: dir,
        stack: 'gross',
        data: months.map((month) => grossByDirection[dir][month])
      }))
    };

    const netMarginOption: EChartsOption = {
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
            const item = monthlyProfitAgg[month];
            return item.revenue - item.cost - item.overhead - item.commercial - item.admin + item.belowIncome - item.belowExpense;
          }),
          itemStyle: { color: '#2fe3a0' }
        },
        {
          type: 'line',
          name: 'Рентабельность',
          data: months.map((month) => {
            const item = monthlyProfitAgg[month];
            const net = item.revenue - item.cost - item.overhead - item.commercial - item.admin + item.belowIncome - item.belowExpense;
            return item.revenue !== 0 ? net / item.revenue : 0;
          }),
          smooth: true,
          lineStyle: { color: '#ffb347' }
        }
      ]
    };

    const dates = uniqueSorted(capitalRowsYear.map((row) => row.dateIso));
    const receivableMap: Record<string, number> = {};
    const payableMap: Record<string, number> = {};
    const equityMap: Record<string, number> = {};
    const debtMap: Record<string, number> = {};
    const independenceMap: Record<string, number> = {};

    dates.forEach((date) => {
      receivableMap[date] = 0;
      payableMap[date] = 0;
      equityMap[date] = 0;
      debtMap[date] = 0;
    });

    capitalRowsYear.forEach((row) => {
      if (normalizeKey(row.section3).includes('дебитор')) receivableMap[row.dateIso] += Math.abs(row.amount);
      if (normalizeKey(row.section3).includes('кредитор')) payableMap[row.dateIso] += Math.abs(row.amount);
      if (normalizeKey(row.section2) === 'капитал') equityMap[row.dateIso] += Math.abs(row.amount);
      if (normalizeKey(row.section2) === 'обязательства') debtMap[row.dateIso] += Math.abs(row.amount);
    });

    dates.forEach((date) => {
      const rows = capitalRowsYear.filter((row) => row.dateIso === date);
      const assets = Math.abs(rows.reduce((acc, row) => normalizeKey(row.section1) === 'активы' ? acc + row.amount : acc, 0));
      const own = Math.abs(rows.reduce((acc, row) => normalizeKey(row.section2) === 'капитал' ? acc + row.amount : acc, 0));
      independenceMap[date] = assets !== 0 ? own / assets : 0;
    });

    const receivableOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 52 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const item = params[0];
          return `${item.axisValue}<br/>${formatChartMoney(item.value || 0)}`;
        }
      },
      xAxis: { type: 'category', data: dates, ...axisStyle },
      yAxis: {
        type: 'value',
        ...axisStyle,
        axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartMoney(value) }
      },
      series: [{ type: 'bar', data: dates.map((date) => receivableMap[date] || 0), itemStyle: { color: '#00d9ff' } }]
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
      xAxis: { type: 'category', data: dates, ...axisStyle },
      yAxis: {
        type: 'value',
        ...axisStyle,
        axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartMoney(value) }
      },
      series: [{ type: 'bar', data: dates.map((date) => payableMap[date] || 0), itemStyle: { color: '#ffb347' } }]
    };

    const debtEquityOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 52 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const items = params
            .map((p: any) => `${p.seriesName}: ${formatChartMoney(p.value || 0)}`)
            .join('<br/>');
          return `${params[0].axisValue}<br/>${items}`;
        }
      },
      legend: { textStyle: { color: '#9fb3d9' } },
      xAxis: { type: 'category', data: dates, ...axisStyle },
      yAxis: { type: 'value', ...axisStyle, axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartMoney(value) } },
      series: [
        { type: 'bar', name: 'Капитал', stack: 'total', data: dates.map((date) => equityMap[date] || 0), itemStyle: { color: '#2fe3a0' } },
        { type: 'bar', name: 'Обязательства', stack: 'total', data: dates.map((date) => debtMap[date] || 0), itemStyle: { color: '#ff7b7b' } }
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
      xAxis: { type: 'category', data: dates, ...axisStyle },
      yAxis: { type: 'value', ...axisStyle, axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatChartPercent(value) } },
      series: [{ type: 'line', data: dates.map((date) => independenceMap[date] || 0), smooth: true, lineStyle: { color: '#00d9ff' } }]
    };

    return {
      cashMonthlyOption,
      cashByDirectionOption,
      revenueMrOption,
      grossByDirectionOption,
      netMarginOption,
      receivableOption,
      payableOption,
      debtEquityOption,
      independenceOption
    };
  }, [flowPeriod, cashRowsFlow, profitRowsFlow, capitalRowsYear, snapshotDate]);

  const getCardStatus = (delta: number | null, value?: number) => {
    if (delta != null) {
      if (delta > 0) return 'card--up';
      if (delta < 0) return 'card--down';
      return 'card--flat';
    }
    if (value == null) return 'card--flat';
    if (value > 0) return 'card--up';
    if (value < 0) return 'card--down';
    return 'card--flat';
  };

  if (
    cashState.status === 'loading' ||
    profitState.status === 'loading' ||
    capitalState.status === 'loading' ||
    cashState.status === 'idle' ||
    profitState.status === 'idle' ||
    capitalState.status === 'idle'
  ) {
    return <LoadingState label="Загрузка данных для дэшборда…" />;
  }

  if (cashState.status === 'error' || profitState.status === 'error' || capitalState.status === 'error') {
    return <ErrorState message="Ошибка загрузки данных из таблицы." />;
  }

  if (!period || !flowPeriod || !snapshotDate || !kpi || !charts) {
    return <ErrorState message="Не удалось собрать данные для дэшборда." />;
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <DateRange start={range.start} end={range.end} onChange={setRange} />
        <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span className="badge">snapshotDate: {snapshotDate}</span>
          <span className="badge">Период потоков: {toIsoDate(flowPeriod.start)} — {toIsoDate(flowPeriod.end)}</span>
        </div>
        {warnings.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {warnings.map((msg, idx) => (
              <div className="notice" key={idx} style={{ marginBottom: 6 }}>{msg}</div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid--auto">
        <div
          className={`card ${getCardStatus(kpiDeltas?.cashNet ?? null, kpi.cashNet)}`}
          data-tooltip="Δ к предыдущему месяцу по чистому денежному потоку"
        >
          <p className="card__title">Чистый денежный поток</p>
          <p className="card__value" style={{ color: kpi.cashNet >= 0 ? '#2fe3a0' : '#ff7b7b' }}>{formatCompactMoney(kpi.cashNet)}</p>
          <KpiDelta delta={kpiDeltas?.cashNet ?? null} format={(value) => formatCompactMoney(value)} />
        </div>
        <div
          className={`card ${getCardStatus(kpiDeltas?.cashBuffer ?? null, kpi.cashBuffer)}`}
          data-tooltip="Δ к предыдущему месяцу: ЧДП / среднедневной расход основной деятельности"
        >
          <p className="card__title">Cash Buffer, дни</p>
          <p className="card__value">{formatNumber(kpi.cashBuffer, 1)}</p>
          <KpiDelta delta={kpiDeltas?.cashBuffer ?? null} format={(value) => formatNumber(value, 1)} />
        </div>
        <div
          className={`card ${getCardStatus(kpiDeltas?.liquidity ?? null, kpi.liquidity)}`}
          data-tooltip="Δ к предыдущей отчетной дате (snapshot)"
        >
          <p className="card__title">Коэффициент текущей ликвидности</p>
          <p className="card__value">{formatNumber(kpi.liquidity, 2)}</p>
          <KpiDelta delta={kpiDeltas?.liquidity ?? null} format={(value) => formatNumber(value, 2)} />
        </div>
        <div
          className={`card ${getCardStatus(kpiDeltas?.netProfit ?? null, kpi.netProfit)}`}
          data-tooltip="Δ к предыдущему месяцу по чистой прибыли"
        >
          <p className="card__title">Чистая прибыль</p>
          <p className="card__value">{formatCompactMoney(kpi.netProfit)}</p>
          <KpiDelta delta={kpiDeltas?.netProfit ?? null} format={(value) => formatCompactMoney(value)} />
        </div>
        <div
          className={`card ${getCardStatus(kpiDeltas?.netMargin ?? null, kpi.netMargin)}`}
          data-tooltip="Δ к предыдущему месяцу, в %‑пунктах"
        >
          <p className="card__title">Рентабельность по ЧП</p>
          <p className="card__value">{formatPercent(kpi.netMargin)}</p>
          <KpiDelta delta={kpiDeltas?.netMargin ?? null} format={(value) => formatPercent(value, 1)} />
        </div>
        <div
          className={`card ${getCardStatus(kpiDeltas?.grossMr ?? null, kpi.grossMr)}`}
          data-tooltip="Δ к предыдущему месяцу, в %‑пунктах"
        >
          <p className="card__title">MR валовой прибыли</p>
          <p className="card__value">{formatPercent(kpi.grossMr)}</p>
          <KpiDelta delta={kpiDeltas?.grossMr ?? null} format={(value) => formatPercent(value, 1)} />
        </div>
        <div
          className={`card ${getCardStatus(kpiDeltas?.ownCapital ?? null, kpi.ownCapital)}`}
          data-tooltip="Δ к предыдущей отчетной дате (snapshot)"
        >
          <p className="card__title">Собственный капитал</p>
          <p className="card__value">{formatCompactMoney(kpi.ownCapital)}</p>
          <KpiDelta delta={kpiDeltas?.ownCapital ?? null} format={(value) => formatCompactMoney(value)} />
        </div>
        <div className={`card ${getCardStatus(null, kpi.roe.value)}`}>
          <p className="card__title">ROE</p>
          <p className="card__value">{formatPercent(kpi.roe.value)}</p>
          <p className="card__hint">{kpi.roe.periodStart} — {kpi.roe.periodEnd}</p>
        </div>
        <div className={`card ${getCardStatus(null, kpi.receivable.turns)}`}>
          <p className="card__title">Оборачиваемость ДЗ</p>
          <p className="card__value">{formatNumber(kpi.receivable.turns, 2)} раз / {formatNumber(kpi.receivable.days, 0)} дн.</p>
          <p className="card__hint">{kpi.receivable.periodStart} — {kpi.receivable.periodEnd}</p>
        </div>
        <div className={`card ${getCardStatus(null, kpi.payable.turns)}`}>
          <p className="card__title">Оборачиваемость КЗ</p>
          <p className="card__value">{formatNumber(kpi.payable.turns, 2)} раз / {formatNumber(kpi.payable.days, 0)} дн.</p>
          <p className="card__hint">{kpi.payable.periodStart} — {kpi.payable.periodEnd}</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="panel">
          <h3 className="section-title">Чистый денежный поток по месяцам</h3>
          <Chart option={charts.cashMonthlyOption} height={300} />
        </div>
        <div className="panel">
          <h3 className="section-title">Чистый денежный поток по направлениям</h3>
          <Chart option={charts.cashByDirectionOption} height={300} />
        </div>
        <div className="panel">
          <h3 className="section-title">Выручка и MR валовой прибыли</h3>
          <Chart option={charts.revenueMrOption} height={300} />
        </div>
        <div className="panel">
          <h3 className="section-title">Валовая прибыль по направлениям</h3>
          <Chart option={charts.grossByDirectionOption} height={300} />
        </div>
        <div className="panel">
          <h3 className="section-title">Чистая прибыль и рентабельность</h3>
          <Chart option={charts.netMarginOption} height={300} />
        </div>
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
          <h3 className="section-title">Финансовая независимость</h3>
          <Chart option={charts.independenceOption} height={280} />
        </div>
      </div>
    </div>
  );
};
