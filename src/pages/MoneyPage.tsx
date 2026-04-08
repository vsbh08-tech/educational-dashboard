import { useEffect, useMemo, useState } from 'react';
import { useDataContext } from '../lib/data';
import { Chart } from '../components/Chart';
import { DateRange } from '../components/DateRange';
import { Select } from '../components/Select';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
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

interface MoneyRow {
  date: Date;
  dateIso: string;
  monthKey: string;
  description: string;
  amount: number;
  amountSigned: number;
  operationType: string;
  account: string;
  counterparty: string;
  article: string;
  oddsSection: string;
  direction: string;
}

interface DrillItem {
  date: string;
  description: string;
  counterparty: string;
  account: string;
  direction: string;
  amount: number;
  operationType: string;
  section: string;
}

interface ReportRow {
  id: string;
  label: string;
  level: number;
  type: string;
  values: Record<string, number>;
  total: number;
  drillKeys: Record<string, string>;
}

export const MoneyPage = () => {
  const { sheets } = useDataContext();
  const sheetState = sheets['Деньги'];

  const moneyRows = useMemo(() => {
    if (!sheetState.data) return [] as MoneyRow[];

    const getField = (row: Record<string, unknown>, variants: string[]) => {
      for (const variant of variants) {
        if (row[variant] != null && row[variant] !== '') return row[variant];
      }
      return null;
    };

    return sheetState.data.rows
      .map((row) => {
        const dateValue = getField(row, ['Дата', 'date', 'Date']);
        const date = parseDateValue(dateValue);
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
          description: normalizeText(getField(row, ['Описание'])),
          amount,
          amountSigned,
          operationType,
          account: normalizeText(getField(row, ['Счет', 'Счёт'])),
          counterparty: normalizeText(getField(row, ['Контрагент', 'Контрагенты'])),
          article: normalizeText(getField(row, ['Статья'])),
          oddsSection: normalizeText(getField(row, ['Раздел ОДДС'])),
          direction: normalizeText(getField(row, ['Направление']))
        } as MoneyRow;
      })
      .filter(Boolean) as MoneyRow[];
  }, [sheetState.data]);

  const minDate = useMemo(() => {
    if (!moneyRows.length) return null;
    return moneyRows.reduce((min, row) => (row.date < min ? row.date : min), moneyRows[0].date);
  }, [moneyRows]);

  const maxDate = useMemo(() => {
    if (!moneyRows.length) return null;
    return moneyRows.reduce((max, row) => (row.date > max ? row.date : max), moneyRows[0].date);
  }, [moneyRows]);

  const [range, setRange] = useState({ start: '', end: '' });
  const [filters, setFilters] = useState({
    account: '',
    counterparty: '',
    article: '',
    direction: ''
  });
  const [counterpartyMode, setCounterpartyMode] = useState<'suppliers' | 'buyers'>('suppliers');
  const [drillKey, setDrillKey] = useState<string | null>(null);

  useEffect(() => {
    if (!minDate || !maxDate) return;
    if (!range.start && !range.end) {
      setRange({ start: toIsoDate(minDate), end: toIsoDate(maxDate) });
    }
  }, [minDate, maxDate, range.start, range.end]);

  const period = useMemo(() => {
    if (!range.start || !range.end) return null;
    const startDate = parseDateValue(range.start);
    const endDate = parseDateValue(range.end);
    if (!startDate || !endDate) return null;
    return clampDateRange(startDate, endDate);
  }, [range]);

  const rowsInPeriod = useMemo(() => {
    if (!period) return [] as MoneyRow[];
    return moneyRows.filter((row) => row.date >= period.start && row.date <= period.end);
  }, [moneyRows, period]);

  const filterOptions = useMemo(() => {
    return {
      accounts: uniqueSorted(rowsInPeriod.map((row) => row.account)),
      counterparties: uniqueSorted(rowsInPeriod.map((row) => row.counterparty)),
      articles: uniqueSorted(rowsInPeriod.map((row) => row.article)),
      directions: uniqueSorted(rowsInPeriod.map((row) => row.direction))
    };
  }, [rowsInPeriod]);

  useEffect(() => {
    setFilters((prev) => ({
      account: prev.account && !filterOptions.accounts.includes(prev.account) ? '' : prev.account,
      counterparty: prev.counterparty && !filterOptions.counterparties.includes(prev.counterparty) ? '' : prev.counterparty,
      article: prev.article && !filterOptions.articles.includes(prev.article) ? '' : prev.article,
      direction: prev.direction && !filterOptions.directions.includes(prev.direction) ? '' : prev.direction
    }));
  }, [filterOptions.accounts, filterOptions.articles, filterOptions.counterparties, filterOptions.directions]);

  const filteredRows = useMemo(() => {
    return rowsInPeriod.filter((row) => {
      if (filters.account && filters.account !== row.account) return false;
      if (filters.counterparty && filters.counterparty !== row.counterparty) return false;
      if (filters.article && filters.article !== row.article) return false;
      if (filters.direction && filters.direction !== row.direction) return false;
      return true;
    });
  }, [rowsInPeriod, filters]);

  const isMovement = (section: string) => normalizeKey(section).includes('перемещ');
  const isBalance = (op: string) => normalizeKey(op).includes('остаток');
  const isExpense = (op: string) => normalizeKey(op).includes('расход');
  const isIncome = (op: string) => normalizeKey(op).includes('приход');
  const isMainActivity = (section: string) => normalizeKey(section).includes('основн');
  const isInvesting = (section: string) => normalizeKey(section).includes('инвест');
  const isFinancing = (section: string) => normalizeKey(section).includes('финанс');
  const isDeposit = (account: string) => normalizeKey(account).includes('депозит');

  const rowsNoMovement = useMemo(() => filteredRows.filter((row) => !isMovement(row.oddsSection)), [filteredRows]);

  const periodDays = period ? daysBetween(period.start, period.end) : 0;

  const summary = useMemo(() => {
    let net = 0;
    let income = 0;
    let expense = 0;
    let operating = 0;
    let investing = 0;
    let financing = 0;

    rowsNoMovement.forEach((row) => {
      if (!isBalance(row.operationType)) {
        net += row.amountSigned;
      }

      if (isIncome(row.operationType)) {
        income += Math.abs(row.amountSigned);
      }
      if (isExpense(row.operationType)) {
        expense += Math.abs(row.amountSigned);
      }

      if (isMainActivity(row.oddsSection)) {
        operating += row.amountSigned;
      } else if (isInvesting(row.oddsSection)) {
        investing += row.amountSigned;
      } else if (isFinancing(row.oddsSection)) {
        financing += row.amountSigned;
      }
    });

    const avgDailyExpense = periodDays ? expense / periodDays : 0;
    const buffer = avgDailyExpense ? net / avgDailyExpense : null;

    const breakdownAbs = Math.abs(operating) + Math.abs(investing) + Math.abs(financing);

    return {
      net,
      income,
      expense,
      buffer,
      breakdown: [
        { key: 'operating', label: 'ОДДС: основная деятельность', value: operating },
        { key: 'investing', label: 'ОДДС: инвестиционная деятельность', value: investing },
        { key: 'financing', label: 'ОДДС: финансовая деятельность', value: financing }
      ].map((item) => ({
        ...item,
        share: breakdownAbs ? Math.abs(item.value) / breakdownAbs : 0
      }))
    };
  }, [rowsNoMovement, periodDays]);

  const months = useMemo(() => {
    if (!period) return [] as string[];
    return buildMonthSeries(period.start, period.end);
  }, [period]);

  const monthlyNet = useMemo(() => {
    const map: Record<string, number> = {};
    months.forEach((month) => (map[month] = 0));
    rowsNoMovement.forEach((row) => {
      if (isBalance(row.operationType)) return;
      if (!map.hasOwnProperty(row.monthKey)) map[row.monthKey] = 0;
      map[row.monthKey] += row.amountSigned;
    });
    return map;
  }, [rowsNoMovement, months]);

  const balanceSeries = useMemo(() => {
    const balanceByMonth: Record<string, number> = {};
    const incomeByMonth: Record<string, number> = {};
    const expenseByMonth: Record<string, number> = {};

    months.forEach((month) => {
      balanceByMonth[month] = 0;
      incomeByMonth[month] = 0;
      expenseByMonth[month] = 0;
    });

    rowsNoMovement.forEach((row) => {
      if (!balanceByMonth.hasOwnProperty(row.monthKey)) return;
      if (isBalance(row.operationType)) {
        balanceByMonth[row.monthKey] += row.amountSigned;
      } else if (isIncome(row.operationType)) {
        incomeByMonth[row.monthKey] += Math.abs(row.amountSigned);
      } else if (isExpense(row.operationType)) {
        expenseByMonth[row.monthKey] += Math.abs(row.amountSigned);
      }
    });

    const openingByMonth: Record<string, number> = {};
    let prevOpening = null as number | null;
    let prevIncome = 0;
    let prevExpense = 0;

    months.forEach((month, idx) => {
      if (idx === 0) {
        openingByMonth[month] = balanceByMonth[month] || 0;
        prevOpening = openingByMonth[month];
        prevIncome = incomeByMonth[month] || 0;
        prevExpense = expenseByMonth[month] || 0;
        return;
      }
      openingByMonth[month] = (prevOpening ?? 0) + prevIncome - prevExpense;
      prevOpening = openingByMonth[month];
      prevIncome = incomeByMonth[month] || 0;
      prevExpense = expenseByMonth[month] || 0;
    });

    const mainExpenseByMonth: Record<string, number> = {};
    months.forEach((month) => (mainExpenseByMonth[month] = 0));
    rowsNoMovement.forEach((row) => {
      if (!mainExpenseByMonth.hasOwnProperty(row.monthKey)) return;
      if (isExpense(row.operationType) && isMainActivity(row.oddsSection)) {
        mainExpenseByMonth[row.monthKey] += Math.abs(row.amountSigned);
      }
    });

    const avgMainExpense = months.length
      ? months.reduce((acc, month) => acc + (mainExpenseByMonth[month] || 0), 0) / months.length
      : 0;

    return { openingByMonth, avgMainExpense };
  }, [rowsNoMovement, months]);

  const counterpartyData = useMemo(() => {
    const map: Record<string, number> = {};
    let total = 0;
    rowsNoMovement.forEach((row) => {
      if (isDeposit(row.account)) return;
      const isNeedExpense = counterpartyMode === 'suppliers';
      if (isNeedExpense && !isExpense(row.operationType)) return;
      if (!isNeedExpense && !isIncome(row.operationType)) return;
      const amount = Math.abs(row.amountSigned);
      if (!amount) return;
      const key = row.counterparty || 'Без контрагента';
      map[key] = (map[key] || 0) + amount;
      total += amount;
    });
    const items = Object.keys(map)
      .map((key) => ({ label: key, value: map[key] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
    return {
      labels: items.map((item) => item.label),
      values: items.map((item) => item.value),
      shares: items.map((item) => (total ? item.value / total : 0)),
      threshold: 0.3
    };
  }, [rowsNoMovement, counterpartyMode]);

  const directionData = useMemo(() => {
    const map: Record<string, number> = {};
    rowsNoMovement.forEach((row) => {
      if (isBalance(row.operationType)) return;
      const key = row.direction || 'Без направления';
      map[key] = (map[key] || 0) + row.amountSigned;
    });
    const items = Object.keys(map)
      .map((key) => ({ label: key, value: map[key] }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    return {
      labels: items.map((item) => item.label),
      values: items.map((item) => item.value)
    };
  }, [rowsNoMovement]);

  const expenseStructure = useMemo(() => {
    const map: Record<string, number> = {};
    rowsNoMovement.forEach((row) => {
      if (!isExpense(row.operationType)) return;
      const key = row.article || 'Без статьи';
      map[key] = (map[key] || 0) + Math.abs(row.amountSigned);
    });
    const items = Object.keys(map)
      .map((key) => ({ label: key, value: map[key] }))
      .sort((a, b) => b.value - a.value);
    return items;
  }, [rowsNoMovement]);

  const reportTable = useMemo(() => {
    const groupMap: Record<string, any> = {};
    const drillMap: Record<string, DrillItem[]> = {};

    const openingRow: ReportRow = {
      id: 'opening',
      label: 'Остаток на начало месяца',
      level: 0,
      type: 'balance',
      values: { ...balanceSeries.openingByMonth },
      total: Object.values(balanceSeries.openingByMonth).reduce((acc, val) => acc + val, 0),
      drillKeys: {}
    };

    rowsNoMovement.forEach((row) => {
      if (isBalance(row.operationType)) return;
      const section = row.oddsSection || 'Без раздела';
      const operation = row.operationType || 'Без вида операции';
      const article = row.article || 'Без статьи';
      const month = row.monthKey;

      if (!groupMap[section]) {
        groupMap[section] = { label: section, values: {}, operations: {} };
      }
      if (!groupMap[section].operations[operation]) {
        groupMap[section].operations[operation] = { label: operation, values: {}, articles: {} };
      }
      if (!groupMap[section].operations[operation].articles[article]) {
        groupMap[section].operations[operation].articles[article] = { label: article, values: {} };
      }

      groupMap[section].values[month] = (groupMap[section].values[month] || 0) + row.amountSigned;
      groupMap[section].operations[operation].values[month] =
        (groupMap[section].operations[operation].values[month] || 0) + row.amountSigned;
      groupMap[section].operations[operation].articles[article].values[month] =
        (groupMap[section].operations[operation].articles[article].values[month] || 0) + row.amountSigned;

      const drillKey = `${section}||${operation}||${article}||${month}`;
      if (!drillMap[drillKey]) drillMap[drillKey] = [];
      drillMap[drillKey].push({
        date: row.dateIso,
        description: row.description,
        counterparty: row.counterparty,
        account: row.account,
        direction: row.direction,
        amount: row.amountSigned,
        operationType: row.operationType,
        section: row.oddsSection
      });
    });

    const rows: ReportRow[] = [openingRow];

    const sectionKeys = Object.keys(groupMap).sort((a, b) => {
      const aKey = normalizeKey(a);
      const bKey = normalizeKey(b);
      if (aKey.includes('остаток')) return -1;
      if (bKey.includes('остаток')) return 1;
      return a.localeCompare(b, 'ru');
    });

    const buildRow = (
      id: string,
      label: string,
      level: number,
      type: string,
      values: Record<string, number>,
      drillPrefix?: string
    ): ReportRow => {
      const rowValues: Record<string, number> = {};
      const drillKeys: Record<string, string> = {};
      let total = 0;
      months.forEach((month) => {
        const value = values[month] || 0;
        rowValues[month] = value;
        total += value;
        if (drillPrefix && value !== 0) {
          drillKeys[month] = `${drillPrefix}||${month}`;
        }
      });
      return { id, label, level, type, values: rowValues, total, drillKeys };
    };

    sectionKeys.forEach((sectionKey) => {
      const section = groupMap[sectionKey];
      rows.push(buildRow(`section-${sectionKey}`, section.label, 0, 'section', section.values));

      Object.keys(section.operations).sort((a, b) => a.localeCompare(b, 'ru')).forEach((opKey) => {
        const op = section.operations[opKey];
        rows.push(buildRow(`op-${sectionKey}-${opKey}`, op.label, 1, 'operation', op.values));

        Object.keys(op.articles).sort((a, b) => a.localeCompare(b, 'ru')).forEach((articleKey) => {
          const article = op.articles[articleKey];
          const prefix = `${sectionKey}||${opKey}||${articleKey}`;
          rows.push(buildRow(`article-${prefix}`, article.label, 2, 'article', article.values, prefix));
        });
      });
    });

    return { rows, drillMap };
  }, [rowsNoMovement, months, balanceSeries]);

  const drillItems = drillKey ? reportTable.drillMap[drillKey] || [] : [];

  const charts = useMemo(() => {
    const axisStyle = {
      axisLine: { lineStyle: { color: '#37517a' } },
      axisLabel: { color: '#9fb3d9' },
      splitLine: { lineStyle: { color: 'rgba(55, 81, 122, 0.3)' } }
    };

    const counterpartyOption: EChartsOption = {
      grid: { left: 24, right: 20, top: 10, bottom: 34 },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => `${params.name}<br/>${formatCompactMoney(params.value || 0, 0)}`
      },
      xAxis: {
        type: 'value',
        ...axisStyle,
        axisLabel: {
          color: '#9fb3d9',
          formatter: (value: number) => formatCompactMoney(value, 0),
          fontSize: 10,
          margin: 8
        }
      },
      yAxis: {
        type: 'category',
        data: counterpartyData.labels,
        ...axisStyle,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
        inverse: true
      },
      series: [
        {
          type: 'bar',
          data: counterpartyData.values.map((value, idx) => ({
            value,
            itemStyle: {
              color: counterpartyData.shares[idx] > counterpartyData.threshold ? '#ff8f8f' : '#00d9ff'
            }
          })),
          barWidth: 14
        }
      ]
    };

    const directionOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 64 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const item = params[0];
          return `${item.name}<br/>${formatCompactMoney(item.value, 0)}`;
        }
      },
      xAxis: {
        type: 'category',
        data: directionData.labels,
        ...axisStyle,
        axisLabel: { color: '#9fb3d9', interval: 0, rotate: 35, margin: 12, fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        ...axisStyle,
        axisLabel: {
          color: '#9fb3d9',
          formatter: (value: number) => formatCompactMoney(value, 0)
        }
      },
      series: [
        {
          type: 'bar',
          data: directionData.values.map((value) => ({
            value,
            itemStyle: { color: value >= 0 ? '#2fe3a0' : '#ff7b7b' }
          })),
          barWidth: 18
        }
      ]
    };

    const monthlyOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 64 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const item = params[0];
          return `${item.axisValue}<br/>${formatCompactMoney(item.value, 0)}`;
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
        axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatCompactMoney(value, 0) }
      },
      series: [
        {
          type: 'line',
          data: months.map((month) => monthlyNet[month] || 0),
          smooth: true,
          lineStyle: { color: '#00d9ff', width: 2 },
          areaStyle: { color: 'rgba(0, 217, 255, 0.18)' }
        }
      ]
    };

    const balanceOption: EChartsOption = {
      grid: { left: 50, right: 20, top: 20, bottom: 64 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const opening = params.find((p: any) => p.seriesName === 'Остаток');
          const avg = params.find((p: any) => p.seriesName === 'Среднемес. расход');
          return `${params[0].axisValue}<br/>Остаток: ${formatCompactMoney(opening?.value || 0, 0)}<br/>Среднемес. расход: ${formatCompactMoney(avg?.value || 0, 0)}`;
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
        axisLabel: { color: '#9fb3d9', formatter: (value: number) => formatCompactMoney(value, 0) }
      },
      series: [
        {
          type: 'bar',
          data: months.map((month) => balanceSeries.openingByMonth[month] || 0),
          itemStyle: { color: '#2f8cff' },
          barWidth: 18,
          name: 'Остаток'
        },
        {
          type: 'line',
          data: months.map(() => balanceSeries.avgMainExpense),
          smooth: true,
          lineStyle: { color: '#ffb347', width: 2 },
          name: 'Среднемес. расход'
        }
      ]
    };

    const expenseOption: EChartsOption = {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => `${params.name}<br/>${formatCompactMoney(params.value, 0)}`
      },
      series: [
        {
          type: 'pie',
          radius: ['35%', '65%'],
          data: expenseStructure.map((item) => ({ name: item.label, value: item.value })),
          label: { color: '#d7e4ff' }
        }
      ]
    };

    return { counterpartyOption, directionOption, monthlyOption, balanceOption, expenseOption };
  }, [counterpartyData, directionData, months, monthlyNet, balanceSeries, expenseStructure]);

  if (sheetState.status === 'loading' || sheetState.status === 'idle') {
    return <LoadingState label="Загрузка листа Деньги…" />;
  }

  if (sheetState.status === 'error') {
    return <ErrorState message={sheetState.error || 'Ошибка загрузки листа Деньги.'} />;
  }

  if (!period) {
    return <ErrorState message="Не удалось определить период дат." />;
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <div className="grid" style={{ gap: 12 }}>
          <DateRange start={range.start} end={range.end} onChange={setRange} />
          <div className="grid money-filters">
            <Select
              label="Счет"
              value={filters.account}
              options={filterOptions.accounts}
              allLabel="Все счета"
              onChange={(value) => setFilters((prev) => ({ ...prev, account: value }))}
            />
            <Select
              label="Контрагент"
              value={filters.counterparty}
              options={filterOptions.counterparties}
              allLabel="Все контрагенты"
              onChange={(value) => setFilters((prev) => ({ ...prev, counterparty: value }))}
            />
            <Select
              label="Статья"
              value={filters.article}
              options={filterOptions.articles}
              allLabel="Все статьи"
              onChange={(value) => setFilters((prev) => ({ ...prev, article: value }))}
            />
            <Select
              label="Направление"
              value={filters.direction}
              options={filterOptions.directions}
              allLabel="Все направления"
              onChange={(value) => setFilters((prev) => ({ ...prev, direction: value }))}
            />
          </div>
        </div>
      </div>

      <div className="grid grid--auto">
        <div className="card">
          <p className="card__title">Чистый денежный поток</p>
          <p className="card__value" style={{ color: summary.net >= 0 ? '#2fe3a0' : '#ff7b7b' }}>
            {formatCompactMoney(summary.net)}
          </p>
          <p className="card__hint">за период {range.start} — {range.end}</p>
        </div>
        <div className="card">
          <p className="card__title">Cash Buffer</p>
          <p className="card__value">{summary.buffer == null ? '—' : formatNumber(summary.buffer, 1)} дней</p>
          <p className="card__hint">Среднедневной расход по основной деятельности</p>
        </div>
        {summary.breakdown.map((item) => (
          <div className="card" key={item.key}>
            <p className="card__title">{item.label}</p>
            <p className="card__value">{formatCompactMoney(item.value)}</p>
            <p className="card__hint">Доля {formatPercent(item.share)}</p>
          </div>
        ))}
      </div>

      <div className="grid money-panels">
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 className="section-title">Контрагенты</h3>
            <div className="toggle-group">
              <button
                type="button"
                className="btn toggle-btn"
                onClick={() => setCounterpartyMode('suppliers')}
                style={{ borderColor: counterpartyMode === 'suppliers' ? 'var(--accent)' : undefined }}
              >
                Поставщики
              </button>
              <button
                type="button"
                className="btn toggle-btn"
                onClick={() => setCounterpartyMode('buyers')}
                style={{ borderColor: counterpartyMode === 'buyers' ? 'var(--accent)' : undefined }}
              >
                Покупатели
              </button>
            </div>
          </div>
          <Chart option={charts.counterpartyOption} height={320} />
        </div>
        <div className="panel">
          <h3 className="section-title">Чистый денежный поток по направлениям</h3>
          <Chart option={charts.directionOption} height={320} />
        </div>
        <div className="panel">
          <h3 className="section-title">Чистый денежный поток по месяцам</h3>
          <Chart option={charts.monthlyOption} height={300} />
        </div>
        <div className="panel">
          <h3 className="section-title">Динамика остатков на счетах</h3>
          <Chart option={charts.balanceOption} height={300} />
        </div>
        <div className="panel">
          <h3 className="section-title">Структура расходов по статьям</h3>
          <Chart option={charts.expenseOption} height={300} />
        </div>
      </div>

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="section-title">Отчет по статьям</h3>
          <span className="badge">Клик по ячейке → провал в операции</span>
        </div>
        <div className="table-scroll" style={{ maxHeight: 520 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Раздел / Вид / Статья</th>
                {months.map((month) => (
                  <th key={month}>{formatMonthLabel(month)}</th>
                ))}
                <th>Итого</th>
              </tr>
            </thead>
            <tbody>
              {reportTable.rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ paddingLeft: `${row.level * 18}px`, fontWeight: row.level === 0 ? 700 : 400 }}>
                    {row.label}
                  </td>
                  {months.map((month) => {
                    const value = row.values[month] || 0;
                    const drill = row.drillKeys && row.drillKeys[month];
                    return (
                      <td
                        key={month}
                        style={{
                          cursor: drill ? 'pointer' : 'default',
                          color: value < 0 ? '#ff7b7b' : '#d7e4ff'
                        }}
                        onClick={() => drill && setDrillKey(drill)}
                      >
                        {value ? formatCompactMoney(value) : '—'}
                      </td>
                    );
                  })}
                  <td style={{ fontWeight: 700 }}>{row.total ? formatCompactMoney(row.total) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        title="Операции"
        open={!!drillKey}
        onClose={() => setDrillKey(null)}
      >
        <table className="table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Описание</th>
              <th>Контрагент</th>
              <th>Счет</th>
              <th>Направление</th>
              <th>Сумма</th>
            </tr>
          </thead>
          <tbody>
            {drillItems.map((item, idx) => (
              <tr key={`${item.date}-${idx}`}>
                <td>{item.date}</td>
                <td>{item.description}</td>
                <td>{item.counterparty}</td>
                <td>{item.account}</td>
                <td>{item.direction}</td>
                <td style={{ color: item.amount < 0 ? '#ff7b7b' : '#2fe3a0' }}>{formatCompactMoney(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    </div>
  );
};
