/** A tiny trend line for list rows (spec §13): green if up over the period, red if down. */
export function Sparkline({ values, width = 64, height = 14 }: { values: readonly number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 1 - ((v - min) / span) * (height - 2)).toFixed(1)}`)
    .join(' ');
  return (
    <svg className="sparkline" width={width} height={height} aria-hidden="true">
      <polyline points={points} fill="none" stroke={values.at(-1)! >= values[0] ? '#008000' : '#c00000'} strokeWidth="1" />
    </svg>
  );
}
