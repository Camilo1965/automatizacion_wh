import { describe, expect, it } from 'vitest';

import { resolveOfferedLocality } from '../src/modules/conversations/locality-suggestions.js';

describe('resolveOfferedLocality', () => {
  const latest = ['Bello', 'Belmira', 'Belén'];

  it.each([
    ['1', 'Bello'],
    ['2', 'Belmira'],
    ['3', 'Belén'],
    [' 2 ', 'Belmira'],
  ])(
    'resolves option %s from only the latest offered list',
    (input, expected) => {
      expect(resolveOfferedLocality(input, latest)).toBe(expected);
    },
  );

  it.each(['0', '4', '10', '1'])(
    'does not invent an unavailable option: %s',
    (input) => {
      expect(resolveOfferedLocality(input, [])).toBeNull();
    },
  );

  it('rejects option 3 when the latest list offered only two municipalities', () => {
    expect(resolveOfferedLocality('3', ['Bello', 'Belmira'])).toBeNull();
  });

  it('keeps a full municipality name for ordinary validation', () => {
    expect(resolveOfferedLocality('Medellín', latest)).toBe('Medellín');
    expect(resolveOfferedLocality('4', latest)).toBeNull();
  });
});
