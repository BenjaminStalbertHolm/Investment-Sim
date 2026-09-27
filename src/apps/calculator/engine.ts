/**
 * The Calculator's keypad (spec §4A), as Doors' calculator works: immediate execution, one pending operation, a memory.
 * Pure: a key and the state give the next state.
 */
export interface CalcState {
  display: string;
  /** The number on the left of a pending operation. */
  acc?: number;
  op?: Binary;
  /** The next digit starts a new number. */
  fresh: boolean;
  memory: number;
  error?: boolean;
}

export type Binary = '+' | '−' | '×' | '÷' | 'xʸ';
export type Unary = '±' | '%' | '√' | '1/x' | 'x²' | 'sin' | 'cos' | 'tan' | 'ln' | 'log' | 'n!' | 'π' | 'e';
export type Key = string;

export const initial: CalcState = { display: '0', fresh: true, memory: 0 };

const BINARY = new Set<string>(['+', '−', '×', '÷', 'xʸ']);
const UNARY = new Set<string>(['±', '%', '√', '1/x', 'x²', 'sin', 'cos', 'tan', 'ln', 'log', 'n!', 'π', 'e']);

/** Up to 12 significant digits, as a 1998 LCD shows them. */
export function show(v: number): string {
  if (!Number.isFinite(v)) return 'Error';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e12 || abs < 1e-9) return v.toExponential(6).replace(/\.?0+e/, 'e');
  return String(Number(v.toPrecision(12)));
}

function apply(a: number, op: Binary, b: number): number {
  switch (op) {
    case '+':
      return a + b;
    case '−':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return a / b;
    case 'xʸ':
      return a ** b;
  }
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n) || n > 170) return NaN;
  let f = 1;
  for (let k = 2; k <= n; k++) f *= k;
  return f;
}

function unary(v: number, key: Unary, acc?: number): number {
  const rad = (v * Math.PI) / 180;
  switch (key) {
    case '±':
      return -v;
    case '%':
      return acc !== undefined ? (acc * v) / 100 : v / 100;
    case '√':
      return Math.sqrt(v);
    case '1/x':
      return 1 / v;
    case 'x²':
      return v * v;
    case 'sin':
      return Math.sin(rad);
    case 'cos':
      return Math.cos(rad);
    case 'tan':
      return Math.tan(rad);
    case 'ln':
      return Math.log(v);
    case 'log':
      return Math.log10(v);
    case 'n!':
      return factorial(v);
    case 'π':
      return Math.PI;
    case 'e':
      return Math.E;
  }
}

export function press(s: CalcState, key: Key): CalcState {
  if (key === 'C') return { ...initial, memory: s.memory };
  if (s.error && key !== 'CE') return s;
  const value = Number(s.display);
  const result = (v: number): CalcState => (Number.isFinite(v) ? { ...s, display: show(v), fresh: true, error: false } : { ...s, display: 'Error', fresh: true, error: true });
  if (/^[0-9]$/.test(key)) {
    if (s.fresh) return { ...s, display: key, fresh: false };
    return { ...s, display: s.display === '0' ? key : s.display.length < 16 ? s.display + key : s.display };
  }
  switch (key) {
    case '.':
      if (s.fresh) return { ...s, display: '0.', fresh: false };
      return s.display.includes('.') ? s : { ...s, display: `${s.display}.` };
    case 'CE':
      return { ...s, display: '0', fresh: true, error: false };
    case '⌫':
      return s.fresh ? s : { ...s, display: s.display.length > 1 ? s.display.slice(0, -1) : '0' };
    case '=': {
      if (s.op === undefined || s.acc === undefined) return { ...s, fresh: true };
      const r = result(apply(s.acc, s.op, value));
      return { ...r, acc: undefined, op: undefined };
    }
    case 'MC':
      return { ...s, memory: 0 };
    case 'MR':
      return { ...s, display: show(s.memory), fresh: true };
    case 'MS':
      return { ...s, memory: value, fresh: true };
    case 'M+':
      return { ...s, memory: s.memory + value, fresh: true };
  }
  if (BINARY.has(key)) {
    // A chain of operations evaluates as it goes: 2 + 3 × is 5 ×.
    const acc = s.op !== undefined && s.acc !== undefined && !s.fresh ? apply(s.acc, s.op, value) : value;
    if (!Number.isFinite(acc)) return { ...s, display: 'Error', fresh: true, error: true };
    return { ...s, acc, op: key as Binary, display: show(acc), fresh: true };
  }
  if (UNARY.has(key)) return result(unary(value, key as Unary, s.acc));
  return s;
}
