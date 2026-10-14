import { LayoutGroup, motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { cx } from './ui';

// Tabs with an underline that glides to the selected tab.
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ id: T; label: ReactNode; badge?: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  const group = useId();
  return (
    <LayoutGroup id={group}>
      <div role="tablist" className={cx('flex gap-1 overflow-x-auto border-b border-rule', className)}>
        {tabs.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(t.id)}
              className={cx(
                'relative flex items-center gap-2 whitespace-nowrap px-3.5 pb-2.5 pt-2.5 text-sm font-semibold transition-colors',
                selected ? 'text-ink' : 'text-ink-2 hover:text-ink',
              )}
            >
              {t.label}
              {t.badge}
              {selected && (
                <motion.span
                  layoutId="underline"
                  className="absolute inset-x-1 -bottom-px h-[3px] rounded-full bg-navy"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

// A segmented control with a sliding thumb (sale type, report ranges).
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: Array<{ id: T; label: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
  size?: 'sm' | 'md';
}) {
  const group = useId();
  return (
    <LayoutGroup id={group}>
      <div className="inline-flex rounded-lg border border-rule bg-field p-0.5" role="radiogroup">
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.id)}
              className={cx(
                'relative rounded-md font-semibold transition-colors',
                size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]',
                on ? 'text-ink' : 'text-ink-2 hover:text-ink',
              )}
            >
              {on && (
                <motion.span
                  layoutId="thumb"
                  className="absolute inset-0 rounded-md border border-rule bg-paper shadow-sm"
                  transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                />
              )}
              <span className="relative">{o.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
