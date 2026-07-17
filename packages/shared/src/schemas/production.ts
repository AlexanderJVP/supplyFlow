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
  created_by: z.string().uuid(),
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

export type CreateProductionOrder = z.infer<typeof CreateProductionOrderSchema>;
export type ProductionOrder = z.infer<typeof ProductionOrderSchema>;
export type CanProduceRequest = z.infer<typeof CanProduceRequestSchema>;
export type CanProduceQuery = z.infer<typeof CanProduceQuerySchema>;
export type CanProduceShortfall = z.infer<typeof CanProduceShortfallSchema>;
