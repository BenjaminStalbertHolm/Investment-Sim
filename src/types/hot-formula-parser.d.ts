declare module 'hot-formula-parser' {
  interface CellCoord {
    label: string;
    row: { index: number; label: string; isAbsolute: boolean };
    column: { index: number; label: string; isAbsolute: boolean };
  }
  export class Parser {
    parse(formula: string): { error: string | null; result: unknown };
    on(event: 'callCellValue', handler: (cell: CellCoord, done: (value: unknown) => void) => void): void;
    on(event: 'callRangeValue', handler: (start: CellCoord, end: CellCoord, done: (value: unknown[][]) => void) => void): void;
  }
}
