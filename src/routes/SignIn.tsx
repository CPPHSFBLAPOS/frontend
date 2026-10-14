import { ArrowLeft, ArrowRight, Mail } from 'lucide-react';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from 'react';
import { sendCode, verifyCode } from '../api/auth';
import { shake, spring } from '../components/motion';
import { Button, Field, Input, cx } from '../components/ui';

// Supabase sends 6-digit codes by default, but the hosted project's "Email
// OTP length" setting can make them up to 10. Accept anything from 6 to 10
// digits; VITE_OTP_LENGTH (default 6) only says which length a paste or
// autofill may send without pressing Continue.
const MIN_CODE = 6;
const MAX_CODE = 10;
const envLength = Number(import.meta.env.VITE_OTP_LENGTH ?? MIN_CODE);
const OTP_LENGTH = Number.isInteger(envLength) && envLength >= MIN_CODE && envLength <= MAX_CODE ? envLength : MIN_CODE;

const digitsOnly = (text: string) => text.replace(/\D/g, '');

// Sign in with a one-time code emailed to a school address.
export function SignIn() {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeBox = useRef<HTMLInputElement>(null);
  const controls = useAnimationControls();
  const ready = code.length >= MIN_CODE && code.length <= MAX_CODE;

  const fail = (err: unknown) => {
    setError(err instanceof Error ? err.message : String(err));
    void controls.start(shake);
  };

  const submitEmail = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendCode(email);
      setCode('');
      setStep('code');
      setTimeout(() => codeBox.current?.focus(), 250);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (value: string) => {
    if (busy || value.length < MIN_CODE || value.length > MAX_CODE) return;
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email, value);
    } catch (err) {
      fail(err);
      setCode('');
      codeBox.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const onCodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = digitsOnly(e.target.value).slice(0, MAX_CODE);
    const wasEmpty = code === '';
    setCode(next);
    // An autofilled code (the iOS keyboard's "From Messages/Mail"
    // suggestion, a password manager) arrives all at once without a typing
    // inputType. Send it when it is exactly the expected length.
    const inputType = (e.nativeEvent as InputEvent).inputType;
    if (wasEmpty && (!inputType || inputType === 'insertReplacementText') && next.length === OTP_LENGTH) void submitCode(next);
  };

  // A pasted code keeps up to 10 digits (spaces and dashes dropped). It is
  // sent straight away only when it is exactly VITE_OTP_LENGTH long; any
  // other length waits for Enter or Continue.
  const onCodePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = digitsOnly(e.clipboardData.getData('text'));
    if (pasted.length < MIN_CODE) return;
    e.preventDefault();
    const next = pasted.slice(0, MAX_CODE);
    setCode(next);
    if (pasted.length === OTP_LENGTH) void submitCode(next);
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
                  <p className="mt-1 text-ink-2">We'll email a sign-in code to your school address.</p>
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
              <motion.form
                key="code"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitCode(code);
                }}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="grid gap-5"
              >
                <div>
                  <button type="button" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink" onClick={() => setStep('email')}>
                    <ArrowLeft className="size-4" /> Different email
                  </button>
                  <h2 className="display text-3xl font-extrabold">Check your email</h2>
                  <p className="mt-1 text-ink-2">
                    Enter the code from your email. We sent it to <b className="text-ink">{email}</b>.
                  </p>
                </div>
                <Field label="Code from your email" hint="Type or paste every digit, then press Enter.">
                  <motion.span
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                    className="relative block rounded-xl"
                  >
                    <input
                      ref={codeBox}
                      value={code}
                      onChange={onCodeChange}
                      onPaste={onCodePaste}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                      enterKeyHint="go"
                      maxLength={MAX_CODE}
                      readOnly={busy}
                      aria-busy={busy}
                      spellCheck={false}
                      placeholder="••••••"
                      className="num h-16 w-full rounded-xl border border-rule-2 bg-field px-4 indent-[0.4em] text-center text-3xl font-semibold tracking-[0.4em] placeholder:text-ink-3/50 focus:border-navy focus:outline-none focus:ring-4 focus:ring-navy/20"
                    />
                    {/* Fills as digits go in; full (and green) once there are enough to send.
                        Only the bar is clipped, so the input's focus ring stays visible. */}
                    <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-xl">
                      <motion.span
                        className={cx('block h-full w-full origin-left transition-colors', ready ? 'bg-good' : 'bg-navy')}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: Math.min(code.length / MIN_CODE, 1) }}
                        transition={spring}
                      />
                    </span>
                  </motion.span>
                </Field>
                {error && <p className="text-sm font-medium text-bad">{error}</p>}
                <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!ready} icon={<ArrowRight className="size-4" />}>
                  Continue
                </Button>
                <Button type="button" variant="ghost" onClick={() => void submitEmail()} disabled={busy}>
                  Send a new code
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
