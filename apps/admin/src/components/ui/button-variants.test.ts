import { describe, expect, it } from 'vitest';

import { buttonVariants } from './button-variants';

describe('buttonVariants', () => {
  it('keeps disabled button text readable without opacity fading', () => {
    const classes = buttonVariants({ variant: 'secondary' });

    expect(classes).toContain('disabled:bg-muted');
    expect(classes).toContain('disabled:text-muted-foreground');
    expect(classes).toContain('disabled:opacity-100');
    expect(classes).not.toContain('disabled:opacity-50');
  });
});
