import { z } from 'zod';

export const ProductionStatusSchema = z.enum([
  'draft',
  'in_progress',
  'completed',
  'cancelled',
]);

export const CreateProductionOrderSchema = z.object({
  item_id: z.string().uuid(),
  quantity: z.number().positive(),
  notes: z.string().max(2000).optional(),
});

export const ProductionOrderSchema = CreateProductionOrderSchema.extend({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  status: ProductionStatusSchema,
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const CanProduceRequestSchema = z.object({
  item_id: z.string().uuid(),
  quantity: z.number().positive(),
});

export const CanProduceQuerySchema = z.object({
  item_id: z.string().uuid(),
  quantity: z.coerce.number().positive(),
});

export const CanProduceShortfallSchema = z.object({
  item_id: z.string().uuid(),
  required: z.number(),
  available: z.number(),
  shortfall: z.number(),
});

// Body of a 409 from POST /production/:id/complete when stock ran out
// (including when a concurrent completion used it up first): every short
// component at once, same shape as can-produce's rows.
export const InsufficientStockErrorSchema = z.object({
  error: z.string(),
  code: z.literal('insufficient_stock'),
  shortfalls: z.array(CanProduceShortfallSchema),
});

export type CreateProductionOrder = z.infer<typeof CreateProductionOrderSchema>;
export type ProductionOrder = z.infer<typeof ProductionOrderSchema>;
export type CanProduceRequest = z.infer<typeof CanProduceRequestSchema>;
export type CanProduceQuery = z.infer<typeof CanProduceQuerySchema>;
export type CanProduceShortfall = z.infer<typeof CanProduceShortfallSchema>;
export type InsufficientStockError = z.infer<
  typeof InsufficientStockErrorSchema
>;
