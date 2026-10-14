import { Delete } from 'lucide-react';
import { motion, useAnimationControls } from 'motion/react';
import { useEffect, useState } from 'react';
import { shake } from './motion';
import { cx } from './ui';

// A 4-digit PIN entry. Works by keyboard or by tapping; the dots fill with
// a little spring and the row shakes on a wrong PIN.
export function PinPad({
  onComplete,
  error,
  disabled,
  label = 'PIN',
}: {
  onComplete: (pin: string) => void;
  error?: string | null;
  disabled?: boolean;
  label?: string;
}) {
  const [pin, setPin] = useState('');
  const controls = useAnimationControls();

  useEffect(() => {
    if (!error) return;
    // Clearing the dots after a wrong PIN is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPin('');
    void controls.start(shake);
  }, [error, controls]);

  const press = (d: string) => {
    if (disabled) return;
    setPin((p) => {
      const next = (p + d).slice(0, 4);
      if (next.length === 4) setTimeout(() => onComplete(next), 90);
      return next;
    });
  };
  const back = () => setPin((p) => p.slice(0, -1));

  return (
    <div
      className="flex flex-col items-center gap-4"
      onKeyDown={(e) => {
        if (/^\d$/.test(e.key)) press(e.key);
        else if (e.key === 'Backspace') back();
      }}
      tabIndex={0}
      aria-label={`${label}: type 4 digits`}
    >
      <motion.div animate={controls} className="flex gap-3" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            animate={{ scale: pin.length > i ? 1 : 0.7, backgroundColor: pin.length > i ? 'var(--navy)' : 'var(--field)' }}
            transition={{ type: 'spring', stiffness: 600, damping: 22 }}
            className="size-4 rounded-full border border-rule-2"
          />
        ))}
      </motion.div>
      {error && <p className="text-sm font-medium text-bad">{error}</p>}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} onClick={() => press(d)} disabled={disabled}>
            {d}
          </Key>
        ))}
        <span />
        <Key onClick={() => press('0')} disabled={disabled}>
          0
        </Key>
        <Key onClick={back} disabled={disabled} label="Delete">
          <Delete className="size-5" />
        </Key>
      </div>
    </div>
  );
}

function Key({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88, backgroundColor: 'var(--navy-soft)' }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cx('num grid size-16 place-items-center rounded-2xl border border-rule bg-paper text-2xl font-medium shadow-card', disabled && 'opacity-50')}
    >
      {children}
    </motion.button>
  );
}
