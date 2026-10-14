import { Eraser } from 'lucide-react';
import { motion } from 'motion/react';
import SignaturePadLib from 'signature_pad';
import { useEffect, useMemo, useRef, useState } from 'react';
import { dataUrlToBlob } from '../api/storage';
import type { Stroke } from '../api/types';
import { Modal } from './Modal';
import { Button, Field, Input } from './ui';

export type CapturedSignature = { typed_name: string; strokes: Stroke[]; png: Blob };

// Drawn signature plus a typed name. The date is added by the database.
export function SignatureModal({
  open,
  onClose,
  onSign,
  title,
  subtitle,
  defaultName,
  confirmLabel = 'Sign',
}: {
  open: boolean;
  onClose: () => void;
  onSign: (sig: CapturedSignature) => Promise<void>;
  title: string;
  subtitle?: string;
  defaultName?: string;
  confirmLabel?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePadLib | null>(null);
  const [name, setName] = useState(defaultName ?? '');
  const [empty, setEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = canvas.current;
    if (!el) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    el.width = el.offsetWidth * ratio;
    el.height = el.offsetHeight * ratio;
    el.getContext('2d')?.scale(ratio, ratio);
    const p = new SignaturePadLib(el, {
      penColor: getComputedStyle(document.documentElement).getPropertyValue('--pen').trim() || '#1c3da3',
      minWidth: 0.8,
      maxWidth: 2.4,
    });
    p.addEventListener('endStroke', () => setEmpty(p.isEmpty()));
    pad.current = p;
    return () => p.off();
  }, [open]);

  const submit = async () => {
    const p = pad.current;
    if (!name.trim()) return setError('Type your full name.');
    if (!p || p.isEmpty()) return setError('Draw your signature.');
    setBusy(true);
    setError(null);
    try {
      await onSign({ typed_name: name.trim(), strokes: p.toData() as unknown as Stroke[], png: dataUrlToBlob(p.toDataURL('image/png')) });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <Button
            icon={<Eraser className="size-4" />}
            onClick={() => {
              pad.current?.clear();
              setEmpty(true);
            }}
          >
            Clear
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={empty}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Type your full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <span className="label">Draw your signature</span>
        <div className="relative rounded-lg border border-rule-2 bg-field">
          <canvas ref={canvas} className="block aspect-[3/1] w-full cursor-crosshair touch-none rounded-lg" aria-label="Signature pad" />
          <span className="display pointer-events-none absolute bottom-[calc(24%+2px)] left-3 font-bold text-ink-3">X</span>
          <span className="pointer-events-none absolute bottom-[24%] left-8 right-4 border-b-[1.5px] border-rule-2" />
          {empty && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.35, 0.7, 0.35] }}
              transition={{ duration: 2.4, repeat: Infinity }}
              className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-ink-3"
            >
              Sign here with a finger, stylus or mouse
            </motion.span>
          )}
        </div>
        <p className="text-xs text-ink-3">Today&apos;s date is added for you. Signing records a fingerprint of the form as it is right now.</p>
        {error && <p className="text-sm font-medium text-bad">{error}</p>}
      </div>
    </Modal>
  );
}

// Replays saved strokes as if the pen were writing them.
export function SignatureView({ strokes, className }: { strokes: Stroke[]; className?: string }) {
  const { paths, box } = useMemo(() => {
    const pts = strokes.flatMap((s) => s.points ?? []);
    if (pts.length === 0) return { paths: [] as string[], box: '0 0 10 10' };
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxX = Math.max(...pts.map((p) => p.x));
    const maxY = Math.max(...pts.map((p) => p.y));
    const pad = 6;
    return {
      paths: strokes
        .map((s) => (s.points ?? []).map((p, i) => `${i ? 'L' : 'M'}${(p.x - minX + pad).toFixed(1)} ${(p.y - minY + pad).toFixed(1)}`).join(' '))
        .filter(Boolean),
      box: `0 0 ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`,
    };
  }, [strokes]);

  return (
    <svg viewBox={box} className={className} preserveAspectRatio="xMinYMax meet" aria-label="Signature">
      {paths.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          fill="none"
          stroke="var(--pen)"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ delay: 0.15 + i * 0.25, duration: 0.6, ease: 'easeInOut' }}
        />
      ))}
    </svg>
  );
}
