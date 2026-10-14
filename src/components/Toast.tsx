import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Tone = 'good' | 'bad' | 'info';
type Toast = { id: number; tone: Tone; title: string; body?: string };

const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const push = useContext(ToastContext);
  return useMemo(
    () => ({
      good: (title: string, body?: string) => push({ tone: 'good', title, body }),
      bad: (title: string, body?: string) => push({ tone: 'bad', title, body }),
      info: (title: string, body?: string) => push({ tone: 'info', title, body }),
      error: (err: unknown) => push({ tone: 'bad', title: err instanceof Error ? err.message : String(err) }),
    }),
    [push],
  );
}

const icons = { good: CheckCircle2, bad: AlertTriangle, info: Info };
const colors = { good: 'text-good', bad: 'text-bad', info: 'text-navy' };
const DURATION = 4.2;
const PHONE = '(max-width: 639px)';

// On a phone the register's checkout bar sits at the bottom of the screen, so
// toasts drop in from the top there instead of covering it.
function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia?.(PHONE).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE);
    if (!mq) return;
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

// Toasts spring in from the bottom (the top on phones), stack, and shrink a
// progress line while they wait to leave.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const phone = usePhone();
  const from = phone ? -24 : 24;
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), DURATION * 1000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className={`pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 ${
          phone ? 'top-[calc(12px+env(safe-area-inset-top))]' : 'bottom-[calc(16px+env(safe-area-inset-bottom))]'
        }`}
        aria-live="polite"
        role="status"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = icons[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: from, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 30 } }}
                exit={{ opacity: 0, y: from / 2, scale: 0.95, transition: { duration: 0.15 } }}
                className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-xl border border-rule bg-ink text-paper shadow-lift"
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  <Icon className={`mt-0.5 size-5 shrink-0 ${colors[t.tone]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{t.title}</p>
                    {t.body && <p className="mt-0.5 text-[13px] opacity-80">{t.body}</p>}
                  </div>
                  <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
                    <X className="size-4" />
                  </button>
                </div>
                <motion.div
                  className={`absolute bottom-0 left-0 h-0.5 ${t.tone === 'bad' ? 'bg-bad' : t.tone === 'good' ? 'bg-good' : 'bg-gold'}`}
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: DURATION, ease: 'linear' }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
