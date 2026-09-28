import { Parser } from 'hot-formula-parser';

/**
 * Exceed 98's arithmetic (spec §4A: SUM, AVERAGE, MIN, MAX, arithmetic and cell references — and the rest of Excel's
 * functions, which the parser brings along). Formulas are parsed by hot-formula-parser; this evaluates the sheet around
 * it: references are followed, each cell once, and a cell that refers back to itself is #REF!.
 */
export const COLUMNS = 26;
export const ROWS = 60;
export const cellLabel = (column: number, row: number) => `${String.fromCharCode(65 + column)}${row + 1}`;

export type Value = number | string | boolean | null;

/** A cell's typed input: a number, text, or (from "=") a formula's result or its error. */
export function evaluate(cells: Readonly<Record<string, string>>): Record<string, Value> {
  const out: Record<string, Value> = {};
  const busy = new Set<string>();
  const value = (key: string): Value => {
    if (key in out) return out[key];
    const raw = cells[key]?.trim() ?? '';
    if (!raw.startsWith('=')) return (out[key] = raw === '' ? null : raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw);
    if (busy.has(key)) return '#REF!';
    busy.add(key);
    // The parser is not re-entrant: each formula being evaluated gets its own.
    const parser = new Parser();
    parser.on('callCellValue', (cell, done) => done(value(cell.label) ?? 0));
    parser.on('callRangeValue', (start, end, done) => {
      const rows: Value[][] = [];
      for (let r = start.row.index; r <= end.row.index; r++) {
        const row: Value[] = [];
        for (let c = start.column.index; c <= end.column.index; c++) row.push(value(cellLabel(c, r)));
        rows.push(row);
      }
      done(rows);
    });
    const { error, result } = parser.parse(raw.slice(1));
    busy.delete(key);
    return (out[key] = error ?? (result as Value));
  };
  for (const key of Object.keys(cells)) value(key);
  return out;
}

/** What a cell shows: numbers to two decimals when they have fractions, errors as they are. */
export function display(v: Value): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-US', { useGrouping: false }) : v.toFixed(2);
  return String(v);
}

/** A sheet as CSV (RFC 4180 quoting), its computed values row by row, up to the last filled cell. */
export function toCsv(cells: Readonly<Record<string, string>>): string {
  const values = evaluate(cells);
  let rows = 0;
  let columns = 0;
  for (const key of Object.keys(cells)) {
    if (!cells[key]) continue;
    columns = Math.max(columns, key.charCodeAt(0) - 64);
    rows = Math.max(rows, Number(key.slice(1)));
  }
  const quote = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => quote(display(values[cellLabel(c, r)] ?? null))).join(',')).join('\r\n');
}

/** A table (header row first) as sheet cells. */
export function fromRows(rows: readonly (readonly (string | number)[])[]): Record<string, string> {
  const cells: Record<string, string> = {};
  rows.forEach((row, r) => row.slice(0, COLUMNS).forEach((v, c) => r < ROWS && v !== '' && (cells[cellLabel(c, r)] = String(v))));
  return cells;
}
