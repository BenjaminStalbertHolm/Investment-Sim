const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** `a` blended towards `b` by t (0–1). */
export function mix(a: string, b: string, t: number): string {
  const x = channels(a);
  const y = channels(b);
  return `#${x.map((c, i) => Math.round(c + (y[i] - c) * t).toString(16).padStart(2, '0')).join('')}`;
}

export const darken = (hex: string, t: number) => mix(hex, '#000000', t);
export const lighten = (hex: string, t: number) => mix(hex, '#ffffff', t);
