import { useState, type FormEvent } from 'react';

import { useBomTree, useCreateBomLine } from '../../hooks/useBom';
import { useItems } from '../../hooks/useItems';
import { usePermission } from '../../hooks/usePermission';

export default function BomTreeViewer({
  itemId,
  onClose,
}: {
  itemId: string;
  onClose?: () => void;
}) {
  const { data, isLoading, error } = useBomTree(itemId);
  const { data: items } = useItems();
  const createBomLine = useCreateBomLine();
  const canEditBom = usePermission('bom.edit');

  const [childItemId, setChildItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [formError, setFormError] = useState<string | null>(null);

  const candidateChildren = (items ?? []).filter((i) => i.id !== itemId);

  async function handleAddLine(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!childItemId || !quantity || Number(quantity) <= 0) {
      setFormError('Pick a component and a positive quantity.');
      return;
    }

    try {
      await createBomLine.mutateAsync({
        parent_item_id: itemId,
        child_item_id: childItemId,
        quantity: Number(quantity),
      });
      setChildItemId('');
      setQuantity('1');
    } catch {
      setFormError(
        'Failed to add BOM line — check it does not create a cycle.'
      );
    }
  }

  return (
    <div
      style={{
        border: '1px solid #ccc',
        padding: 16,
        marginTop: 16,
        maxWidth: 480,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <h2 style={{ margin: 0 }}>BOM tree</h2>
        {onClose && <button onClick={onClose}>Close</button>}
      </div>

      {isLoading && <p>Loading…</p>}
      {error && <p style={{ color: 'red' }}>Failed to load BOM tree.</p>}
      {data && data.length === 0 && <p>No BOM lines for this item yet.</p>}

      {data && data.length > 0 && (
        <ul>
          {data.map((node) => (
            <li
              key={`${node.item_id}-${node.depth}`}
              style={{ marginLeft: (node.depth - 1) * 20 }}
            >
              {node.sku} — {node.name} × {node.quantity}
            </li>
          ))}
        </ul>
      )}

      {canEditBom && (
        <form
          onSubmit={handleAddLine}
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid #eee',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <select
            value={childItemId}
            onChange={(e) => setChildItemId(e.target.value)}
          >
            <option value="">Add component…</option>
            {candidateChildren.map((i) => (
              <option key={i.id} value={i.id}>
                {i.sku} — {i.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{ width: 80 }}
          />
          <button type="submit" disabled={createBomLine.isPending}>
            {createBomLine.isPending ? 'Adding…' : 'Add'}
          </button>
          {formError && <span style={{ color: 'red' }}>{formError}</span>}
        </form>
      )}
    </div>
  );
}
