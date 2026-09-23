import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../../utils/cn.js';
import { cellToString } from '../../utils/format.js';
import { EmptyState } from './States.jsx';

/*
 * DataGrid — renders query results in a ruled comic table. Column sort is
 * client-side; the row cap is enforced by the server.
 *
 * `highlight` is a Set of upper-cased cell values to emphasise (evidence).
 */
export function DataGrid({ columns = [], rows = [], className, maxHeight = 'max-h-[52vh]', highlight, emptyTitle = 'No rows returned', emptyBody = 'The query ran but matched nothing.', dense = false }) {
  const [sort, setSort] = useState(null); // { index, dir }
  // a new result arrives in server order: forget the previous result's sort
  useEffect(() => {
    setSort(null);
  }, [columns, rows]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { index, dir } = sort;
    const copy = [...rows];
    copy.sort((a, b) => {
      const x = a[index];
      const y = b[index];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === 'number' && typeof y === 'number') return dir === 'asc' ? x - y : y - x;
      return dir === 'asc' ? String(x).localeCompare(String(y)) : String(y).localeCompare(String(x));
    });
    return copy;
  }, [rows, sort]);

  if (!columns.length) return null;
  if (!rows.length) {
    // the same frame as the table, so the caller's tray colour and border still apply
    return (
      <div className={cn('border-3 border-ink bg-white', className)}>
        <EmptyState title={emptyTitle} body={emptyBody} compact />
      </div>
    );
  }

  const toggle = (i) => {
    setSort((s) => {
      if (!s || s.index !== i) return { index: i, dir: 'asc' };
      if (s.dir === 'asc') return { index: i, dir: 'desc' };
      return null;
    });
  };

  return (
    <div className={cn('overflow-auto border-3 border-ink bg-white', maxHeight, className)}>
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-10 text-right text-ink-soft">#</th>
            {columns.map((c, i) => {
              const active = sort?.index === i;
              const SortIcon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <th key={`${c}-${i}`} scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggle(i)} className={cn('inline-flex items-center gap-1 hover:underline', active && 'text-blue-deep')}>
                    {c}
                    <SortIcon className="h-3 w-3 opacity-70" strokeWidth={2.5} aria-hidden />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, r) => (
            <tr key={r}>
              <td className="text-right text-ink-soft">{r + 1}</td>
              {row.map((cell, c) => {
                const str = cellToString(cell);
                const isNull = cell === null || cell === undefined;
                const hit = highlight?.has(String(cell).toUpperCase());
                return (
                  <td key={c} className={cn(dense && 'py-1', isNull && 'italic text-ink-soft', typeof cell === 'number' && 'text-right tabular', hit && 'bg-yellow font-semibold')} title={str.length > 60 ? str : undefined}>
                    {str.length > 90 ? `${str.slice(0, 90)}…` : str}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
