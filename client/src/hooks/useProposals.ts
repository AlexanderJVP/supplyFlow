import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProposal,
  CreateProposalReview,
  Proposal,
} from '@manufacturing/shared';

import { api } from '../lib/api';

export function useProposals() {
  return useQuery({
    queryKey: ['proposals'],
    queryFn: () => api.get<Proposal[]>('/proposals').then((r) => r.data),
  });
}

export function useCreateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProposal) =>
      api.post<Proposal>('/proposals', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proposals'] }),
  });
}

export function useSubmitProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<Proposal>(`/proposals/${id}/submit`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proposals'] }),
  });
}

export function useReviewProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & CreateProposalReview) =>
      api.post<Proposal>(`/proposals/${id}/review`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      // An approved bom_change proposal may have just rewritten bom_lines.
      qc.invalidateQueries({ queryKey: ['bom-tree'] });
    },
  });
}
