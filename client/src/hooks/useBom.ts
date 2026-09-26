import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BomLine, CreateBomLine } from '@manufacturing/shared';

import { api } from '../lib/api';

export type BomTreeNode = {
  item_id: string;
  sku: string;
  name: string;
  quantity: number;
  depth: number;
};

export function useBomTree(itemId: string | null) {
  return useQuery({
    queryKey: ['bom-tree', itemId],
    queryFn: () =>
      api.get<BomTreeNode[]>(`/bom/${itemId}/tree`).then((r) => r.data),
    enabled: !!itemId,
  });
}

// Direct (non-recursive) lines for one parent item, including each line's
// own id -- used by the bom_change proposal editor to target existing lines
// for update/delete (the recursive /tree endpoint never exposes bom_lines.id).
export function useBomLines(itemId: string | null) {
  return useQuery({
    queryKey: ['bom-lines', itemId],
    queryFn: () =>
      api.get<BomLine[]>(`/bom/${itemId}/lines`).then((r) => r.data),
    enabled: !!itemId,
  });
}

export function useCreateBomLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBomLine) =>
      api.post('/bom', data).then((r) => r.data),
    onSuccess: (_, variables) =>
      qc.invalidateQueries({
        queryKey: ['bom-tree', variables.parent_item_id],
      }),
  });
}
