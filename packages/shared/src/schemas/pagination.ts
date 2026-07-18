import { z } from 'zod';

export const PaginationQuerySchema = z.object({
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
