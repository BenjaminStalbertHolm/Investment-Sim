import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, type ReactNode } from 'react';

export interface Column<T> {
  header: string;
  cell(row: T): ReactNode;
  align?: 'right';
  width?: number;
  /** Extra class for the cell, e.g. 'up' / 'down'. */
  tone?(row: T): string;
}

const ROW_HEIGHT = 17;

/**
 * A 98.css table view that only renders the rows in sight (spec §20: virtualise every long list): spacer rows stand in
 * for the rest, so the table keeps its native layout and sticky header.
 */
export function VirtualTable<T>(props: {
  rows: readonly T[];
  columns: Column<T>[];
  rowKey(row: T): string | number;
  selected?: string | number;
  onSelect?(row: T): void;
  onOpen?(row: T): void;
  empty?: string;
  className?: string;
  /** Extra class for a row, e.g. 'unread'. */
  rowClass?(row: T): string | undefined;
  /** Sortable columns: the header clicked, and the current sort shown as an arrow. */
  onSort?(header: string): void;
  sort?: { header: string; ascending: boolean };
}) {
  const { rows, columns, rowKey, selected, onSelect, onOpen, empty, className, rowClass, onSort, sort } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const items = virtual.getVirtualItems();
  const top = items[0]?.start ?? 0;
  const bottom = virtual.getTotalSize() - (items.at(-1)?.end ?? 0);

  return (
    <div className={`sunken-panel table-view ${className ?? ''}`} ref={scroller}>
      <table className="interactive">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.header}
                className={`${c.align ?? ''}${onSort ? ' sortable' : ''}`}
                style={c.width ? { width: c.width } : undefined}
                onClick={onSort && (() => onSort(c.header))}
              >
                {c.header}
                {sort?.header === c.header && (sort.ascending ? ' ▲' : ' ▼')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {top > 0 && <tr style={{ height: top }} />}
          {items.map((item) => {
            const row = rows[item.index];
            const key = rowKey(row);
            return (
              <tr
                key={key}
                className={[key === selected ? 'highlighted' : '', rowClass?.(row) ?? ''].join(' ').trim() || undefined}
                onClick={() => onSelect?.(row)}
                onDoubleClick={() => onOpen?.(row)}
              >
                {columns.map((c) => (
                  <td key={c.header} className={`${c.align ?? ''} ${c.tone?.(row) ?? ''}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
          {bottom > 0 && <tr style={{ height: bottom }} />}
          {!rows.length && empty && (
            <tr>
              <td colSpan={columns.length} className="table-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
