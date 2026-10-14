import { ImageOff, Leaf, Search } from 'lucide-react';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { forwardRef, useMemo, useState } from 'react';
import { productImageUrl } from '../../api/storage';
import type { Category, Product } from '../../api/types';
import { shake } from '../../components/motion';
import { cx } from '../../components/ui';
import { formatCents } from '../../lib/money';

type Bump = { id: number; productId: string };

export const ProductGrid = forwardRef<
  HTMLInputElement,
  {
    products: Product[];
    categories: Category[];
    inCart: (id: string) => number;
    onAdd: (p: Product) => boolean;
    training: boolean;
  }
>(function ProductGrid({ products, categories, inCart, onAdd, training }, searchRef) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | 'all'>('all');
  const [bumps, setBumps] = useState<Bump[]>([]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        (cat === 'all' || p.category_id === cat) &&
        (!needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle) || p.upc?.includes(needle)),
    );
  }, [products, q, cat]);

  const usedCats = categories.filter((c) => products.some((p) => p.category_id === c.id));

  const tap = (p: Product) => {
    if (onAdd(p)) {
      const id = Date.now() + Math.random();
      setBumps((b) => [...b, { id, productId: p.id }]);
      setTimeout(() => setBumps((b) => b.filter((x) => x.id !== id)), 700);
      return true;
    }
    return false;
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && shown.length === 1) {
              tap(shown[0]);
              setQ('');
            }
          }}
          placeholder="Search or scan…"
          className="input h-11 pl-9 text-base"
          aria-label="Search products"
        />
      </div>
      {usedCats.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[{ id: 'all', name: 'All' } as Category, ...usedCats].map((c) => (
            <motion.button
              key={c.id}
              whileTap={{ scale: 0.94 }}
              onClick={() => setCat(c.id)}
              className={cx(
                'relative whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold',
                cat === c.id ? 'border-navy text-on-navy' : 'border-rule-2 bg-paper text-ink hover:border-navy',
              )}
            >
              {cat === c.id && <motion.span layoutId="cat-chip" className="absolute inset-0 rounded-full bg-navy" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
              <span className="relative">{c.name}</span>
            </motion.button>
          ))}
        </div>
      )}
      <motion.div
        layout
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4"
        initial="initial"
        animate="animate"
        variants={{ animate: { transition: { staggerChildren: 0.02 } } }}
      >
        <AnimatePresence mode="popLayout">
          {shown.map((p) => (
            <Tile key={p.id} product={p} left={p.on_hand - inCart(p.id)} onTap={() => tap(p)} bumps={bumps.filter((b) => b.productId === p.id)} training={training} />
          ))}
        </AnimatePresence>
      </motion.div>
      {shown.length === 0 && <p className="py-10 text-center text-ink-3">No items match “{q}”.</p>}
    </div>
  );
});

function Tile({ product, left, onTap, bumps, training }: { product: Product; left: number; onTap: () => boolean; bumps: Bump[]; training: boolean }) {
  const controls = useAnimationControls();
  const soldOut = product.on_hand <= 0 && !training;
  const img = productImageUrl(product.image_path);
  return (
    <motion.div
      layout
      variants={{ initial: { opacity: 0, y: 10, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 } }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
    <motion.button
      animate={controls}
      whileHover={soldOut ? undefined : { y: -3, boxShadow: 'var(--shadow-lift)' }}
      whileTap={soldOut ? undefined : { scale: 0.95 }}
      onClick={() => {
        if (!onTap()) void controls.start(shake);
      }}
      aria-disabled={soldOut}
      aria-label={`${product.name}, ${formatCents(product.price_cents)}${soldOut ? ', sold out' : ''}`}
      className={cx(
        'relative flex h-full min-h-[7.5rem] w-full flex-col overflow-hidden rounded-xl border bg-paper text-left shadow-card',
        soldOut ? 'cursor-not-allowed border-rule opacity-45 grayscale' : 'border-rule',
      )}
    >
      <div className="relative h-16 w-full bg-field">
        {img ? (
          <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-ink-3">
            <ImageOff className="size-5 opacity-50" />
          </div>
        )}
        {product.smart_snack && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-good-soft p-1 text-good" title="Smart Snack">
            <Leaf className="size-3" />
          </span>
        )}
        <span
          className={cx(
            'num absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
            soldOut ? 'bg-bad text-white' : left <= product.low_stock_alert ? 'bg-warn-soft text-warn' : 'bg-paper/90 text-ink-2',
          )}
        >
          {soldOut ? 'Sold out' : left}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-1 p-2.5">
        <span className="line-clamp-2 text-[13.5px] font-semibold leading-tight">{product.name}</span>
        <span className="num text-[15px] font-semibold text-navy">{formatCents(product.price_cents)}</span>
      </div>
      <AnimatePresence>
        {bumps.map((b) => (
          <motion.span
            key={b.id}
            initial={{ opacity: 1, y: 0, scale: 0.6 }}
            animate={{ opacity: 0, y: -46, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
            className="num pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 rounded-full bg-navy px-2 py-0.5 text-sm font-bold text-on-navy shadow-lift"
          >
            +1
          </motion.span>
        ))}
      </AnimatePresence>
    </motion.button>
    </motion.div>
  );
}
