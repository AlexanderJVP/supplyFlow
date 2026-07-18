import { createClient } from '@supabase/supabase-js';
import type { Permissions } from '@manufacturing/shared';

import app from '../index';
import type { AppEnv } from '../types';

// These are the well-known, publicly documented demo keys the Supabase CLI
// issues for every fresh local project (see `supabase status`). They only
// work against a local stack bound to 127.0.0.1 and are safe to check in.
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export const integrationEnv: AppEnv['Bindings'] = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? LOCAL_ANON_KEY,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY,
  ALLOWED_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  ADMIN_SECRET: 'integration-test-admin-secret',
};

const adminClient = createClient(
  integrationEnv.SUPABASE_URL,
  integrationEnv.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const anonClient = createClient(
  integrationEnv.SUPABASE_URL,
  integrationEnv.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

let counter = 0;
export function uniqueSlug(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`.toLowerCase();
}

// Each call simulates a different client IP so tests that provision many
// tenants don't collide with the rate limit on POST /api/admin/tenants
// (3/IP/hour) -- see server/src/middleware/rateLimit.ts.
let ipCounter = 0;
function nextTestIp() {
  ipCounter += 1;
  return `10.0.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

export const NO_PERMISSIONS: Permissions = {
  items: { view: true, create: false, edit: false, archive: false },
  bom: { view: true, edit: false },
  inventory: { view: true, adjust: false, export: false },
  production: { view: true, create: false, complete: false, cancel: false },
  proposals: { create: false, review: false, approve: false },
  admin: { manage_users: false, manage_roles: false, manage_workflow: false },
};

export async function signIn(email: string, password: string) {
  const { data, error } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  }
  return data.session.access_token;
}

export type TestTenant = {
  tenant_id: string;
  role_id: string;
  admin_user_id: string;
  email: string;
  password: string;
  accessToken: string;
  slug: string;
};

export async function provisionTestTenant(prefix: string): Promise<TestTenant> {
  const slug = uniqueSlug(prefix);
  const email = `${slug}@example.test`;
  const password = 'Test1234!';

  const response = await app.fetch(
    new Request('http://localhost/api/admin/tenants', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': integrationEnv.ADMIN_SECRET,
        'CF-Connecting-IP': nextTestIp(),
      },
      body: JSON.stringify({
        name: `Test Co ${slug}`,
        slug,
        admin_email: email,
        admin_password: password,
        admin_name: 'Test Admin',
      }),
    }),
    integrationEnv
  );

  if (response.status !== 201) {
    throw new Error(
      `Failed to provision test tenant: ${
        response.status
      } ${await response.text()}`
    );
  }

  const body = (await response.json()) as {
    tenant_id: string;
    role_id: string;
    admin_user_id: string;
  };
  const accessToken = await signIn(email, password);

  return { ...body, email, password, accessToken, slug };
}

export async function cleanupTenant(tenantId: string, adminUserId: string) {
  await adminClient.from('tenants').delete().eq('id', tenantId);
  await adminClient.auth.admin.deleteUser(adminUserId);
}

// Reads via the service-role client for test assertions only -- there is no
// user-facing API for audit_logs, so this deliberately bypasses RLS.
export async function getAuditLogs(
  tenantId: string,
  tableName: string,
  recordId: string
) {
  const { data, error } = await adminClient
    .from('audit_logs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('table_name', tableName)
    .eq('record_id', recordId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to read audit_logs: ${error.message}`);
  return data as Array<{
    action: string;
    old_data: unknown;
    new_data: unknown;
    user_id: string | null;
  }>;
}

export async function createRestrictedUser(
  tenantId: string,
  permissions: Permissions
) {
  const slug = uniqueSlug('restricted');
  const email = `${slug}@example.test`;
  const password = 'Test1234!';

  const { data: role, error: roleError } = await adminClient
    .from('roles')
    .insert({ tenant_id: tenantId, name: `Restricted ${slug}`, permissions })
    .select()
    .single();
  if (roleError || !role) {
    throw new Error(`Failed to create restricted role: ${roleError?.message}`);
  }

  const { data: created, error: createUserError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createUserError || !created.user) {
    throw new Error(
      `Failed to create restricted user: ${createUserError?.message}`
    );
  }

  const { error: profileError } = await adminClient.from('profiles').insert({
    id: created.user.id,
    tenant_id: tenantId,
    name: 'Restricted User',
    role_id: role.id,
  });
  if (profileError) {
    throw new Error(
      `Failed to create restricted profile: ${profileError.message}`
    );
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    created.user.id,
    {
      app_metadata: { tenant_id: tenantId, role_id: role.id, permissions },
    }
  );
  if (updateError) {
    throw new Error(`Failed to set app_metadata: ${updateError.message}`);
  }

  const accessToken = await signIn(email, password);
  return { userId: created.user.id, accessToken, roleId: role.id as string };
}

// Like createRestrictedUser, but joins an already-existing role instead of
// creating a new one -- used to test that editing a role's permissions (or
// reassigning a user to a different role) actually takes effect for that
// user on their next sign-in.
export async function createUserForRole(
  tenantId: string,
  roleId: string,
  permissions: Permissions
) {
  const slug = uniqueSlug('role-member');
  const email = `${slug}@example.test`;
  const password = 'Test1234!';

  const { data: created, error: createUserError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createUserError || !created.user) {
    throw new Error(
      `Failed to create role-member user: ${createUserError?.message}`
    );
  }

  const { error: profileError } = await adminClient.from('profiles').insert({
    id: created.user.id,
    tenant_id: tenantId,
    name: 'Role Member',
    role_id: roleId,
  });
  if (profileError) {
    throw new Error(
      `Failed to create role-member profile: ${profileError.message}`
    );
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    created.user.id,
    { app_metadata: { tenant_id: tenantId, role_id: roleId, permissions } }
  );
  if (updateError) {
    throw new Error(`Failed to set app_metadata: ${updateError.message}`);
  }

  const accessToken = await signIn(email, password);
  return { userId: created.user.id, accessToken, email, password };
}

export async function createItem(
  accessToken: string,
  overrides: Partial<{
    sku: string;
    name: string;
    type: string;
    reorder_point: number;
  }> = {}
) {
  const response = await app.fetch(
    new Request('http://localhost/api/items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        sku: overrides.sku ?? uniqueSlug('SKU'),
        name: overrides.name ?? 'Test Item',
        type: overrides.type ?? 'component',
        ...(overrides.reorder_point !== undefined
          ? { reorder_point: overrides.reorder_point }
          : {}),
      }),
    }),
    integrationEnv
  );
  if (response.status !== 201) {
    throw new Error(
      `Failed to create test item: ${response.status} ${await response.text()}`
    );
  }
  return response.json() as Promise<{ id: string; sku: string; name: string }>;
}
