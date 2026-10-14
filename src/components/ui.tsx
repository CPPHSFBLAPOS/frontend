import { Loader2 } from 'lucide-react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { snappy } from './motion';

// eslint-disable-next-line react-refresh/only-export-components
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type ButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
};

const variants = {
  primary: 'bg-navy text-on-navy border-navy hover:brightness-110',
  secondary: 'bg-paper text-ink border-rule-2 hover:border-ink-2',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-field hover:text-ink',
  danger: 'bg-bad text-white border-bad hover:brightness-110',
  gold: 'bg-gold text-band border-gold hover:brightness-105',
};
const sizes = {
  sm: 'px-3 py-1.5 text-[13px] rounded-md gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-3 text-base rounded-xl gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, children, className, disabled, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileHover={disabled || loading ? undefined : { y: -1 }}
      whileTap={disabled || loading ? undefined : { scale: 0.96 }}
      transition={snappy}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center whitespace-nowrap border font-semibold transition-[filter,border-color,background-color,opacity] disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </motion.button>
  );
});

export function Card({ className, children, ...rest }: HTMLMotionProps<'div'>) {
  return (
    <motion.div className={cx('rounded-xl border border-rule bg-paper shadow-card', className)} {...rest}>
      {children}
    </motion.div>
  );
}

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-ink-3">{hint}</span>}
      {error && <span className="text-xs font-medium text-bad">{error}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('input', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('input appearance-auto', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('input min-h-16 resize-y', className)} {...rest} />;
}

export function MoneyInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative flex items-center">
      <span className="num pointer-events-none absolute left-2.5 text-ink-3">$</span>
      <input inputMode="decimal" className={cx('input num pl-6', className)} {...rest} />
    </div>
  );
}

const tones = {
  neutral: 'bg-field text-ink-2',
  navy: 'bg-navy-soft text-navy',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  gold: 'bg-gold-soft text-warn',
};

export function Pill({ tone = 'neutral', dot = true, children, className }: { tone?: keyof typeof tones; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-ink-3', className)} aria-label="Loading" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('shimmer rounded-md', className)} aria-hidden />;
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-2 px-6 py-12 text-center text-ink-2"
    >
      {icon && (
        <motion.div
          initial={{ scale: 0.6, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 14 }}
          className="mb-1 grid size-12 place-items-center rounded-2xl bg-navy-soft text-navy"
        >
          {icon}
        </motion.div>
      )}
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="max-w-sm text-sm">{children}</div>}
    </motion.div>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-5 pt-7">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="display text-[clamp(28px,4.2vw,40px)] font-extrabold leading-none text-balance">{title}</h1>
        {children && <div className="mt-2 text-ink-2">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <motion.p
      role="alert"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-bad/40 bg-bad-soft px-3 py-2 text-sm text-ink"
    >
      {message}
    </motion.p>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="num rounded border border-rule-2 bg-field px-1.5 py-0.5 text-[11px] text-ink-2">{children}</kbd>;
}
