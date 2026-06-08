import { z } from 'zod'

export const ItemTypeSchema = z.enum(['component', 'sub_assembly', 'finished_good'])

export const CreateItemSchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: ItemTypeSchema,
  unit_of_measure: z.string().min(1).max(20).default('each'),
  reorder_point: z.number().positive().optional(),
})

export type CreateItem = z.infer<typeof CreateItemSchema>
