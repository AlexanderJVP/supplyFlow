import type { Permissions } from '@manufacturing/shared';

import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../lib/permissions';

export function usePermissions(): Partial<Permissions> | undefined {
  const { session } = useAuth();
  return session?.user.app_metadata.permissions as
    | Partial<Permissions>
    | undefined;
}

export function usePermission(key: string): boolean {
  return hasPermission(usePermissions(), key);
}
