import type { Permissions } from '@manufacturing/shared';

import { useAuth } from '../context/AuthContext';

export function usePermission(key: string): boolean {
  const { session } = useAuth();
  const [domain, action] = key.split('.');
  const permissions = session?.user.app_metadata.permissions as
    | Permissions
    | undefined;
  return Boolean(
    (permissions as unknown as Record<string, Record<string, boolean>>)?.[
      domain
    ]?.[action]
  );
}
