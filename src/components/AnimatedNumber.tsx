import { animate, useMotionValue, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatCents } from '../lib/money';

const ease = [0.22, 1, 0.36, 1] as const;

function onScreen(el: HTMLElement | null) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
}

// Counts smoothly from the last value to the new one: totals tick up as
// items land in the cart, dashboard numbers roll in when they appear.
// Numbers that start off screen show their real value straight away, so the
// page never shows a stale or zero amount to someone (or something) reading
// it without scrolling.
export function AnimatedNumber({
  value,
  format = (n) => formatCents(n),
  className,
  duration = 0.6,
}: {
  value: number | null | undefined;
  format?: (n: number) => string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const mv = useMotionValue(value ?? 0);
  const [shown, setShown] = useState(value ?? 0);
  const started = useRef(false);

  useEffect(() => mv.on('change', (v) => setShown(v)), [mv]);

  // Layout effect: decide before paint so a counted-up number never flashes
  // its final value first.
  useLayoutEffect(() => {
    if (value === null || value === undefined) return;
    if (reduce || !onScreen(ref.current)) {
      mv.jump(value);
      started.current = true;
      return;
    }
    if (!started.current) {
      mv.jump(0);
      started.current = true;
    }
    const controls = animate(mv, value, { duration, ease });
    return () => controls.stop();
  }, [value, reduce, duration, mv]);

  return (
    <span ref={ref} className={className}>
      {value === null || value === undefined ? '—' : format(Math.round(shown))}
    </span>
  );
}
