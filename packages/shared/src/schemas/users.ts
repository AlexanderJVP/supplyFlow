import { z } from 'zod';

export const InviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role_id: z.string().uuid(),
});

export const UpdateUserRoleSchema = z.object({
  role_id: z.string().uuid(),
});

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  role_id: z.string().uuid(),
  is_active: z.boolean(),
  created_at: z.string(),
});

export type InviteUser = z.infer<typeof InviteUserSchema>;
export type UpdateUserRole = z.infer<typeof UpdateUserRoleSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
