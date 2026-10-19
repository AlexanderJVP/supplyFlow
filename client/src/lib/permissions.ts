import type { Permissions } from '@manufacturing/shared';

// app_metadata is stored JSON: the permissions object, or a domain block in
// it, can be missing -- that reads as "not allowed", never a crash.
export function hasPermission(
  permissions: Partial<Permissions> | undefined,
  key: string
): boolean {
  const [domain, action] = key.split('.');
  const block = (
    permissions as
      | Record<string, Record<string, boolean> | undefined>
      | undefined
  )?.[domain];
  return block?.[action] === true;
}

// Menu order is also landing order: after login a user lands on the first
// page here they may see. A page is visible with any one of its permissions.
export const PAGES = [
  { path: '/items', label: 'Items', anyOf: ['items.view'] },
  { path: '/inventory', label: 'Inventory', anyOf: ['inventory.view'] },
  { path: '/production', label: 'Production', anyOf: ['production.view'] },
  { path: '/proposals', label: 'Proposals', anyOf: ['proposals.view'] },
  {
    path: '/admin',
    label: 'Admin',
    anyOf: ['admin.manage_users', 'admin.manage_roles'],
  },
];

export function visiblePages(permissions: Partial<Permissions> | undefined) {
  return PAGES.filter((page) =>
    page.anyOf.some((key) => hasPermission(permissions, key))
  );
}
