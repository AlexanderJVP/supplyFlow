import { useStockHistory } from '../../hooks/useInventory';

export default function MovementHistory({
  itemId,
  itemName,
  onClose,
}: {
  itemId: string;
  itemName: string;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useStockHistory(itemId);

  return (
    <div
      style={{
        border: '1px solid #ccc',
        padding: 16,
        marginTop: 16,
        maxWidth: 640,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <h2 style={{ margin: 0 }}>Movement history — {itemName}</h2>
        <button onClick={onClose}>Close</button>
      </div>

      {isLoading && <p>Loading…</p>}
      {error && (
        <p style={{ color: 'red' }}>Failed to load movement history.</p>
      )}
      {data && data.length === 0 && (
        <p>No stock movements for this item yet.</p>
      )}

      {data && data.length > 0 && (
        <table style={{ width: '100%', marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Date</th>
              <th style={{ textAlign: 'left' }}>Reason</th>
              <th style={{ textAlign: 'right' }}>Delta</th>
              <th style={{ textAlign: 'left' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.created_at).toLocaleString()}</td>
                <td>{entry.reason}</td>
                <td
                  style={{
                    textAlign: 'right',
                    color: entry.quantity_delta < 0 ? '#b91c1c' : '#15803d',
                  }}
                >
                  {entry.quantity_delta > 0 ? '+' : ''}
                  {entry.quantity_delta}
                </td>
                <td>{entry.notes ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
