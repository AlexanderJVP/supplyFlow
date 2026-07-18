import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateItem, Item, UpdateItem } from '@manufacturing/shared';

import { api } from '../lib/api';

// Used by pickers (BOM child select, production order item select, item
// lookups) that need the whole tenant's items, not one page of them. The API
// paginates by default (50/page) now, so this asks for the max page size
// instead of silently only seeing the first 50 items.
export function useItems() {
  return useQuery({
    queryKey: ['items'],
    queryFn: () =>
      api.get<Item[]>('/items', { params: { limit: 200 } }).then((r) => r.data),
  });
}

// Backs the paged items table on the Items list page.
export function useItemsPage(after: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ['items', 'page', after, limit],
    queryFn: async () => {
      const response = await api.get<Item[]>('/items', {
        params: { after, limit },
      });
      return {
        items: response.data,
        nextCursor: response.headers['x-next-cursor'] as string | undefined,
      };
    },
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
