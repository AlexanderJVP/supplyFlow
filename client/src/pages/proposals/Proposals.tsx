import { useState, type FormEvent } from 'react';
import type { ProposalType } from '@manufacturing/shared';

import { useAuth } from '../../context/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import {
  useCreateProposal,
  useProposals,
  useReviewProposal,
  useSubmitProposal,
} from '../../hooks/useProposals';

const PROPOSAL_TYPES: ProposalType[] = [
  'bom_change',
  'item_change',
  'process_change',
];

const BOM_CHANGE_PLACEHOLDER = JSON.stringify(
  {
    create: [{ parent_item_id: '...', child_item_id: '...', quantity: 1 }],
    update: [],
    delete: [],
  },
  null,
  2
);

function ReviewControls({ proposalId }: { proposalId: string }) {
  const reviewProposal = useReviewProposal();
  const [notes, setNotes] = useState('');

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button
        disabled={reviewProposal.isPending}
        onClick={() =>
          reviewProposal.mutate({ id: proposalId, action: 'approved', notes })
        }
      >
        Approve
      </button>
      <button
        disabled={reviewProposal.isPending}
        onClick={() =>
          reviewProposal.mutate({ id: proposalId, action: 'rejected', notes })
        }
      >
        Reject
      </button>
      <button
        disabled={reviewProposal.isPending}
        onClick={() =>
          reviewProposal.mutate({
            id: proposalId,
            action: 'requested_changes',
            notes,
          })
        }
      >
        Request changes
      </button>
    </div>
  );
}

export default function Proposals() {
  const { session } = useAuth();
  const { data: proposals, isLoading, error } = useProposals();
  const createProposal = useCreateProposal();
  const submitProposal = useSubmitProposal();
  const reviewProposal = useReviewProposal();
  const canCreate = usePermission('proposals.create');
  const canReview = usePermission('proposals.review');

  const [type, setType] = useState<ProposalType>('process_change');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [payloadText, setPayloadText] = useState('{}');
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError('Title is required.');
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      setFormError('Payload must be valid JSON.');
      return;
    }

    try {
      await createProposal.mutateAsync({
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        payload,
      });
      setTitle('');
      setDescription('');
      setPayloadText('{}');
    } catch {
      setFormError('Failed to create proposal.');
    }
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 24 }}>
      <h1>Proposals</h1>

      {isLoading && <p>Loading…</p>}
      {error && <p style={{ color: 'red' }}>Failed to load proposals.</p>}

      {proposals && (
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Title</th>
              <th style={{ textAlign: 'left' }}>Type</th>
              <th style={{ textAlign: 'left' }}>Status</th>
              <th style={{ textAlign: 'left' }}></th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td>{p.type}</td>
                <td>{p.status}</td>
                <td>
                  {p.status === 'draft' &&
                    p.created_by === session?.user.id && (
                      <button
                        disabled={submitProposal.isPending}
                        onClick={() => submitProposal.mutate(p.id)}
                      >
                        Submit for review
                      </button>
                    )}
                  {p.status === 'pending_review' && canReview && (
                    <ReviewControls proposalId={p.id} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {reviewProposal.isError && (
        <p style={{ color: 'red' }}>
          Review failed — check you hold the role required for this
          proposal&apos;s current workflow step.
        </p>
      )}

      {canCreate && (
        <>
          <h2 style={{ marginTop: 32 }}>New proposal</h2>
          <form onSubmit={handleCreate} style={{ maxWidth: 480 }}>
            <div style={{ marginBottom: 8 }}>
              <label>
                Type
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ProposalType)}
                  style={{ display: 'block', width: '100%' }}
                >
                  {PROPOSAL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label>
                Title
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{ display: 'block', width: '100%' }}
                />
              </label>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label>
                Description (optional)
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ display: 'block', width: '100%' }}
                />
              </label>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label>
                Payload (JSON)
                <textarea
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  rows={8}
                  style={{
                    display: 'block',
                    width: '100%',
                    fontFamily: 'monospace',
                  }}
                />
              </label>
              {type === 'bom_change' && (
                <p style={{ fontSize: 12, color: '#555' }}>
                  For bom_change, shape:{' '}
                  <code style={{ whiteSpace: 'pre' }}>
                    {BOM_CHANGE_PLACEHOLDER}
                  </code>
                </p>
              )}
            </div>

            {formError && <p style={{ color: 'red' }}>{formError}</p>}

            <button type="submit" disabled={createProposal.isPending}>
              {createProposal.isPending ? 'Creating…' : 'Create proposal'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
