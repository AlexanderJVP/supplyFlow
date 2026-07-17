import { z } from 'zod';

export const LedgerReasonSchema = z.enum([
  'received',
  'consumed',
  'adjusted',
  'produced',
  'shipped',
  'returned',
  'wasted',
]);

export const AdjustStockSchema = z.object({
  item_id: z.string().uuid(),
  quantity_delta: z
    .number()
    .refine((n) => n !== 0, 'quantity_delta must not be zero'),
  reason: LedgerReasonSchema,
  notes: z.string().max(2000).optional(),
});

export const StockLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  item_id: z.string().uuid(),
  quantity_delta: z.number(),
  reason: LedgerReasonSchema,
  reference_type: z.string().optional(),
  reference_id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  notes: z.string().max(2000).optional(),
  created_at: z.string(),
});

export const CurrentStockSchema = z.object({
  item_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  quantity: z.number(),
});

export type AdjustStock = z.infer<typeof AdjustStockSchema>;
export type StockLedgerEntry = z.infer<typeof StockLedgerEntrySchema>;
export type CurrentStock = z.infer<typeof CurrentStockSchema>;
