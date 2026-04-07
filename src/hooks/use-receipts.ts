import { getHostReact, actions } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useState, useEffect, useRef, useCallback } = React;

export interface Receipt {
  id: string;
  receiptNumber: string;
  ctgNumber: string | null;
  producerId: string;
  driverId: string | null;
  receptionDate: string;
  grainType: string;
  harvest: string | null;
  pricePerTon: number | null;
  status: string;
  grossKg: number;
  taraKg: number;
  netWithoutCleaningKg: number | null;
  precleaningKg: number | null;
  netKg: number | null;
  shrinkageKg: number | null;
  finalNetKg: number | null;
  dirtPercent: number | null;
  stickPercent: number | null;
  boxPercent: number | null;
  aptPercent: number | null;
  loosePercent: number | null;
  humidityPercent: number | null;
  boxGrainPercent: number | null;
  zarandaSize: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export function useReceipts() {
  const [items, setItems] = useState<Receipt[]>([]);
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
      const result = await actions.execute<Receipt[]>('granos-recepciones.receipts.list');
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
    async (payload: Omit<Receipt, 'id' | 'createdAt' | 'updatedAt'>) => {
      await actions.execute('granos-recepciones.receipts.create', {
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
    async (id: string, payload: Partial<Receipt>) => {
      await actions.execute('granos-recepciones.receipts.update', {
        id,
        data: { ...payload, updatedAt: new Date().toISOString() },
      });
      void fetchItems();
    },
    [fetchItems]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      await actions.execute('granos-recepciones.receipts.delete', { id });
      void fetchItems();
    },
    [fetchItems]
  );

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  return { items, loading, error, fetchItems, createItem, updateItem, deleteItem };
}
