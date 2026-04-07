import { getHostReact, actions } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useState, useEffect, useRef, useCallback } = React;

export interface Invoice {
  id: string;
  invoiceNumber: number;
  invoiceDate: string;
  clientId: string;
  maniType: string;
  invoiceType: string;
  remito: string | null;
  kg: number;
  unitPrice: number;
  subtotal: number | null;
  ivaAmount: number | null;
  total: number | null;
  paid: boolean;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export function useInvoices() {
  const [items, setItems] = useState<Invoice[]>([]);
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
      const result = await actions.execute<Invoice[]>('granos-comercial.invoices.list');
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
    async (payload: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>) => {
      await actions.execute('granos-comercial.invoices.create', {
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
    async (id: string, payload: Partial<Invoice>) => {
      await actions.execute('granos-comercial.invoices.update', {
        id,
        data: { ...payload, updatedAt: new Date().toISOString() },
      });
      void fetchItems();
    },
    [fetchItems]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      await actions.execute('granos-comercial.invoices.delete', { id });
      void fetchItems();
    },
    [fetchItems]
  );

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  return { items, loading, error, fetchItems, createItem, updateItem, deleteItem };
}
