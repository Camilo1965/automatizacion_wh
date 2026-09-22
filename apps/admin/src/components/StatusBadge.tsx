import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const toneClass: Record<
  'neutral' | 'success' | 'warning' | 'danger' | 'info',
  string
> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  success: 'border-border bg-secondary text-foreground',
  warning: 'border-border bg-secondary text-secondary-foreground',
  danger: 'border-destructive bg-destructive text-white',
  info: 'border-border bg-muted text-foreground',
};

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-[1.125rem] px-2.5 py-0.5 text-xs font-medium',
        toneClass[tone],
      )}
    >
      {children}
    </Badge>
  );
}
