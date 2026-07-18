import { z } from 'zod';

import { PermissionsSchema } from './auth';

export const CreateRoleSchema = z.object({
  name: z.string().min(1).max(100),
  permissions: PermissionsSchema,
});

export const UpdateRoleSchema = CreateRoleSchema.partial();

export const RoleSchema = CreateRoleSchema.extend({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});

export type CreateRole = z.infer<typeof CreateRoleSchema>;
export type UpdateRole = z.infer<typeof UpdateRoleSchema>;
export type Role = z.infer<typeof RoleSchema>;
