import { z } from 'zod';

export const CreateTenantSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[a-z0-9-]+$/,
      'slug must be lowercase letters, numbers, and hyphens'
    ),
  admin_email: z.string().email(),
  admin_password: z.string().min(8),
  admin_name: z.string().min(1).max(200),
});

export type CreateTenant = z.infer<typeof CreateTenantSchema>;
