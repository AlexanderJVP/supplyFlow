import { useMemo, useState, type FormEvent } from 'react';
import type { Permissions } from '@manufacturing/shared';

import PermissionsEditor from '../../components/PermissionsEditor';
import { usePermission } from '../../hooks/usePermission';
import { useCreateRole, useRoles, useUpdateRole } from '../../hooks/useRoles';
import {
  useInviteUser,
  useUsers,
  useUpdateUserRole,
} from '../../hooks/useUsers';

const EMPTY_PERMISSIONS: Permissions = {
  items: { view: false, create: false, edit: false, archive: false },
  bom: { view: false, edit: false },
  inventory: { view: false, adjust: false, export: false },
  production: { view: false, create: false, complete: false, cancel: false },
  proposals: { create: false, review: false, approve: false },
  admin: { manage_users: false, manage_roles: false, manage_workflow: false },
};

function UsersSection({
  canManageUsers,
  roleName,
}: {
  canManageUsers: boolean;
  roleName: (roleId: string) => string;
}) {
  const { data: users, isLoading, error } = useUsers();
  const { data: roles } = useRoles();
  const inviteUser = useInviteUser();
  const updateUserRole = useUpdateUserRole();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!email.trim() || !name.trim() || !roleId) {
      setFormError('Email, name, and role are all required.');
      return;
    }

    try {
      await inviteUser.mutateAsync({
        email: email.trim(),
        name: name.trim(),
        role_id: roleId,
      });
      setEmail('');
      setName('');
      setRoleId('');
    } catch {
      setFormError('Failed to invite user.');
    }
  }

  if (!canManageUsers) return null;

  return (
    <section style={{ marginBottom: 40 }}>
      <h2>Users</h2>

      {isLoading && <p>Loading…</p>}
      {error && <p style={{ color: 'red' }}>Failed to load users.</p>}

      {users && (
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'left' }}>Role</th>
              <th style={{ textAlign: 'left' }}>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{roleName(u.role_id)}</td>
                <td>{u.is_active ? 'yes' : 'no'}</td>
                <td>
                  <select
                    value={u.role_id}
                    onChange={(e) =>
                      updateUserRole.mutate({
                        id: u.id,
                        roleId: e.target.value,
                      })
                    }
                  >
                    {(roles ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ marginTop: 24 }}>Invite user</h3>
      <form onSubmit={handleInvite} style={{ maxWidth: 360 }}>
        <div style={{ marginBottom: 8 }}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ display: 'block', width: '100%' }}
            />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ display: 'block', width: '100%' }}
            />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Role
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              style={{ display: 'block', width: '100%' }}
            >
              <option value="">Select a role…</option>
              {(roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {formError && <p style={{ color: 'red' }}>{formError}</p>}

        <button type="submit" disabled={inviteUser.isPending}>
          {inviteUser.isPending ? 'Sending invite…' : 'Send invite'}
        </button>
      </form>
    </section>
  );
}

function RolesSection({ canManageRoles }: { canManageRoles: boolean }) {
  const { data: roles, isLoading, error } = useRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingPermissions, setEditingPermissions] =
    useState<Permissions>(EMPTY_PERMISSIONS);

  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePermissions, setNewRolePermissions] =
    useState<Permissions>(EMPTY_PERMISSIONS);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!newRoleName.trim()) {
      setFormError('Role name is required.');
      return;
    }

    try {
      await createRole.mutateAsync({
        name: newRoleName.trim(),
        permissions: newRolePermissions,
      });
      setNewRoleName('');
      setNewRolePermissions(EMPTY_PERMISSIONS);
    } catch {
      setFormError('Failed to create role.');
    }
  }

  async function handleSaveEdit(roleId: string) {
    await updateRole.mutateAsync({
      id: roleId,
      data: { permissions: editingPermissions },
    });
    setEditingRoleId(null);
  }

  if (!canManageRoles) return null;

  return (
    <section>
      <h2>Roles</h2>

      {isLoading && <p>Loading…</p>}
      {error && <p style={{ color: 'red' }}>Failed to load roles.</p>}

      {roles?.map((role) => (
        <div
          key={role.id}
          style={{ border: '1px solid #ccc', padding: 12, marginBottom: 12 }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <strong>{role.name}</strong>
            {editingRoleId === role.id ? (
              <div>
                <button
                  onClick={() => handleSaveEdit(role.id)}
                  disabled={updateRole.isPending}
                >
                  {updateRole.isPending ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingRoleId(null)}>Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setEditingRoleId(role.id);
                  setEditingPermissions(role.permissions);
                }}
              >
                Edit permissions
              </button>
            )}
          </div>

          {editingRoleId === role.id && (
            <div style={{ marginTop: 8 }}>
              <PermissionsEditor
                value={editingPermissions}
                onChange={setEditingPermissions}
              />
            </div>
          )}
        </div>
      ))}

      <h3 style={{ marginTop: 24 }}>New role</h3>
      <form onSubmit={handleCreate}>
        <div style={{ marginBottom: 8 }}>
          <label>
            Name
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              style={{ display: 'block' }}
            />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <PermissionsEditor
            value={newRolePermissions}
            onChange={setNewRolePermissions}
          />
        </div>

        {formError && <p style={{ color: 'red' }}>{formError}</p>}

        <button type="submit" disabled={createRole.isPending}>
          {createRole.isPending ? 'Creating…' : 'Create role'}
        </button>
      </form>
    </section>
  );
}

export default function Admin() {
  const canManageUsers = usePermission('admin.manage_users');
  const canManageRoles = usePermission('admin.manage_roles');
  const { data: roles } = useRoles();

  const roleNameById = useMemo(
    () => new Map((roles ?? []).map((r) => [r.id, r.name])),
    [roles]
  );
  const roleName = (roleId: string) => roleNameById.get(roleId) ?? roleId;

  if (!canManageUsers && !canManageRoles) {
    return (
      <div style={{ fontFamily: 'Arial, sans-serif', padding: 24 }}>
        <p>You don&apos;t have access to this page.</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 24 }}>
      <h1>Admin</h1>
      <UsersSection canManageUsers={canManageUsers} roleName={roleName} />
      <RolesSection canManageRoles={canManageRoles} />
    </div>
  );
}
