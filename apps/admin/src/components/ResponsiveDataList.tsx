import type { ReactNode } from 'react';

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type DataColumn<T> = {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
};

export function ResponsiveDataList<T>({
  items,
  columns,
  itemKey,
  renderCard,
  caption,
}: {
  items: readonly T[];
  columns: readonly DataColumn<T>[];
  itemKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  caption: string;
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-card)] md:block">
        <Table>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column.key} className="px-4">
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={itemKey(item)}>
                {columns.map((column) => (
                  <TableCell key={column.key} className="px-4 whitespace-normal">
                    {column.render(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <div
            key={itemKey(item)}
            className="rounded-3xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
          >
            {renderCard(item)}
          </div>
        ))}
      </div>
    </>
  );
}
