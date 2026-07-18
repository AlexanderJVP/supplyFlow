import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AdjustStock,
  StockAlert,
  StockLedgerEntry,
  StockWithItem,
} from '@manufacturing/shared';

import { api } from '../lib/api';

export function useCurrentStock() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: () =>
      api
        .get<StockWithItem[]>('/inventory', { params: { limit: 200 } })
        .then((r) => r.data),
  });
}

// Backs the paged stock table on the Inventory page.
export function useCurrentStockPage(after: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ['inventory', 'page', after, limit],
    queryFn: async () => {
      const response = await api.get<StockWithItem[]>('/inventory', {
        params: { after, limit },
      });
      return {
        rows: response.data,
        nextCursor: response.headers['x-next-cursor'] as string | undefined,
      };
    },
  });
}

export function useStockAlerts() {
  return useQuery({
    queryKey: ['inventory', 'alerts'],
    queryFn: () =>
      api.get<StockAlert[]>('/inventory/alerts').then((r) => r.data),
  });
}

export function useStockHistory(itemId: string | null) {
  return useQuery({
    queryKey: ['inventory', 'history', itemId],
    queryFn: () =>
      api
        .get<StockLedgerEntry[]>(`/inventory/${itemId}/history`)
        .then((r) => r.data),
    enabled: !!itemId,
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AdjustStock) =>
      api.post<StockLedgerEntry>('/inventory/adjust', data).then((r) => r.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({
        queryKey: ['inventory', 'history', variables.item_id],
      });
    },
  });
}
