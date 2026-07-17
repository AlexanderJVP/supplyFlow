import { describe, expect, it } from 'vitest';

import { CreateItemSchema, ItemTypeSchema } from '@manufacturing/shared';

describe('CreateItemSchema', () => {
  it('applies the default unit of measure', () => {
    const result = CreateItemSchema.parse({
      sku: 'ABC-123',
      name: 'Bracket',
      type: 'component',
    });

    expect(result.unit_of_measure).toBe('each');
  });
});

describe('ItemTypeSchema', () => {
  it('accepts the supported item types', () => {
    expect(ItemTypeSchema.parse('component')).toBe('component');
    expect(ItemTypeSchema.parse('sub_assembly')).toBe('sub_assembly');
    expect(ItemTypeSchema.parse('finished_good')).toBe('finished_good');
  });
});
