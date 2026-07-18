import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateItem, Item, UpdateItem } from '@manufacturing/shared';

import { api } from '../lib/api';

export function useItems() {
  return useQuery({
    queryKey: ['items'],
    queryFn: () => api.get<Item[]>('/items').then((r) => r.data),
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateItem) =>
      api.post<Item>('/items', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateItem }) =>
      api.patch<Item>(`/items/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });
}

export function useArchiveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.patch<Item>(`/items/${id}/archive`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });
}
