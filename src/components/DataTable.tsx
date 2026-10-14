import { ArrowDown, ArrowUp, Download } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { downloadText, toCsv } from '../lib/csv';
import { Button, EmptyState, cx } from './ui';

export type Column<T> = {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  value?: (row: T) => string | number | null; // for sorting and CSV
  align?: 'left' | 'right';
  className?: string;
};

// Every report table: sortable, with rows that fade in on first view and a
// CSV export of exactly what is shown.
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  csvName,
  onRowClick,
  empty = 'Nothing here yet.',
  initialSort,
  dense,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  csvName?: string;
  onRowClick?: (row: T) => void;
  empty?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  dense?: boolean;
}) {
  const [sort, setSort] = useState(initialSort);
  const valueOf = (c: Column<T>, r: T) => (c.value ? c.value(r) : ((r as Record<string, unknown>)[c.key] as string | number | null));

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const va = valueOf(col, a);
      const vb = valueOf(col, b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    // valueOf only reads the columns passed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, columns]);

  const exportCsv = () => {
    const data = sorted.map((r) => Object.fromEntries(columns.map((c) => [c.key, valueOf(c, r)])));
    downloadText(`${csvName}.csv`, toCsv(data, columns.map((c) => ({ key: c.key, label: c.label }))));
  };

  if (rows.length === 0) return <EmptyState title={empty} />;

  return (
    <div>
      {csvName && (
        <div className="mb-2 flex justify-end">
          <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={exportCsv}>
            CSV
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-rule">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead className="bg-field">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={cx('border-b border-rule px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-3', c.align === 'right' ? 'text-right' : 'text-left')}
                  >
                    <button
                      className={cx('inline-flex items-center gap-1 uppercase', active && 'text-ink')}
                      onClick={() => setSort({ key: c.key, dir: active && sort?.dir === 'desc' ? 'asc' : 'desc' })}
                    >
                      {c.label}
                      {active && (sort?.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <motion.tbody initial="initial" animate="animate" variants={{ animate: { transition: { staggerChildren: 0.018 } } }}>
            {sorted.map((r) => (
              <motion.tr
                key={rowKey(r)}
                variants={{ initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } }}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cx('border-b border-rule last:border-0 even:bg-field/40', onRowClick && 'cursor-pointer hover:bg-navy-soft/60')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cx('px-3 align-top', dense ? 'py-1.5' : 'py-2.5', c.align === 'right' && 'num text-right', c.className)}>
                    {c.render ? c.render(r) : String(valueOf(c, r) ?? '')}
                  </td>
                ))}
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
    </div>
  );
}
