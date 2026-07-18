import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserClaims } from '@manufacturing/shared';

export type AppEnv = {
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    SUPABASE_SERVICE_KEY: string;
    ALLOWED_ORIGIN: string;
    ADMIN_ORIGIN: string;
    ADMIN_SECRET: string;
    // Optional -- @hono/sentry no-ops (via toucan-js) when this is unset, so
    // local dev works fine without a real Sentry project.
    SENTRY_DSN?: string;
  };
  Variables: {
    user: UserClaims;
    supabase: SupabaseClient;
  };
};
