import { describe, expect, it } from 'vitest';
import type { Permissions } from '@manufacturing/shared';

import { hasPermission, visiblePages } from './permissions';

const paths = (permissions: Partial<Permissions> | undefined) =>
  visiblePages(permissions).map((page) => page.path);

describe('visiblePages', () => {
  it('shows only the pages whose view permission is set, in menu order', () => {
    expect(
      paths({
        inventory: { view: true, adjust: false, export: false },
        proposals: { view: true, create: false, review: false, approve: false },
        items: { view: false, create: false, edit: false, archive: false },
      })
    ).toEqual(['/inventory', '/proposals']);
  });

  it('shows Admin with either admin permission', () => {
    expect(
      paths({
        admin: {
          manage_users: false,
          manage_roles: true,
          manage_workflow: false,
        },
      })
    ).toEqual(['/admin']);
  });

  it('treats a missing permissions object or block as no pages, not a crash', () => {
    expect(paths(undefined)).toEqual([]);
    expect(paths({})).toEqual([]);
    expect(hasPermission({}, 'items.view')).toBe(false);
  });
});
