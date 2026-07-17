import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CanProduceShortfall,
  CreateProductionOrder,
  ProductionOrder,
} from '@manufacturing/shared';

import { api } from '../lib/api';

export function useProductionOrders() {
  return useQuery({
    queryKey: ['production'],
    queryFn: () =>
      api.get<ProductionOrder[]>('/production').then((r) => r.data),
  });
}

export function useCanProduce(itemId: string | null, quantity: number) {
  return useQuery({
    queryKey: ['production', 'can-produce', itemId, quantity],
    queryFn: () =>
      api
        .get<CanProduceShortfall[]>('/production/can-produce', {
          params: { item_id: itemId, quantity },
        })
        .then((r) => r.data),
    enabled: !!itemId && quantity > 0,
  });
}

export function useCreateProductionOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProductionOrder) =>
      api.post<ProductionOrder>('/production', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production'] }),
  });
}

function useProductionOrderAction(action: 'start' | 'complete' | 'cancel') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) =>
      api
        .post<ProductionOrder>(`/production/${orderId}/${action}`)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useStartProductionOrder() {
  return useProductionOrderAction('start');
}

export function useCompleteProductionOrder() {
  return useProductionOrderAction('complete');
}

export function useCancelProductionOrder() {
  return useProductionOrderAction('cancel');
}
