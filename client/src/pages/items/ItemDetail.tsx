import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import BomTreeViewer from '../bom/BomTreeViewer';
import { usePermission } from '../../hooks/usePermission';
import { useArchiveItem, useItems, useUpdateItem } from '../../hooks/useItems';
import { useCurrentStock, useStockHistory } from '../../hooks/useInventory';

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: items, isLoading, error } = useItems();
  const { data: stock } = useCurrentStock();
  const { data: history } = useStockHistory(id ?? null);
  const updateItem = useUpdateItem();
  const archiveItem = useArchiveItem();
  const canEdit = usePermission('items.edit');
  const canArchive = usePermission('items.archive');

  const item = items?.find((i) => i.id === id);
  const stockRow = stock?.find((s) => s.item_id === id);

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('');
  const [reorderPoint, setReorderPoint] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function startEditing() {
    if (!item) return;
    setName(item.name);
    setDescription(item.description ?? '');
    setUnitOfMeasure(item.unit_of_measure);
    setReorderPoint(
      item.reorder_point != null ? String(item.reorder_point) : ''
    );
    setIsEditing(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!id) return;

    try {
      await updateItem.mutateAsync({
        id,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          unit_of_measure: unitOfMeasure.trim() || 'each',
          reorder_point: reorderPoint ? Number(reorderPoint) : undefined,
        },
      });
      setIsEditing(false);
    } catch {
      setFormError('Failed to save changes — check the values and try again.');
    }
  }

  async function handleArchive() {
    if (!id) return;
    await archiveItem.mutateAsync(id);
    navigate('/items');
  }

  if (isLoading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (error)
    return <p style={{ padding: 24, color: 'red' }}>Failed to load item.</p>;
  if (!item)
    return (
      <div style={{ padding: 24 }}>
        <p>Item not found.</p>
        <Link to="/items">Back to items</Link>
      </div>
    );

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 24 }}>
      <Link to="/items">&larr; Back to items</Link>

      <h1 style={{ marginBottom: 4 }}>
        {item.name} {item.is_archived && <em>(archived)</em>}
      </h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        {item.sku} &middot; {item.type}
      </p>

      {!isEditing && (
        <div style={{ marginBottom: 16 }}>
          <p>
            <strong>Unit of measure:</strong> {item.unit_of_measure}
          </p>
          <p>
            <strong>Reorder point:</strong> {item.reorder_point ?? '—'}
          </p>
          <p>
            <strong>Description:</strong> {item.description || '—'}
          </p>
          <p>
            <strong>Current stock:</strong> {stockRow?.quantity ?? 0}
          </p>

          <div style={{ display: 'flex', gap: 8 }}>
            {canEdit && !item.is_archived && (
              <button onClick={startEditing}>Edit</button>
            )}
            {canArchive && !item.is_archived && (
              <button disabled={archiveItem.isPending} onClick={handleArchive}>
                Archive
              </button>
            )}
          </div>
        </div>
      )}

      {isEditing && (
        <form onSubmit={handleSave} style={{ maxWidth: 360, marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ display: 'block', width: '100%' }}
              />
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>
              Unit of measure
              <input
                type="text"
                value={unitOfMeasure}
                onChange={(e) => setUnitOfMeasure(e.target.value)}
                style={{ display: 'block', width: '100%' }}
              />
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>
              Reorder point (optional)
              <input
                type="number"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
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

          {formError && <p style={{ color: 'red' }}>{formError}</p>}

          <button type="submit" disabled={updateItem.isPending}>
            {updateItem.isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setIsEditing(false)}>
            Cancel
          </button>
        </form>
      )}

      <h2>Bill of materials</h2>
      <BomTreeViewer itemId={item.id} />

      <h2 style={{ marginTop: 24 }}>Recent stock movements</h2>
      {!history || history.length === 0 ? (
        <p>No stock movements recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Date</th>
              <th style={{ textAlign: 'right' }}>Delta</th>
              <th style={{ textAlign: 'left' }}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {history.slice(0, 10).map((h) => (
              <tr key={h.id}>
                <td>{new Date(h.created_at).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{h.quantity_delta}</td>
                <td>{h.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
