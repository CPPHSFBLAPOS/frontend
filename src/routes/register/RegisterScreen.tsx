import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, CloudOff, GraduationCap, HandCoins, Lock, MoreHorizontal, RefreshCw, Undo2, WifiOff } from 'lucide-react';
import { AnimatePresence, motion, useInView } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { completeSale, shiftSummary, type SalePayload } from '../../api/register';
import type { Product, Shift } from '../../api/types';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { Button, Card, Kbd, Pill, cx } from '../../components/ui';
import { useCategories, useDirectory, useProducts } from '../../hooks/queries';
import { useOnline } from '../../hooks/useOnline';
import { formatTime } from '../../lib/dates';
import { enqueueSale, flushQueue, isNetworkError, moveSaleToShift, queuedForShift, queuedSales, removeSale, retrySale, type QueuedSale } from '../../lib/offline';
import { printGiftCards } from '../../lib/printCard';
import { createScanDetector } from '../../lib/scanner';
import { addLoad, addProduct, emptyCart, qtyInCart, toLinesInput, totals, type Cart } from './cart';
import { CartPanel } from './CartPanel';
import { FailedSales } from './FailedSales';
import { OutagePanel } from './OutagePanel';
import { PaymentModal } from './PaymentModal';
import { ProductGrid } from './ProductGrid';
import { SaleDone, type DoneInfo } from './SaleDone';
import { CloseShiftModal, GiftLoadModal, HandoffModal, VoidRefundModal } from './ShiftModals';

type Panel = 'sell' | 'outage';

export function RegisterScreen({ shift, onClosed, onSwitch }: { shift: Shift; onClosed: () => void; onSwitch: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const products = useProducts();
  const categories = useCategories();
  const directory = useDirectory();
  const summary = useQuery({ queryKey: ['shift', shift.id], queryFn: () => shiftSummary(shift.id), refetchInterval: 60_000 });

  const [cart, setCart] = useState<Cart>(emptyCart());
  const [paying, setPaying] = useState(false);
  const [payKey, setPayKey] = useState(0);
  const [done, setDone] = useState<DoneInfo | null>(null);
  const [modal, setModal] = useState<'load' | 'void' | 'handoff' | 'close' | null>(null);
  const [menu, setMenu] = useState(false);
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const search = useRef<HTMLInputElement>(null);
  const cartBox = useRef<HTMLDivElement>(null);
  const cartInView = useInView(cartBox, { amount: 0.2 });
  const panel: Panel = params.get('tab') === 'outage' ? 'outage' : 'sell';

  const list = products.data ?? [];

  const refreshQueue = useCallback(() => void queuedSales().then(setQueue), []);
  useEffect(refreshQueue, [refreshQueue]);

  // Send waiting sales when the connection comes back, and every 30 seconds.
  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    const r = await flushQueue((payload) => completeSale(payload as SalePayload));
    if (r.sent) {
      toast.good(`Sent ${r.sent} offline sale${r.sent === 1 ? '' : 's'}`);
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['shift', shift.id] });
    }
    if (r.rejected) toast.bad(`${r.rejected} offline sale${r.rejected === 1 ? '' : 's'} could not be saved`, 'They are listed above the register with the reason.');
    refreshQueue();
  }, [qc, refreshQueue, shift.id, toast]);
  useEffect(() => {
    if (online) void flush();
    const t = setInterval(() => void flush(), 30_000);
    return () => clearInterval(t);
  }, [online, flush]);

  const add = useCallback(
    (p: Product) => {
      const next = addProduct(cart, p);
      if (!next) {
        toast.bad(`${p.name} is out of stock`);
        return false;
      }
      setCart(next);
      return true;
    },
    [cart, toast],
  );

  // USB scanner: a fast burst of keys ending in Enter, anywhere on the screen.
  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  }, [add]);
  useEffect(() => {
    const detector = createScanDetector({
      onScan: (code) => {
        const p = (products.data ?? []).find((x) => x.upc === code || x.sku.toLowerCase() === code.toLowerCase());
        if (p) addRef.current(p);
        else toast.bad(`No item with barcode ${code}`, 'Add the UPC to the product in Inventory.');
        if (search.current) search.current.value = '';
      },
    });
    const onKey = (e: KeyboardEvent) => {
      if (paying || modal) return;
      if (detector.key(e.key, e.timeStamp)) e.preventDefault();
      if (e.key === 'F2') {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [products.data, toast, paying, modal]);

  const sell = useMutation({
    mutationFn: async ({ payload }: { payload: SalePayload; change: number }) => {
      try {
        return { result: await completeSale(payload), offline: false };
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueueSale({
            client_uuid: payload.p_client_uuid,
            queued_at: new Date().toISOString(),
            payload,
            summary: { total_cents: totals(cart).total, items: totals(cart).items },
          });
          return { result: null, offline: true };
        }
        throw err;
      }
    },
    onSuccess: ({ result, offline }, { change }) => {
      setDone({
        number: result?.sale.number ?? null,
        total: result?.sale.total_cents ?? totals(cart).total,
        change: result?.change_cents ?? change,
        training: cart.type === 'training',
        offline,
        newCards: result?.new_cards ?? [],
      });
      setPaying(false);
      setCart(emptyCart(cart.type === 'training' ? 'training' : 'regular'));
      refreshQueue();
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['shift', shift.id] });
    },
    onError: toast.error,
  });

  const training = cart.type === 'training';
  const waiting = queue.filter((q) => !q.error).length;
  const failed = queue.filter((q) => q.error);
  // Any queued sale (waiting or rejected) on this shift keeps it open: the
  // drawer count would not match until the sale is saved or dismissed.
  const queuedHere = queuedForShift(queue, shift.id);
  const onThisShift = queuedHere.length;
  const rejectedHere = queuedHere.filter((q) => q.error).length;
  const waitingHere = onThisShift - rejectedHere;
  const plural = (n: number) => (n === 1 ? '' : 's');
  const closeHint = rejectedHere
    ? `${rejectedHere} sale${plural(rejectedHere)} on this shift could not be saved. Retry or dismiss ${rejectedHere === 1 ? 'it' : 'them'} first.`
    : waitingHere
      ? `${waitingHere} sale${plural(waitingHere)} on this shift ${waitingHere === 1 ? 'is' : 'are'} still waiting to send. ${waitingHere === 1 ? 'It goes' : 'They go'} out when the server answers.`
      : !online
        ? 'Needs a connection.'
        : undefined;

  const retryFailed = async (sale: QueuedSale) => {
    await retrySale(sale);
    refreshQueue();
    await flush();
  };
  const moveFailedHere = async (sale: QueuedSale) => {
    await moveSaleToShift(sale, shift.id);
    refreshQueue();
    await flush();
  };
  const dismissFailed = async (sale: QueuedSale) => {
    await removeSale(sale.client_uuid);
    refreshQueue();
  };

  return (
    <div className="pt-4">
      <AnimatePresence>
        {training && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="training-stripes mb-3 overflow-hidden rounded-xl border border-gold"
          >
            <p className="flex items-center justify-center gap-2 py-2 text-sm font-bold uppercase tracking-wider text-warn">
              <GraduationCap className="size-4" /> Training mode: nothing touches stock, cash or reports
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Shift #{shift.number} · since {formatTime(shift.opened_at)}</p>
          <h1 className="display text-2xl font-extrabold leading-tight">{shift.cashier_name}</h1>
        </div>
        <div className="ml-2 hidden items-baseline gap-1.5 rounded-lg bg-paper px-3 py-1.5 shadow-card sm:flex">
          <span className="text-xs text-ink-3">Drawer</span>
          <AnimatedNumber value={summary.data?.expected_cash_cents ?? shift.expected_cash_cents} className="num font-semibold" />
        </div>
        <AnimatePresence>
          {(waiting > 0 || !online) && (
            <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}>
              <Pill tone="warn">
                {online ? <CloudOff className="size-3.5" /> : <WifiOff className="size-3.5" />}
                {online ? '' : waiting ? 'Offline, ' : 'Offline'}
                {waiting > 0 && `${waiting} sale${waiting === 1 ? '' : 's'} waiting`}
              </Pill>
            </motion.span>
          )}
        </AnimatePresence>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<Undo2 className="size-3.5" />} onClick={() => setModal('void')} disabled={!online}>
            Void / refund
          </Button>
          <div className="relative">
            <Button size="sm" icon={<MoreHorizontal className="size-4" />} onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
              Shift
            </Button>
            <AnimatePresence>
              {menu && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                  className="absolute right-0 top-full z-30 mt-1.5 w-56 origin-top-right overflow-hidden rounded-xl border border-rule bg-paper p-1 shadow-lift"
                  onClick={() => setMenu(false)}
                >
                  <MenuItem icon={HandCoins} label="Cash handoff" onClick={() => setModal('handoff')} disabled={!online} />
                  <MenuItem icon={RefreshCw} label={panel === 'outage' ? 'Back to selling' : 'Outage entry'} onClick={() => setParams(panel === 'outage' ? {} : { tab: 'outage' })} />
                  <MenuItem icon={ArrowLeftRight} label="Switch shift" onClick={onSwitch} />
                  <MenuItem icon={Lock} label="Close shift" onClick={() => setModal('close')} disabled={!online || onThisShift > 0} hint={closeHint} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <Tabs
        className="mb-4"
        tabs={[
          { id: 'sell' as const, label: 'Sell' },
          { id: 'outage' as const, label: 'Outage entry' },
        ]}
        value={panel}
        onChange={(t) => setParams(t === 'outage' ? { tab: 'outage' } : {})}
      />

      <AnimatePresence>
        {failed.length > 0 && (
          <FailedSales
            sales={failed}
            products={list}
            shift={shift}
            blocksClose={failed.some((f) => f.payload.p_shift_id === shift.id)}
            onRetry={retryFailed}
            onMoveHere={moveFailedHere}
            onDismiss={dismissFailed}
          />
        )}
      </AnimatePresence>

      {panel === 'outage' ? (
        <OutagePanel products={list} shift={shift} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <ProductGrid ref={search} products={list} categories={categories.data ?? []} inCart={(id) => qtyInCart(cart, id)} onAdd={add} training={training} />
            <p className="mt-4 hidden items-center gap-2 text-xs text-ink-3 lg:flex">
              Scan a barcode anywhere on this screen. <Kbd>F2</Kbd> jumps to search; <Kbd>Enter</Kbd> adds the only match.
            </p>
          </div>
          <div ref={cartBox} id="cart" className="scroll-mt-20 lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)]">
          <Card className={cx('flex h-full flex-col overflow-hidden', training && 'border-gold')}>
            <CartPanel
              cart={cart}
              onChange={setCart}
              online={online}
              onAddLoad={() => setModal('load')}
              onPay={() => {
                setPayKey((k) => k + 1);
                setPaying(true);
              }}
            />
          </Card>
          </div>
        </div>
      )}

      {/* Phones: the cart is below the grid, so a bar slides up with the total. */}
      <AnimatePresence>
        {panel === 'sell' && cart.lines.length > 0 && !cartInView && (
          <motion.button
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={() => document.getElementById('cart')?.scrollIntoView({ behavior: 'smooth' })}
            className="fixed inset-x-4 bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 flex items-center justify-between rounded-2xl bg-navy px-5 py-3.5 text-on-navy shadow-lift lg:hidden"
          >
            <span className="font-semibold">
              Cart · <motion.span key={totals(cart).items} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="num inline-block">{totals(cart).items}</motion.span> item{totals(cart).items === 1 ? '' : 's'}
            </span>
            <AnimatedNumber value={totals(cart).total} duration={0.3} className="num text-lg font-semibold" />
          </motion.button>
        )}
      </AnimatePresence>
      <PaymentModal
        key={payKey}
        open={paying}
        onClose={() => setPaying(false)}
        cart={cart}
        online={online}
        busy={sell.isPending}
        onComplete={(s, cashGiven) => {
          const hasCards = s.payments.some((p) => p.method !== 'cash') || cart.lines.some((l) => l.kind === 'gift_card_load');
          if (!online && hasCards) {
            toast.bad('Gift cards need a connection', 'Take cash, or wait until the connection is back.');
            return;
          }
          sell.mutate({
            payload: {
              p_client_uuid: crypto.randomUUID(),
              p_shift_id: shift.id,
              p_type: cart.type,
              p_lines: toLinesInput(cart),
              p_payments: s.payments,
              p_cash_tendered_cents: s.cashDue > 0 ? cashGiven : null,
              p_note: cart.note.trim() || null,
              p_reason: cart.reason.trim() || null,
            },
            change: s.change,
          });
        }}
      />
      <SaleDone
        info={done}
        onDismiss={() => {
          setDone(null);
          search.current?.focus();
        }}
        onPrintCard={(code) => void printGiftCards([{ code, type: 'paid' }]).catch(toast.error)}
      />
      <GiftLoadModal open={modal === 'load'} onClose={() => setModal(null)} onAdd={(amount, code) => setCart((c) => addLoad(c, amount, code))} />
      <VoidRefundModal open={modal === 'void'} onClose={() => setModal(null)} shift={shift} directory={directory.data ?? []} />
      <HandoffModal open={modal === 'handoff'} onClose={() => setModal(null)} shift={shift} directory={directory.data ?? []} />
      <CloseShiftModal open={modal === 'close'} onClose={() => setModal(null)} shift={shift} directory={directory.data ?? []} onClosed={onClosed} />
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, disabled, hint }: { icon: typeof Lock; label: string; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? hint : undefined}
      className="group flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-field disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-3 group-disabled:opacity-40" />
      <span className="grid">
        <span className="group-disabled:opacity-40">{label}</span>
        {disabled && hint && <span className="text-xs font-normal text-ink-2">{hint}</span>}
      </span>
    </button>
  );
}
