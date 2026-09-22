import * as React from 'react';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

import { badgeVariants, type BadgeVariantProps } from './badge-variants';

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  BadgeVariantProps & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge };
