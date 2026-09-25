import { describe, expect, it } from 'vitest';

import { canonicalDepartment } from '../src/modules/conversations/department-selection.js';

describe('canonicalDepartment', () => {
  const catalog = ['Antioquia', 'Nariño', 'Valle del Cauca'];

  it.each([
    ['antioquia', 'Antioquia'],
    [' ANTIOQUIA ', 'Antioquia'],
    ['narino', 'Nariño'],
    ['VALLE  DEL CAUCA', 'Valle del Cauca'],
  ])('uses the actual catalog spelling for %s', (input, expected) => {
    expect(canonicalDepartment(input, catalog)).toBe(expected);
  });

  it('does not invent a spelling for an unknown department', () => {
    expect(canonicalDepartment('antioquía falsa', catalog)).toBeNull();
  });

  it('rejects multiple catalog names with the same normalized spelling', () => {
    expect(
      canonicalDepartment('antioquia', ['Antioquia', 'ANTIOQUIA']),
    ).toBeNull();
  });
});
