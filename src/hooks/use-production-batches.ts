import { getHostReact, actions } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useState, useEffect, useRef, useCallback } = React;

export interface ProductionBatch {
  id: string;
  date: string;
  caliber: string;
  kg: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export function useProductionBatches() {
  const [items, setItems] = useState<ProductionBatch[]>([]);
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
      const result = await actions.execute<ProductionBatch[]>(
        'granos-produccion.production-batches.list'
      );
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
    async (payload: Omit<ProductionBatch, 'id' | 'createdAt' | 'updatedAt'>) => {
      await actions.execute('granos-produccion.production-batches.create', {
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
    async (id: string, payload: Partial<ProductionBatch>) => {
      await actions.execute('granos-produccion.production-batches.update', {
        id,
        data: { ...payload, updatedAt: new Date().toISOString() },
      });
      void fetchItems();
    },
    [fetchItems]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      await actions.execute('granos-produccion.production-batches.delete', { id });
      void fetchItems();
    },
    [fetchItems]
  );

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  return { items, loading, error, fetchItems, createItem, updateItem, deleteItem };
}
