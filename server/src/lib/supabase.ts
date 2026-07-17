import { createClient } from '@supabase/supabase-js';

import type { AppEnv } from '../types';

// User-scoped client: used for all data queries. RLS applies.
export function createUserClient(jwt: string, bindings: AppEnv['Bindings']) {
  return createClient(bindings.SUPABASE_URL, bindings.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
}

// Admin client: ONLY for tenant provisioning and user management. Never use for data queries.
export function createAdminClient(bindings: AppEnv['Bindings']) {
  return createClient(bindings.SUPABASE_URL, bindings.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}
