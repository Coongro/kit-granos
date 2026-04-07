import { getHostReact, actions } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useState, useEffect, useRef, useCallback } = React;

export interface SupplyMovement {
  id: string;
  date: string;
  supplyType: string;
  movementType: string;
  quantity: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export function useSupplyMovements() {
  const [items, setItems] = useState<SupplyMovement[]>([]);
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
      const result = await actions.execute<SupplyMovement[]>(
        'granos-produccion.supply-movements.list'
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
    async (payload: Omit<SupplyMovement, 'id' | 'createdAt' | 'updatedAt'>) => {
      await actions.execute('granos-produccion.supply-movements.create', {
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
    async (id: string, payload: Partial<SupplyMovement>) => {
      await actions.execute('granos-produccion.supply-movements.update', {
        id,
        data: { ...payload, updatedAt: new Date().toISOString() },
      });
      void fetchItems();
    },
    [fetchItems]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      await actions.execute('granos-produccion.supply-movements.delete', { id });
      void fetchItems();
    },
    [fetchItems]
  );

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  return { items, loading, error, fetchItems, createItem, updateItem, deleteItem };
}
