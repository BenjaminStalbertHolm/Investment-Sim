const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fixed = (digits: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const two = fixed(2);
const four = fixed(4);

/** "$1,234.56" */
export const money = (v: number) => dollars.format(v);
/** A sign for a formatted magnitude: none when it rounds to zero. */
const sign = (v: number, magnitude: string) => (/[1-9]/.test(magnitude) ? (v > 0 ? '+' : '−') : '') + magnitude;
/** "+$1,234.56" / "−$1,234.56" */
export const signedMoney = (v: number) => sign(v, dollars.format(Math.abs(v)));
/** A share price: cents, or four decimals under a dollar. */
export const price = (v: number) => (v < 1 ? four : two).format(v);
/** A price change "+1.23", to the precision of the price it changes (`of`). */
export const signed = (v: number, of = Math.abs(v)) => sign(v, (of < 1 ? four : two).format(Math.abs(v)));
/** "+1.23%" */
export const signedPct = (v: number) => `${sign(v, two.format(Math.abs(v) * 100))}%`;
/** "12.3%" */
export const pct = (v: number, digits = 1) => `${fixed(digits).format(v * 100)}%`;
/** "12,345" */
export const count = (v: number) => Math.round(v).toLocaleString('en-US');
/** "$1.23B" */
export function bigMoney(v: number): string {
  const [div, unit] = v >= 1e12 ? [1e12, 'T'] : v >= 1e9 ? [1e9, 'B'] : v >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
  return `$${two.format(v / div)}${unit}`;
}
/** Class for colouring gains and losses. */
export const tone = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
