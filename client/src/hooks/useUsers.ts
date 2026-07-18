import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InviteUser, Profile } from '@manufacturing/shared';

import { api } from '../lib/api';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<Profile[]>('/users').then((r) => r.data),
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InviteUser) =>
      api.post('/users/invite', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) =>
      api
        .patch<Profile>(`/users/${id}/role`, { role_id: roleId })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
