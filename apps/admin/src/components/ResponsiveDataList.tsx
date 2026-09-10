import type { ReactNode } from 'react';

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
      <div className="desktop-data-table">
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={itemKey(item)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(item)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-card-list">
        {items.map((item) => (
          <div key={itemKey(item)}>{renderCard(item)}</div>
        ))}
      </div>
    </>
  );
}
