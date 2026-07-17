import { z } from 'zod';

export const ProposalTypeSchema = z.enum([
  'bom_change',
  'item_change',
  'process_change',
]);
export const ProposalStatusSchema = z.enum([
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'withdrawn',
]);
export const ProposalReviewActionSchema = z.enum([
  'approved',
  'rejected',
  'requested_changes',
]);

export const CreateProposalSchema = z.object({
  type: ProposalTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  payload: z.record(z.unknown()),
});

export const ProposalSchema = CreateProposalSchema.extend({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  status: ProposalStatusSchema,
  created_by: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const CreateProposalReviewSchema = z.object({
  action: ProposalReviewActionSchema,
  notes: z.string().max(2000).optional(),
});

export const ProposalReviewSchema = CreateProposalReviewSchema.extend({
  id: z.string().uuid(),
  proposal_id: z.string().uuid(),
  reviewer_id: z.string().uuid(),
  created_at: z.string(),
});

export type CreateProposal = z.infer<typeof CreateProposalSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type CreateProposalReview = z.infer<typeof CreateProposalReviewSchema>;
export type ProposalReview = z.infer<typeof ProposalReviewSchema>;
