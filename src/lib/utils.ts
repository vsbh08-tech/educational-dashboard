export function normalizeText(value: unknown) {
  return String(value ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeKey(value: unknown) {
  return normalizeText(value).toLowerCase();
}

export function parseNumber(value: unknown) {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  const text = normalizeText(value)
    .replace(/\s/g, '')
    .replace(/,/g, '.');
  const num = Number(text);
  return Number.isNaN(num) ? 0 : num;
}

export function parseDateValue(value: unknown): Date | null {
  if (value == null || value === '') {
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date fallback
    const excelEpoch = new Date(1899, 11, 30);
    const jsDate = new Date(excelEpoch.getTime() + value * 86400000);
    return new Date(jsDate.getFullYear(), jsDate.getMonth(), jsDate.getDate());
  }
  const text = normalizeText(value);
  if (!text) return null;

  const gvizMatch = text.match(/Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})/);
  if (gvizMatch) {
    return new Date(Number(gvizMatch[1]), Number(gvizMatch[2]), Number(gvizMatch[3]));
  }

  const dotMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (dotMatch) {
    const year = Number(dotMatch[3].length === 2 ? `20${dotMatch[3]}` : dotMatch[3]);
    return new Date(year, Number(dotMatch[2]) - 1, Number(dotMatch[1]));
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}

export function toIsoDate(date: Date | null) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toMonthKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits
  }).format(value);
}

export function formatCurrency(value: number, digits = 0) {
  return `${formatNumber(value, digits)} ₽`;
}

export function formatCompactMoney(value: number, digits = 0) {
  return formatCurrency(value, digits);
}

export function formatPercent(value: number, digits = 1) {
  return `${formatNumber(value * 100, digits)}%`;
}

export function uniqueSorted(values: string[]) {
  return values
    .map((v) => normalizeText(v))
    .filter(Boolean)
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
    .sort((a, b) => a.localeCompare(b, 'ru'));
}

export function buildMonthSeries(start: Date, end: Date) {
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor.getTime() <= last.getTime()) {
    months.push(toMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export function formatMonthLabel(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  const label = date.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' });
  return label.replace(' г.', '').replace(' г', '');
}

export function daysBetween(start: Date, end: Date) {
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(diff / 86400000) + 1);
}

export function clampDateRange(start: Date, end: Date) {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  return { start: s, end: e };
}

export function isSameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
