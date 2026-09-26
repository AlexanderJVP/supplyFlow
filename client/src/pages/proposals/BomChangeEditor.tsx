import { useEffect, useMemo, useState } from 'react';
import type {
  BomChangeLineCreate,
  BomChangePayload,
} from '@manufacturing/shared';

import { useBomLines } from '../../hooks/useBom';
import { useItems } from '../../hooks/useItems';

// A structured editor for `bom_change` proposal payloads, scoped to one
// parent item's BOM at a time (mirrors BomTreeViewer's single-item add-line
// form). Existing lines can be quantity/notes-edited or marked for removal;
// new lines are staged below. The assembled BomChangePayload is reported to
// the parent form via onPayloadChange on every edit.
export default function BomChangeEditor({
  onPayloadChange,
}: {
  onPayloadChange: (payload: BomChangePayload | null) => void;
}) {
  const { data: items } = useItems();
  const [parentItemId, setParentItemId] = useState('');
  const { data: existingLines, isLoading: linesLoading } = useBomLines(
    parentItemId || null
  );

  const [edits, setEdits] = useState<
    Record<string, { quantity: string; notes: string }>
  >({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [newLines, setNewLines] = useState<BomChangeLineCreate[]>([]);

  const [newChildId, setNewChildId] = useState('');
  const [newQuantity, setNewQuantity] = useState('1');
  const [newNotes, setNewNotes] = useState('');

  // Switching parent items starts a fresh diff -- edits/deletes reference
  // bom_lines.id from the previously selected item's lines and don't apply here.
  useEffect(() => {
    setEdits({});
    setDeletedIds(new Set());
    setNewLines([]);
  }, [parentItemId]);

  const candidateChildren = (items ?? []).filter((i) => i.id !== parentItemId);
  const itemsById = useMemo(
    () => new Map((items ?? []).map((i) => [i.id, i])),
    [items]
  );

  const payload = useMemo<BomChangePayload | null>(() => {
    if (!parentItemId) return null;

    const update: { id: string; quantity: number; notes?: string }[] = [];
    for (const [id, edit] of Object.entries(edits)) {
      if (deletedIds.has(id)) continue;
      const line = existingLines?.find((l) => l.id === id);
      if (!line) continue;
      const quantity = Number(edit.quantity);
      const changed =
        (quantity > 0 && quantity !== line.quantity) ||
        edit.notes !== (line.notes ?? '');
      if (changed) {
        update.push({ id, quantity, notes: edit.notes || undefined });
      }
    }

    const del = Array.from(deletedIds);

    if (newLines.length === 0 && update.length === 0 && del.length === 0) {
      return { create: [], update: [], delete: [] };
    }

    return { create: newLines, update, delete: del };
  }, [parentItemId, edits, deletedIds, existingLines, newLines]);

  useEffect(() => {
    onPayloadChange(payload);
  }, [payload, onPayloadChange]);

  function editFor(id: string, quantity: number, notes: string | undefined) {
    return edits[id] ?? { quantity: String(quantity), notes: notes ?? '' };
  }

  function handleAddLine() {
    if (!newChildId || !newQuantity || Number(newQuantity) <= 0) return;
    setNewLines((prev) => [
      ...prev,
      {
        parent_item_id: parentItemId,
        child_item_id: newChildId,
        quantity: Number(newQuantity),
        notes: newNotes || undefined,
      },
    ]);
    setNewChildId('');
    setNewQuantity('1');
    setNewNotes('');
  }

  return (
    <div style={{ border: '1px solid #ccc', padding: 16 }}>
      <label>
        Item whose BOM is changing
        <select
          value={parentItemId}
          onChange={(e) => setParentItemId(e.target.value)}
          style={{ display: 'block', width: '100%' }}
        >
          <option value="">Select an item…</option>
          {(items ?? []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.sku} — {i.name}
            </option>
          ))}
        </select>
      </label>

      {!parentItemId && (
        <p style={{ fontSize: 12, color: '#555' }}>
          Pick the item first to see and edit its current BOM lines.
        </p>
      )}

      {parentItemId && linesLoading && <p>Loading current BOM lines…</p>}

      {parentItemId && existingLines && existingLines.length > 0 && (
        <table style={{ width: '100%', marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Component</th>
              <th style={{ textAlign: 'left' }}>Quantity</th>
              <th style={{ textAlign: 'left' }}>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {existingLines.map((line) => {
              const child = itemsById.get(line.child_item_id);
              const isDeleted = deletedIds.has(line.id);
              const edit = editFor(line.id, line.quantity, line.notes);
              return (
                <tr
                  key={line.id}
                  style={isDeleted ? { opacity: 0.5 } : undefined}
                >
                  <td>
                    {child
                      ? `${child.sku} — ${child.name}`
                      : line.child_item_id}
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={edit.quantity}
                      disabled={isDeleted}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [line.id]: { ...edit, quantity: e.target.value },
                        }))
                      }
                      style={{ width: 70 }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={edit.notes}
                      disabled={isDeleted}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [line.id]: { ...edit, notes: e.target.value },
                        }))
                      }
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() =>
                        setDeletedIds((prev) => {
                          const next = new Set(prev);
                          if (isDeleted) next.delete(line.id);
                          else next.add(line.id);
                          return next;
                        })
                      }
                    >
                      {isDeleted ? 'Undo' : 'Remove'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {parentItemId && existingLines && existingLines.length === 0 && (
        <p style={{ fontSize: 12, color: '#555' }}>
          This item has no BOM lines yet.
        </p>
      )}

      {newLines.length > 0 && (
        <table style={{ width: '100%', marginTop: 12 }}>
          <tbody>
            {newLines.map((line, idx) => {
              const child = itemsById.get(line.child_item_id);
              return (
                <tr key={idx}>
                  <td>
                    +{' '}
                    {child
                      ? `${child.sku} — ${child.name}`
                      : line.child_item_id}
                  </td>
                  <td>{line.quantity}</td>
                  <td>{line.notes}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() =>
                        setNewLines((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Undo
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {parentItemId && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid #eee',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <select
            value={newChildId}
            onChange={(e) => setNewChildId(e.target.value)}
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
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
            style={{ width: 70 }}
          />
          <input
            type="text"
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
          />
          <button type="button" onClick={handleAddLine}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}
