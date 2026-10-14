import { ArrowLeft, Mail } from 'lucide-react';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { useRef, useState, type FormEvent } from 'react';
import { sendCode, verifyCode } from '../api/auth';
import { shake } from '../components/motion';
import { Button, Field, Input } from '../components/ui';

// Sign in with a one-time code emailed to a school address.
export function SignIn() {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const controls = useAnimationControls();

  const fail = (err: unknown) => {
    setError(err instanceof Error ? err.message : String(err));
    void controls.start(shake);
  };

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendCode(email);
      setStep('code');
      setTimeout(() => boxes.current[0]?.focus(), 250);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email, code);
    } catch (err) {
      fail(err);
      setDigits(['', '', '', '', '', '']);
      boxes.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  const setDigit = (i: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length > 1) {
      // Pasted the whole code.
      const next = clean.slice(0, 6).split('');
      while (next.length < 6) next.push('');
      setDigits(next);
      if (clean.length >= 6) void submitCode(clean.slice(0, 6));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) boxes.current[i + 1]?.focus();
    if (next.every(Boolean)) void submitCode(next.join(''));
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-band text-band-ink lg:block">
        <motion.div
          className="absolute -left-24 top-24 size-96 rounded-full bg-gold/20 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -right-20 bottom-10 size-80 rounded-full bg-navy/40 blur-3xl"
          animate={{ x: [0, -30, 0], y: [0, -40, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="border-b-[3px] border-gold pb-3">
            <b className="display text-lg font-bold tracking-wide">Corning-Painted Post High School FBLA</b>
          </div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.6 }}>
            <p className="eyebrow mb-3 text-band-ink-2">School store</p>
            <h1 className="display text-6xl font-extrabold leading-[0.95]">
              Register. Stock.
              <br />
              Purchasing. Reports.
            </h1>
            <p className="mt-5 max-w-md text-band-ink-2">
              One app for the store: every sale, every count, every Sam's Club pre-auth, logged and signed.
            </p>
          </motion.div>
          <p className="text-xs text-band-ink-2">Only members the Advisor has added can sign in.</p>
        </div>
      </div>

      <div className="grid place-items-center p-6">
        <motion.div animate={controls} className="w-full max-w-sm">
          <AnimatePresence mode="wait">
            {step === 'email' ? (
              <motion.form
                key="email"
                onSubmit={submitEmail}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="grid gap-5"
              >
                <div>
                  <img src="/favicon.svg" alt="" className="mb-5 size-12 rounded-xl lg:hidden" />
                  <h2 className="display text-3xl font-extrabold">Sign in</h2>
                  <p className="mt-1 text-ink-2">We'll email a 6-digit code to your school address.</p>
                </div>
                <Field label="School email">
                  <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@cppasd.com" />
                </Field>
                {error && <p className="text-sm font-medium text-bad">{error}</p>}
                <Button type="submit" variant="primary" size="lg" loading={busy} icon={<Mail className="size-4" />}>
                  Email me a code
                </Button>
              </motion.form>
            ) : (
              <motion.div key="code" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="grid gap-5">
                <div>
                  <button className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink" onClick={() => setStep('email')}>
                    <ArrowLeft className="size-4" /> Different email
                  </button>
                  <h2 className="display text-3xl font-extrabold">Check your email</h2>
                  <p className="mt-1 text-ink-2">
                    Enter the code sent to <b className="text-ink">{email}</b>.
                  </p>
                </div>
                <div className="flex justify-between gap-2" role="group" aria-label="6-digit code">
                  {digits.map((d, i) => (
                    <motion.input
                      key={i}
                      ref={(el) => {
                        boxes.current[i] = el;
                      }}
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: d ? [1.12, 1] : 1 }}
                      transition={{ delay: d ? 0 : i * 0.04, type: 'spring', stiffness: 500, damping: 24 }}
                      value={d}
                      inputMode="numeric"
                      autoComplete={i === 0 ? 'one-time-code' : 'off'}
                      maxLength={6}
                      disabled={busy}
                      aria-label={`Digit ${i + 1}`}
                      onChange={(e) => setDigit(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
                      }}
                      className="num h-14 w-full rounded-xl border border-rule-2 bg-field text-center text-2xl font-semibold focus:border-navy focus:outline-none focus:ring-4 focus:ring-navy/20"
                    />
                  ))}
                </div>
                {error && <p className="text-sm font-medium text-bad">{error}</p>}
                <Button variant="ghost" onClick={(e) => void submitEmail(e as unknown as FormEvent)} disabled={busy}>
                  Send a new code
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
