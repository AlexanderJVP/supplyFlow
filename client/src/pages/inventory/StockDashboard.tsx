import { useState, type FormEvent } from 'react';

import Pager from '../../components/Pager';
import { useCursorPagination } from '../../hooks/useCursorPagination';
import {
  useAdjustStock,
  useCurrentStock,
  useCurrentStockPage,
} from '../../hooks/useInventory';
import { useDownloadCsv } from '../../hooks/useDownloadCsv';
import { usePermission } from '../../hooks/usePermission';
import MovementHistory from './MovementHistory';

const LEDGER_REASONS = [
  'received',
  'consumed',
  'adjusted',
  'produced',
  'shipped',
  'returned',
  'wasted',
] as const;

export default function StockDashboard() {
  const pagination = useCursorPagination();
  const { data, isLoading, error } = useCurrentStockPage(pagination.after);
  const stock = data?.rows;
  const canAdjust = usePermission('inventory.adjust');
  // Separately fetched (unpaginated up to 200) so the "Adjust stock" item
  // picker below always lists every item, not just the current table page.
  const { data: allStock } = useCurrentStock(canAdjust);
  const adjustStock = useAdjustStock();
  const canExport = usePermission('inventory.export');
  const {
    download: downloadExport,
    isDownloading,
    error: exportError,
  } = useDownloadCsv();

  const [historyItem, setHistoryItem] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [adjustItemId, setAdjustItemId] = useState('');
  const [quantityDelta, setQuantityDelta] = useState('');
  const [reason, setReason] =
    useState<(typeof LEDGER_REASONS)[number]>('received');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function handleAdjust(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const delta = Number(quantityDelta);
    if (!adjustItemId || !delta) {
      setFormError('Pick an item and a non-zero quantity.');
      return;
    }

    try {
      await adjustStock.mutateAsync({
        item_id: adjustItemId,
        quantity_delta: delta,
        reason,
        notes: notes || undefined,
      });
      setQuantityDelta('');
      setNotes('');
    } catch {
      setFormError('Failed to adjust stock.');
    }
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <h1>Inventory</h1>
        {canExport && (
          <button
            onClick={() => downloadExport('/inventory/export', 'inventory.csv')}
            disabled={isDownloading}
          >
            {isDownloading ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      {exportError && <p style={{ color: 'red' }}>{exportError}</p>}

      {isLoading && <p>Loading…</p>}
      {error && <p style={{ color: 'red' }}>Failed to load stock levels.</p>}

      {stock && (
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>SKU</th>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'right' }}>Stock</th>
              <th style={{ textAlign: 'right' }}>Reorder point</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stock.map((row) => {
              const belowReorderPoint =
                row.reorder_point != null && row.quantity < row.reorder_point;
              return (
                <tr
                  key={row.item_id}
                  style={
                    belowReorderPoint
                      ? { backgroundColor: '#fef2f2', color: '#b91c1c' }
                      : undefined
                  }
                >
                  <td>{row.sku}</td>
                  <td>{row.name}</td>
                  <td style={{ textAlign: 'right' }}>{row.quantity}</td>
                  <td style={{ textAlign: 'right' }}>
                    {row.reorder_point ?? '—'}
                  </td>
                  <td>
                    <button
                      onClick={() =>
                        setHistoryItem({ id: row.item_id, name: row.name })
                      }
                    >
                      History
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Pager
        page={pagination.page}
        canGoPrev={pagination.canGoPrev}
        canGoNext={!!data?.nextCursor}
        onPrev={pagination.goPrev}
        onNext={() => pagination.goNext(data?.nextCursor)}
      />

      {canAdjust && (
        <>
          <h2 style={{ marginTop: 32 }}>Adjust stock</h2>
          <form onSubmit={handleAdjust} style={{ maxWidth: 360 }}>
            <div style={{ marginBottom: 8 }}>
              <label>
                Item
                <select
                  value={adjustItemId}
                  onChange={(e) => setAdjustItemId(e.target.value)}
                  style={{ display: 'block', width: '100%' }}
                >
                  <option value="">Select an item…</option>
                  {allStock?.map((row) => (
                    <option key={row.item_id} value={row.item_id}>
                      {row.sku} — {row.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label>
                Quantity delta (negative to remove stock)
                <input
                  type="number"
                  value={quantityDelta}
                  onChange={(e) => setQuantityDelta(e.target.value)}
                  style={{ display: 'block', width: '100%' }}
                />
              </label>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label>
                Reason
                <select
                  value={reason}
                  onChange={(e) =>
                    setReason(e.target.value as (typeof LEDGER_REASONS)[number])
                  }
                  style={{ display: 'block', width: '100%' }}
                >
                  {LEDGER_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label>
                Notes
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ display: 'block', width: '100%' }}
                />
              </label>
            </div>

            {formError && <p style={{ color: 'red' }}>{formError}</p>}

            <button type="submit" disabled={adjustStock.isPending}>
              {adjustStock.isPending ? 'Saving…' : 'Adjust stock'}
            </button>
          </form>
        </>
      )}

      {historyItem && (
        <MovementHistory
          itemId={historyItem.id}
          itemName={historyItem.name}
          onClose={() => setHistoryItem(null)}
        />
      )}
    </div>
  );
}
