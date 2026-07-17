import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const PermissionsSchema = z.object({
  items: z.object({
    view: z.boolean(),
    create: z.boolean(),
    edit: z.boolean(),
    archive: z.boolean(),
  }),
  bom: z.object({
    view: z.boolean(),
    edit: z.boolean(),
  }),
  inventory: z.object({
    view: z.boolean(),
    adjust: z.boolean(),
    export: z.boolean(),
  }),
  production: z.object({
    view: z.boolean(),
    create: z.boolean(),
    complete: z.boolean(),
    cancel: z.boolean(),
  }),
  proposals: z.object({
    create: z.boolean(),
    review: z.boolean(),
    approve: z.boolean(),
  }),
  admin: z.object({
    manage_users: z.boolean(),
    manage_roles: z.boolean(),
    manage_workflow: z.boolean(),
  }),
});

export const UserClaimsSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  roleId: z.string().uuid(),
  permissions: PermissionsSchema,
});

export type Login = z.infer<typeof LoginSchema>;
export type Permissions = z.infer<typeof PermissionsSchema>;
export type UserClaims = z.infer<typeof UserClaimsSchema>;
