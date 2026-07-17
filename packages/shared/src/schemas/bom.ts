import { z } from 'zod';

export const CreateBomLineSchema = z.object({
  parent_item_id: z.string().uuid(),
  child_item_id: z.string().uuid(),
  quantity: z.number().positive(),
  notes: z.string().max(2000).optional(),
});

export const UpdateBomLineSchema = CreateBomLineSchema.partial();

export const BomLineSchema = CreateBomLineSchema.extend({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  created_at: z.string(),
});

export const BomTreeNodeSchema = z.object({
  child_item_id: z.string().uuid(),
  parent_item_id: z.string().uuid(),
  quantity: z.number().positive(),
  depth: z.number().int().positive(),
});

export type CreateBomLine = z.infer<typeof CreateBomLineSchema>;
export type UpdateBomLine = z.infer<typeof UpdateBomLineSchema>;
export type BomLine = z.infer<typeof BomLineSchema>;
export type BomTreeNode = z.infer<typeof BomTreeNodeSchema>;
