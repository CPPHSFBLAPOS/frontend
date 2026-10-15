import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './ui';

// A dialog that springs up from the bottom on phones and scales in on wider
// screens, over a fading scrim. Escape and the scrim close it.
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissable?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // Callers pass a new onClose on every render; keep the latest in a ref so
  // focus is saved and restored once per opening, not on every re-render
  // (which would pull focus out of the dialog mid-typing).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
      first?.focus();
    }, 60);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
      prev?.focus?.();
    };
  }, [open, dismissable]);

  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' }[size];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" initial="closed" animate="open" exit="closed">
          <motion.div
            className="absolute inset-0 bg-scrim backdrop-blur-[2px]"
            variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }}
            transition={{ duration: 0.2 }}
            onClick={() => dismissable && onClose()}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            variants={{
              open: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 32 } },
              closed: { opacity: 0, y: 40, scale: 0.97, transition: { duration: 0.16 } },
            }}
            className={cx(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-rule bg-paper shadow-lift sm:rounded-2xl',
              width,
            )}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-rule-2 sm:hidden" aria-hidden />
            <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
              <div className="min-w-0">
                <h2 id={titleId} className="display text-xl font-bold leading-tight">
                  {title}
                </h2>
                {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
              </div>
              {dismissable && (
                <motion.button
                  data-close
                  whileTap={{ scale: 0.9, rotate: 90 }}
                  onClick={onClose}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-field hover:text-ink"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </motion.button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-rule bg-field/60 px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
