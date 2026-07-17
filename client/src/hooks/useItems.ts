import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateItem, Item } from '@manufacturing/shared';

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
