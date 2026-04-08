export type SheetName = 'Деньги' | 'Прибыль' | 'Капитал';

export interface SheetData {
  headers: string[];
  rows: Record<string, unknown>[];
}

const SHEET_ID = '1jvj62kF3Bk4p2b0K1bS_tWds-52YdHpJ6M3Z5Bp-rfo';
const BASE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;

function parseGviz(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('Не удалось прочитать ответ Google Sheets.');
  }
  const json = text.slice(start, end + 1);
  return JSON.parse(json);
}

function parseCell(cell: { v?: unknown; f?: string } | null) {
  if (!cell || cell.v == null) return null;
  return cell.v;
}

export async function fetchSheet(sheet: SheetName): Promise<SheetData> {
  const url = `${BASE_URL}?sheet=${encodeURIComponent(sheet)}&tqx=out:json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Ошибка загрузки листа ${sheet}`);
  }
  const text = await response.text();
  const parsed = parseGviz(text);

  const headers = parsed.table.cols.map((col: { label: string }) => col.label || '').map((h: string) => h.trim());
  const rows = (parsed.table.rows || []).map((row: { c: Array<{ v?: unknown; f?: string } | null> }) => {
    const record: Record<string, unknown> = {};
    row.c.forEach((cell, idx) => {
      record[headers[idx] || `col_${idx}`] = parseCell(cell);
    });
    return record;
  });

  return { headers, rows };
}
