import { getHostReact, actions } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useState, useEffect, useRef, useCallback } = React;

export interface Order {
  id: string;
  orderDate: string;
  clientId: string;
  pallets: number | null;
  packageType: string;
  packageQuantity: number | null;
  caliber: string;
  product: string;
  loadDate: string | null;
  kg: number | null;
  delivered: boolean;
  remito: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export function useOrders() {
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const result = await actions.execute<Order[]>('granos-comercial.orders.list');
      if (mountedRef.current) {
        setItems(Array.isArray(result) ? result : []);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) setError(err as Error);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const createItem = useCallback(
    async (payload: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>) => {
      await actions.execute('granos-comercial.orders.create', {
        data: {
          id: crypto.randomUUID(),
          ...payload,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      void fetchItems();
    },
    [fetchItems]
  );

  const updateItem = useCallback(
    async (id: string, payload: Partial<Order>) => {
      await actions.execute('granos-comercial.orders.update', {
        id,
        data: { ...payload, updatedAt: new Date().toISOString() },
      });
      void fetchItems();
    },
    [fetchItems]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      await actions.execute('granos-comercial.orders.delete', { id });
      void fetchItems();
    },
    [fetchItems]
  );

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  return { items, loading, error, fetchItems, createItem, updateItem, deleteItem };
}
