/**
 * MajorPaint's pictures (spec §4A): 32×32 pixels in Doors' 16-colour palette, one hexadecimal digit each, row by row.
 * Drawn as SVG runs of same-coloured pixels, for logo emblems and the tiled wallpaper.
 */
export const PICTURE_SIZE = 32;
export const PAINT_PALETTE = [
  '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
  '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
];
/** White is paper: transparent when a picture is a logo's emblem. */
export const PAPER = 15;
export const blankPicture = () => 'f'.repeat(PICTURE_SIZE * PICTURE_SIZE);

/** Horizontal runs of one colour: [x, y, length, colour index]. */
export function runs(pixels: string, skipPaper = false): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let y = 0; y < PICTURE_SIZE; y++) {
    let x = 0;
    while (x < PICTURE_SIZE) {
      const c = parseInt(pixels[y * PICTURE_SIZE + x] ?? 'f', 16);
      let end = x + 1;
      while (end < PICTURE_SIZE && parseInt(pixels[y * PICTURE_SIZE + end] ?? 'f', 16) === c) end++;
      if (!(skipPaper && c === PAPER)) out.push([x, y, end - x, c]);
      x = end;
    }
  }
  return out;
}

/** A picture as SVG elements on a 32×32 grid, placed at x, y and scaled to `size`. */
export function PixelArt({ pixels, x = 0, y = 0, size = PICTURE_SIZE, transparent }: { pixels: string; x?: number; y?: number; size?: number; transparent?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / PICTURE_SIZE})`} shapeRendering="crispEdges">
      {runs(pixels, transparent).map(([rx, ry, w, c]) => (
        <rect key={`${rx},${ry}`} x={rx} y={ry} width={w} height={1} fill={PAINT_PALETTE[c]} />
      ))}
    </g>
  );
}

/** A picture as an SVG data URL, for CSS backgrounds (the wallpaper tiles it at twice its size). */
export function pictureUrl(pixels: string): string {
  const rects = runs(pixels).map(([x, y, w, c]) => `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${PAINT_PALETTE[c]}"/>`).join('');
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32" shape-rendering="crispEdges">${rects}</svg>`)}")`;
}
