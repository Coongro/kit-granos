/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, max-lines-per-function, complexity */
import {
  getHostReact,
  getHostUI,
  usePlugin,
  useViewContributions,
  actions,
} from '@coongro/plugin-sdk';

const React = getHostReact();
const UI = getHostUI();
const { useState, useEffect, useMemo } = React;

type AnyRecord = Record<string, any>;

// ════════════════════════════════════════════════════════════════════════════
// ZONA EDITABLE — Modificar para lógica de dominio
// ════════════════════════════════════════════════════════════════════════════

interface RepoData {
  receipts: AnyRecord[];
  productionbatches: AnyRecord[];
  supplymovements: AnyRecord[];
  orders: AnyRecord[];
  invoices: AnyRecord[];
}

interface StatConfig {
  label: string;
  value: string | number;
  icon: string;
  variant: 'brand' | 'default' | 'success' | 'danger';
  footer?: string;
}

interface WidgetColumn {
  header: string;
  align?: 'left' | 'right';
  render: (row: AnyRecord) => React.ReactNode;
  badge?: boolean;
}

interface WidgetConfig {
  title: string;
  icon: string;
  data: AnyRecord[];
  emptyMessage: string;
  columns: WidgetColumn[];
}

/**
 * Calcula las estadísticas principales del kit.
 * Cada stat agrega datos de los plugins hijos (recepciones, producción, comercial).
 */
function computeStats(repos: RepoData): StatConfig[] {
  // Stat 1: Total kg recibidos (suma de finalNetKg en receipts)
  const totalKgRecibidos = repos.receipts.reduce(
    (acc: number, r: AnyRecord) => acc + (Number(r.finalNetKg) || 0),
    0
  );

  // Stat 2: Cartas de porte pendientes (status = 'pending')
  const cartasPendientes = repos.receipts.filter((r: AnyRecord) => r.status === 'pending').length;

  // Stat 3: Stock maní calibrado (producción acumulada - maní vendido por kg)
  const totalProducido = repos.productionbatches.reduce(
    (acc: number, b: AnyRecord) => acc + (Number(b.kg) || 0),
    0
  );
  const totalVendido = repos.invoices.reduce(
    (acc: number, inv: AnyRecord) => acc + (Number(inv.kg) || 0),
    0
  );
  const stockMani = totalProducido - totalVendido;

  // Stat 4: Pedidos pendientes de entrega
  const pedidosPendientes = repos.orders.filter((o: AnyRecord) => !o.delivered).length;

  // Stat 5: Facturas sin cobrar
  const facturasSinCobrar = repos.invoices.filter((inv: AnyRecord) => !inv.paid).length;

  // Stat 6: Stock insumos críticos (tipos con saldo negativo)
  const supplyTotals: Record<string, number> = {};
  for (const mov of repos.supplymovements) {
    const tipo = String(mov.supplyType ?? 'desconocido');
    const qty = Number(mov.quantity) || 0;
    if (!supplyTotals[tipo]) supplyTotals[tipo] = 0;
    if (mov.movementType === 'entry') supplyTotals[tipo] += qty;
    else supplyTotals[tipo] -= qty;
  }
  const insumosCriticos = Object.values(supplyTotals).filter((v) => v < 0).length;

  return [
    // Fila 1: métricas de volumen/operación
    {
      label: 'Total kg recibidos',
      value: totalKgRecibidos.toLocaleString('es-AR') + ' kg',
      icon: 'Scale',
      variant: 'brand',
      footer: `${repos.receipts.length} cartas de porte`,
    },
    {
      label: 'Stock maní calibrado',
      value: stockMani.toLocaleString('es-AR') + ' kg',
      icon: 'Package',
      variant: stockMani >= 0 ? 'success' : 'danger',
      footer: 'Producción - ventas',
    },
    {
      label: 'Pedidos pendientes de entrega',
      value: pedidosPendientes,
      icon: 'Truck',
      variant: pedidosPendientes > 0 ? 'default' : 'success',
      footer: `De ${repos.orders.length} pedidos totales`,
    },
    // Fila 2: alertas/pendientes
    {
      label: 'Cartas de porte pendientes',
      value: cartasPendientes,
      icon: 'FileText',
      variant: cartasPendientes > 0 ? 'danger' : 'success',
      footer: 'Sin procesar',
    },
    {
      label: 'Facturas sin cobrar',
      value: facturasSinCobrar,
      icon: 'Receipt',
      variant: facturasSinCobrar > 0 ? 'danger' : 'success',
      footer: `De ${repos.invoices.length} facturas totales`,
    },
    {
      label: 'Insumos con stock crítico',
      value: insumosCriticos,
      icon: 'AlertTriangle',
      variant: insumosCriticos > 0 ? 'danger' : 'success',
      footer: 'Tipos con saldo negativo',
    },
  ];
}

/** Devuelve las últimas 5 recepciones ordenadas por fecha descendente. */
function computeUltimasRecepciones(receipts: AnyRecord[]): AnyRecord[] {
  return [...receipts]
    .sort(
      (a, b) => new Date(b.receptionDate ?? 0).getTime() - new Date(a.receptionDate ?? 0).getTime()
    )
    .slice(0, 5);
}

/** Devuelve pedidos no entregados con loadDate futuro ordenados por fecha de carga. */
function computeProximasCargas(orders: AnyRecord[]): AnyRecord[] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return [...orders]
    .filter((o) => !o.delivered && o.loadDate && new Date(o.loadDate) >= hoy)
    .sort((a, b) => new Date(a.loadDate).getTime() - new Date(b.loadDate).getTime())
    .slice(0, 5);
}

/** Calcula el stock de maní calibrado por calibre restando lo vendido. */
function computeStockCalibrado(batches: AnyRecord[], orders: AnyRecord[]): AnyRecord[] {
  const CALIBRES_ORDEN = ['c_38_42', 'c_40_50', 'c_50_60', 'c_80_100', 'split', 'industry', 'vaina'];
  const totales: Record<string, number> = {};
  for (const b of batches) {
    const cal = String(b.caliber ?? 'Sin calibre');
    totales[cal] = (totales[cal] ?? 0) + (Number(b.kg) || 0);
  }
  for (const o of orders) {
    if (o.delivered && o.caliber && o.kg) {
      const cal = String(o.caliber);
      totales[cal] = (totales[cal] ?? 0) - (Number(o.kg) || 0);
    }
  }
  const total = Object.values(totales).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(totales)
    .sort(([a], [b]) => {
      const ia = CALIBRES_ORDEN.indexOf(a);
      const ib = CALIBRES_ORDEN.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([caliber, kg]) => ({ caliber, kg, pct: Math.round((kg / total) * 100) }));
}

/** Calcula el stock neto de insumos (entradas - salidas) por tipo. */
function computeStockInsumos(movements: AnyRecord[]): AnyRecord[] {
  const totales: Record<string, number> = {};
  for (const mov of movements) {
    const tipo = String(mov.supplyType ?? 'desconocido');
    const qty = Number(mov.quantity) || 0;
    totales[tipo] = (totales[tipo] ?? 0) + (mov.movementType === 'entry' ? qty : -qty);
  }
  return Object.entries(totales).map(([supplyType, quantity]) => ({ supplyType, quantity }));
}

/**
 * Construye los 4 widgets del dashboard con datos de los plugins hijos.
 */
function computeWidgets(repos: RepoData, resolveContact?: (id: string) => string): WidgetConfig[] {
  const ultimasRecepciones = computeUltimasRecepciones(repos.receipts);
  const proximasCargas = computeProximasCargas(repos.orders);
  const stockCalibrado = computeStockCalibrado(repos.productionbatches, repos.orders);
  const stockInsumos = computeStockInsumos(repos.supplymovements);

  return [
    {
      title: 'Últimas recepciones',
      icon: 'FileText',
      data: ultimasRecepciones,
      emptyMessage: 'Sin cartas de porte registradas',
      columns: [
        { header: 'Carta de porte', render: (r: AnyRecord) => String(r.receiptNumber ?? '—') },
        {
          header: 'Fecha',
          render: (r: AnyRecord) =>
            r.receptionDate ? new Date(r.receptionDate).toLocaleDateString('es-AR') : '—',
        },
        {
          header: 'kg netos',
          align: 'right',
          render: (r: AnyRecord) =>
            r.finalNetKg ? Number(r.finalNetKg).toLocaleString('es-AR') : '—',
        },
        { header: 'Estado', badge: true, render: (r: AnyRecord) => String(r.status ?? '—') },
      ],
    },
    {
      title: 'Próximas fechas de carga',
      icon: 'Truck',
      data: proximasCargas,
      emptyMessage: 'Sin pedidos pendientes de carga',
      columns: [
        { header: 'Cliente', render: (r: AnyRecord) => resolveContact ? resolveContact(String(r.clientId ?? '')) : String(r.clientId ?? '—') },
        { header: 'Calibre', render: (r: AnyRecord) => String(r.caliber ?? '—') },
        {
          header: 'Fecha carga',
          render: (r: AnyRecord) =>
            r.loadDate ? new Date(r.loadDate).toLocaleDateString('es-AR') : '—',
        },
        {
          header: 'kg',
          align: 'right',
          render: (r: AnyRecord) => (r.kg ? Number(r.kg).toLocaleString('es-AR') : '—'),
        },
      ],
    },
    {
      title: 'Stock maní calibrado por calibre',
      icon: 'Package',
      data: stockCalibrado,
      emptyMessage: 'Sin producción registrada',
      columns: [
        { header: 'Calibre', render: (r: AnyRecord) => String(r.caliber) },
        {
          header: 'kg',
          align: 'right',
          render: (r: AnyRecord) => Number(r.kg).toLocaleString('es-AR'),
        },
        { header: '%', align: 'right', render: (r: AnyRecord) => `${String(r.pct)}%` },
      ],
    },
    {
      title: 'Stock insumos',
      icon: 'Boxes',
      data: stockInsumos,
      emptyMessage: 'Sin movimientos de insumos',
      columns: [
        { header: 'Insumo', render: (r: AnyRecord) => String(r.supplyType) },
        {
          header: 'Cantidad',
          align: 'right',
          render: (r: AnyRecord) => {
            const qty = Number(r.quantity);
            const isNegative = qty < 0;
            return React.createElement(
              'span',
              { className: isNegative ? 'text-cg-danger font-semibold' : '' },
              qty.toLocaleString('es-AR')
            );
          },
        },
      ],
    },
  ];
}

/**
 * Muestra un resumen contextual con actividad relevante del período.
 */
function computeSubtitle(repos: RepoData): string {
  const parts: string[] = [];

  const cartasPendientes = repos.receipts.filter((r: AnyRecord) => r.status === 'pending').length;
  if (cartasPendientes > 0)
    parts.push(
      `${cartasPendientes} carta${cartasPendientes !== 1 ? 's' : ''} pendiente${cartasPendientes !== 1 ? 's' : ''}`
    );

  const pedidosPendientes = repos.orders.filter((o: AnyRecord) => !o.delivered).length;
  if (pedidosPendientes > 0)
    parts.push(`${pedidosPendientes} pedido${pedidosPendientes !== 1 ? 's' : ''} sin entregar`);

  const facturasSinCobrar = repos.invoices.filter((inv: AnyRecord) => !inv.paid).length;
  if (facturasSinCobrar > 0)
    parts.push(`${facturasSinCobrar} factura${facturasSinCobrar !== 1 ? 's' : ''} sin cobrar`);

  return parts.length > 0 ? parts.join(' · ') : 'Sin actividad pendiente';
}

// ════════════════════════════════════════════════════════════════════════════
// ZONA FIJA — NO editar (layout con componentes host)
// ════════════════════════════════════════════════════════════════════════════

const formatDateLong = (d: Date): string =>
  d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

/** Renderiza una tabla dentro de un widget Card */
function WidgetCard({ config }: { config: WidgetConfig }) {
  return React.createElement(
    UI.Card,
    null,
    React.createElement(
      UI.CardHeader,
      null,
      React.createElement(
        UI.CardTitle,
        { className: 'flex items-center gap-2' },
        React.createElement(UI.DynamicIcon, { icon: config.icon, size: 16 }),
        config.title,
        config.data.length > 0 &&
          React.createElement(
            UI.Badge,
            { variant: 'secondary', size: 'sm' },
            String(config.data.length)
          )
      )
    ),
    React.createElement(
      UI.CardBody,
      null,
      config.data.length === 0
        ? React.createElement(UI.EmptyState, {
            icon: React.createElement(UI.DynamicIcon, {
              icon: 'Inbox',
              size: 24,
              className: 'text-cg-text-muted',
            }),
            title: config.emptyMessage,
          })
        : React.createElement(
            UI.Table,
            null,
            React.createElement(
              UI.TableHeader,
              null,
              React.createElement(
                UI.TableRow,
                null,
                ...config.columns.map((col, i) =>
                  React.createElement(
                    UI.TableHead,
                    { key: i, className: col.align === 'right' ? 'text-right' : '' },
                    col.header
                  )
                )
              )
            ),
            React.createElement(
              UI.TableBody,
              null,
              ...config.data.slice(0, 5).map((row: AnyRecord, idx: number) =>
                React.createElement(
                  UI.TableRow,
                  { key: String(row.id ?? idx) },
                  ...config.columns.map((col, i) => {
                    const content = col.render(row);
                    return React.createElement(
                      UI.TableCell,
                      { key: i, className: col.align === 'right' ? 'text-right' : '' },
                      col.badge && content
                        ? React.createElement(UI.Badge, { variant: 'default', size: 'sm' }, content)
                        : (content ?? '—')
                    );
                  })
                )
              )
            )
          )
    )
  );
}

export function DashboardView() {
  usePlugin();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [receipts, setReceipts] = useState<AnyRecord[]>([]);
  const [productionbatches, setProductionbatches] = useState<AnyRecord[]>([]);
  const [supplymovements, setSupplymovements] = useState<AnyRecord[]>([]);
  const [orders, setOrders] = useState<AnyRecord[]>([]);
  const [invoices, setInvoices] = useState<AnyRecord[]>([]);
  const [contacts, setContacts] = useState<AnyRecord[]>([]);

  const { sections: contributedSections } = useViewContributions('kit-granos.dashboard.open', {});

  const getContactName = (id: string): string => {
    const found = contacts.find((c) => String(c.id) === id);
    return found ? String(found.name ?? id) : id;
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all([
          actions.execute<AnyRecord[]>('granos-recepciones.receipts.list').catch(() => []),
          actions.execute<AnyRecord[]>('granos-produccion.production-batches.list').catch(() => []),
          actions.execute<AnyRecord[]>('granos-produccion.supply-movements.list').catch(() => []),
          actions.execute<AnyRecord[]>('granos-comercial.orders.list').catch(() => []),
          actions.execute<AnyRecord[]>('granos-comercial.invoices.list').catch(() => []),
          actions.execute<AnyRecord[]>('contacts.list').catch(() => []),
        ]);
        if (!cancelled) setReceipts(Array.isArray(results[0]) ? (results[0] as AnyRecord[]) : []);
        if (!cancelled)
          setProductionbatches(Array.isArray(results[1]) ? (results[1] as AnyRecord[]) : []);
        if (!cancelled)
          setSupplymovements(Array.isArray(results[2]) ? (results[2] as AnyRecord[]) : []);
        if (!cancelled) setOrders(Array.isArray(results[3]) ? (results[3] as AnyRecord[]) : []);
        if (!cancelled) setInvoices(Array.isArray(results[4]) ? (results[4] as AnyRecord[]) : []);
        if (!cancelled) setContacts(Array.isArray(results[5]) ? (results[5] as AnyRecord[]) : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error cargando datos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  // Construir objeto de repos para pasar a las funciones editables
  const repos: RepoData = useMemo(
    () => ({
      receipts,
      productionbatches,
      supplymovements,
      orders,
      invoices,
    }),
    [receipts, productionbatches, supplymovements, orders, invoices]
  );

  const statsConfig = useMemo(() => computeStats(repos), [repos]);
  const widgetsConfig = useMemo(() => computeWidgets(repos, getContactName), [repos, contacts]);
  const subtitle = useMemo(() => computeSubtitle(repos), [repos]);

  if (error) {
    return React.createElement(UI.ErrorDisplay, {
      title: 'Error',
      message: error,
      onRetry: () => setRetryCount((c: number) => c + 1),
    });
  }

  if (loading) {
    return React.createElement(
      'div',
      { className: 'min-h-screen bg-cg-bg-secondary p-6' },
      React.createElement(UI.LoadingOverlay, { variant: 'skeleton', rows: 8 })
    );
  }

  return React.createElement(
    'div',
    { className: 'p-6 min-h-screen bg-cg-bg-secondary font-sans' },
    React.createElement(
      'div',
      { className: 'max-w-7xl mx-auto flex flex-col gap-6' },

      // ── Header ──
      React.createElement(
        'header',
        { className: 'flex items-center justify-between' },
        React.createElement(
          'div',
          null,
          React.createElement(
            'h1',
            { className: 'text-2xl font-bold text-cg-text capitalize' },
            formatDateLong(new Date())
          ),
          React.createElement('p', { className: 'text-sm text-cg-text-muted mt-1' }, subtitle)
        )
      ),

      // ── KPI Cards ──
      React.createElement(
        'div',
        { className: 'grid grid-cols-3 gap-4' },
        ...statsConfig.map((stat, i) =>
          React.createElement(UI.StatCard, {
            key: i,
            label: stat.label,
            value: stat.value,
            icon: React.createElement(UI.DynamicIcon, {
              icon: stat.icon,
              size: 24,
              className: stat.variant === 'brand' ? 'text-cg-text' : undefined,
            }),
            variant: stat.variant,
            footer: stat.footer
              ? React.createElement(
                  'span',
                  { className: 'text-xs text-cg-text-muted' },
                  stat.footer
                )
              : undefined,
          })
        )
      ),

      // ── Widgets ──
      React.createElement(
        'div',
        { className: 'grid grid-cols-1 gap-6' },
        ...widgetsConfig.map((config, i) => React.createElement(WidgetCard, { key: i, config }))
      ),

      // ── Secciones contribuidas ──
      ...contributedSections.map((s: any, i: number) =>
        React.createElement('div', { key: `contrib-${i}` }, s.render())
      )
    )
  );
}
