import { useBomTree } from '../../hooks/useBom';

export default function BomTreeViewer({
  itemId,
  onClose,
}: {
  itemId: string;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useBomTree(itemId);

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
        <button onClick={onClose}>Close</button>
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
    </div>
  );
}
