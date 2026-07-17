import { useState, type FormEvent } from 'react';
import type { ItemType } from '@manufacturing/shared';

import { useCreateItem, useItems } from '../../hooks/useItems';
import BomTreeViewer from '../bom/BomTreeViewer';

const ITEM_TYPES: ItemType[] = ['component', 'sub_assembly', 'finished_good'];

export default function ItemList() {
  const { data: items, isLoading, error } = useItems();
  const createItem = useCreateItem();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<ItemType>('component');
  const [unitOfMeasure, setUnitOfMeasure] = useState('each');
  const [reorderPoint, setReorderPoint] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!sku.trim() || !name.trim()) {
      setFormError('SKU and name are required.');
      return;
    }

    try {
      await createItem.mutateAsync({
        sku: sku.trim(),
        name: name.trim(),
        type,
        unit_of_measure: unitOfMeasure.trim() || 'each',
        reorder_point: reorderPoint ? Number(reorderPoint) : undefined,
      });
      setSku('');
      setName('');
      setReorderPoint('');
    } catch {
      setFormError('Failed to create item — check that the SKU is unique.');
    }
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 24 }}>
      <h1>Items</h1>

      {isLoading && <p>Loading…</p>}
      {error && <p style={{ color: 'red' }}>Failed to load items.</p>}

      {items && (
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>SKU</th>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'left' }}>Type</th>
              <th style={{ textAlign: 'left' }}>Unit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.sku}</td>
                <td>{item.name}</td>
                <td>{item.type}</td>
                <td>{item.unit_of_measure}</td>
                <td>
                  <button onClick={() => setSelectedItemId(item.id)}>
                    View BOM
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedItemId && (
        <BomTreeViewer
          itemId={selectedItemId}
          onClose={() => setSelectedItemId(null)}
        />
      )}

      <h2 style={{ marginTop: 32 }}>New item</h2>
      <form onSubmit={handleCreate} style={{ maxWidth: 360 }}>
        <div style={{ marginBottom: 8 }}>
          <label>
            SKU
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              style={{ display: 'block', width: '100%' }}
            />
          </label>
        </div>

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
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ItemType)}
              style={{ display: 'block', width: '100%' }}
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
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

        {formError && <p style={{ color: 'red' }}>{formError}</p>}

        <button type="submit" disabled={createItem.isPending}>
          {createItem.isPending ? 'Creating…' : 'Create item'}
        </button>
      </form>
    </div>
  );
}
