import { useMemo, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import type {
  CanProduceShortfall,
  InsufficientStockError,
} from '@manufacturing/shared';

import Pager from '../../components/Pager';
import { useCursorPagination } from '../../hooks/useCursorPagination';
import { useItems } from '../../hooks/useItems';
import { usePermission } from '../../hooks/usePermission';
import {
  useCanProduce,
  useCancelProductionOrder,
  useCompleteProductionOrder,
  useCreateProductionOrder,
  useProductionOrdersPage,
  useStartProductionOrder,
} from '../../hooks/useProduction';
import { useDownloadCsv } from '../../hooks/useDownloadCsv';

// A short sub-assembly is built by its own production order; tell the user
// how many of it they could build right now from its components' stock.
function buildableHint(s: CanProduceShortfall) {
  if (s.buildable_from_stock == null) return null;
  return ` — you can build ${s.buildable_from_stock} from stock`;
}

export default function ProductionOrders() {
  const { data: items } = useItems();
  const pagination = useCursorPagination();
  const { data, isLoading, error } = useProductionOrdersPage(pagination.after);
  const orders = data?.orders;
  const canExport = usePermission('production.view');
  // Starting an order is part of creating it (same server permission).
  const canCreate = usePermission('production.create');
  const canComplete = usePermission('production.complete');
  const canCancel = usePermission('production.cancel');
  const {
    download: downloadExport,
    isDownloading,
    error: exportError,
  } = useDownloadCsv();

  const createOrder = useCreateProductionOrder();
  const startOrder = useStartProductionOrder();
  const completeOrder = useCompleteProductionOrder();
  const cancelOrder = useCancelProductionOrder();

  const itemsById = useMemo(
    () => new Map((items ?? []).map((item) => [item.id, item])),
    [items]
  );

  // A 409 means stock ran out -- possibly because another order completed
  // first and used the same components. Show exactly what is missing.
  const completeShortfalls = useMemo(() => {
    const err = completeOrder.error;
    if (
      isAxiosError<InsufficientStockError>(err) &&
      err.response?.status === 409 &&
      err.response.data?.code === 'insufficient_stock'
    ) {
      return err.response.data.shortfalls;
    }
    return null;
  }, [completeOrder.error]);

  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: shortfalls } = useCanProduce(
    itemId || null,
    Number(quantity) || 0
  );
  const shortItems = (shortfalls ?? []).filter((s) => s.shortfall > 0);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const qty = Number(quantity);
    if (!itemId || !qty || qty <= 0) {
      setFormError('Pick an item and a positive quantity.');
      return;
    }

    try {
      await createOrder.mutateAsync({ item_id: itemId, quantity: qty });
      setQuantity('1');
    } catch {
      setFormError('Failed to create production order.');
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
        <h1>Production Orders</h1>
        {canExport && (
          <button
            onClick={() =>
              downloadExport('/production/export', 'production.csv')
            }
            disabled={isDownloading}
          >
            {isDownloading ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      {exportError && <p style={{ color: 'red' }}>{exportError}</p>}

      {isLoading && <p>Loading…</p>}
      {error && (
        <p style={{ color: 'red' }}>Failed to load production orders.</p>
      )}

      {orders && (
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Item</th>
              <th style={{ textAlign: 'right' }}>Quantity</th>
              <th style={{ textAlign: 'left' }}>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{itemsById.get(order.item_id)?.name ?? order.item_id}</td>
                <td style={{ textAlign: 'right' }}>{order.quantity}</td>
                <td>{order.status}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  {canCreate && order.status === 'draft' && (
                    <button onClick={() => startOrder.mutate(order.id)}>
                      Start
                    </button>
                  )}
                  {canComplete &&
                    (order.status === 'draft' ||
                      order.status === 'in_progress') && (
                      <button onClick={() => completeOrder.mutate(order.id)}>
                        Complete
                      </button>
                    )}
                  {canCancel &&
                    (order.status === 'draft' ||
                      order.status === 'in_progress') && (
                      <button onClick={() => cancelOrder.mutate(order.id)}>
                        Cancel
                      </button>
                    )}
                </td>
              </tr>
            ))}
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

      {completeShortfalls && (
        <div style={{ color: 'red' }}>
          <p>Not enough stock to complete this order:</p>
          <ul>
            {completeShortfalls.map((s) => (
              <li key={s.item_id}>
                {itemsById.get(s.item_id)?.name ?? s.item_id}: need {s.required}
                , have {s.available} (short {s.shortfall}){buildableHint(s)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {completeOrder.isError && !completeShortfalls && (
        <p style={{ color: 'red' }}>Failed to complete order.</p>
      )}

      {canCreate && (
        <>
          <h2 style={{ marginTop: 32 }}>New production order</h2>
          <form onSubmit={handleCreate} style={{ maxWidth: 360 }}>
            <div style={{ marginBottom: 8 }}>
              <label>
                Item
                <select
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  style={{ display: 'block', width: '100%' }}
                >
                  <option value="">Select an item…</option>
                  {items?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} — {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label>
                Quantity
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  style={{ display: 'block', width: '100%' }}
                />
              </label>
            </div>

            {shortItems.length > 0 && (
              <div style={{ color: '#b91c1c', marginBottom: 8 }}>
                <p style={{ margin: 0 }}>
                  Not enough stock to build this quantity:
                </p>
                <ul>
                  {shortItems.map((s) => (
                    <li key={s.item_id}>
                      {itemsById.get(s.item_id)?.name ?? s.item_id}: need{' '}
                      {s.required}, have {s.available} (short {s.shortfall})
                      {buildableHint(s)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {formError && <p style={{ color: 'red' }}>{formError}</p>}

            <button type="submit" disabled={createOrder.isPending}>
              {createOrder.isPending ? 'Creating…' : 'Create order'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
