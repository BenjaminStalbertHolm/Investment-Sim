/**
 * Path of the first difference between two states, or undefined when they are identical. Typed arrays compare
 * bytewise (toEqual walks millions of elements one by one); undefined and missing properties count as the same.
 */
export function difference(a: unknown, b: unknown, path = 'state'): string | undefined {
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.constructor !== b.constructor || a.byteLength !== b.byteLength) {
      return `${path}: different arrays`;
    }
    const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return `${path}: byte ${i} differs`;
    return undefined;
  }
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return a === b || (Number.isNaN(a) && Number.isNaN(b)) ? undefined : `${path}: ${String(a)} ≠ ${String(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array vs object`;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) {
    const d = difference(x[key], y[key], `${path}.${key}`);
    if (d) return d;
  }
  return undefined;
}
