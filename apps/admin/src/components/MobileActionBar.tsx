import type { ReactNode } from 'react';

export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[4.5rem] z-30 border-t border-border bg-card/95 p-3 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap gap-2">{children}</div>
    </div>
  );
}
