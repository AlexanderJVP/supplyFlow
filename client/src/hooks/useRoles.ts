import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateRole, Role, UpdateRole } from '@manufacturing/shared';

import { api } from '../lib/api';

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Role[]>('/roles').then((r) => r.data),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRole) =>
      api.post<Role>('/roles', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRole }) =>
      api.patch<Role>(`/roles/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}
