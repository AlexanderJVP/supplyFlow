import { useState } from 'react';

import { useItems } from '../../hooks/useItems';
import { useAuth } from '../../context/AuthContext';
import BomTreeViewer from '../bom/BomTreeViewer';

export default function ItemList() {
  const { data: items, isLoading, error } = useItems();
  const { signOut } = useAuth();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <h1>Items</h1>
        <button onClick={signOut}>Sign out</button>
      </div>

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
    </div>
  );
}
