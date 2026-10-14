import { rpc } from './rpc';
import { supabase } from './supabase';
import type { Category, MovementType, PriceChange, Product, StockCount, StockCountLine, StockMovement } from './types';

export function listProducts(includeArchived = false): Promise<Product[]> {
  return rpc<Product[]>('catalog', { p_include_archived: includeArchived });
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('*').order('sort_order').order('name');
  if (error) throw new Error(error.message);
  return data as Category[];
}

export type ProductInput = {
  id: string | null;
  name: string;
  category_id: string | null;
  price_cents: number;
  upc: string | null;
  low_stock_alert: number;
  smart_snack: boolean;
  image_path: string | null;
  description: string | null;
};

export function saveProduct(p: ProductInput): Promise<string> {
  return rpc<string>('save_product', {
    p_id: p.id,
    p_name: p.name,
    p_category_id: p.category_id,
    p_price_cents: p.price_cents,
    p_upc: p.upc,
    p_low_stock_alert: p.low_stock_alert,
    p_smart_snack: p.smart_snack,
    p_image_path: p.image_path,
    p_description: p.description,
  });
}

export function archiveProduct(id: string, archive: boolean) {
  return rpc<void>('archive_product', { p_product_id: id, p_archive: archive });
}

export function setProductCost(id: string, costCents: number, reason: string) {
  return rpc<void>('set_product_cost', { p_product_id: id, p_cost_cents: costCents, p_reason: reason });
}

export function saveCategory(c: { id: string | null; name: string; sort_order: number; active: boolean }) {
  return rpc<string>('save_category', { p_id: c.id, p_name: c.name, p_sort_order: c.sort_order, p_active: c.active });
}

export function adjustStock(productId: string, qty: number, type: MovementType, reason: string | null) {
  return rpc<number>('adjust_stock', { p_product_id: productId, p_qty: qty, p_type: type, p_reason: reason });
}

export async function productHistory(productId: string): Promise<{ prices: PriceChange[]; movements: StockMovement[] }> {
  const [prices, movements] = await Promise.all([
    supabase.from('price_changes').select('*').eq('product_id', productId).order('at', { ascending: false }).limit(20),
    supabase.from('stock_movements').select('*').eq('product_id', productId).order('at', { ascending: false }).limit(50),
  ]);
  if (prices.error) throw new Error(prices.error.message);
  if (movements.error) throw new Error(movements.error.message);
  return { prices: prices.data as PriceChange[], movements: movements.data as StockMovement[] };
}

export async function recentMovements(limit = 100): Promise<StockMovement[]> {
  const { data, error } = await supabase.from('stock_movements').select('*').order('at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data as StockMovement[];
}

export async function listCounts(): Promise<StockCount[]> {
  const { data, error } = await supabase.from('stock_counts').select('*').order('started_at', { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return data as StockCount[];
}

export async function countLines(countId: string): Promise<StockCountLine[]> {
  const { data, error } = await supabase.from('stock_count_lines').select('*').eq('count_id', countId);
  if (error) throw new Error(error.message);
  return data as StockCountLine[];
}

export const startCount = (kind: 'quick' | 'full') => rpc<string>('start_count', { p_kind: kind });
export const saveCountLine = (countId: string, productId: string, counted: number | null) =>
  rpc<void>('save_count_line', { p_count_id: countId, p_product_id: productId, p_counted: counted });
export const approveCount = (countId: string) => rpc<number>('approve_count', { p_count_id: countId });
export const cancelCount = (countId: string) => rpc<void>('cancel_count', { p_count_id: countId });

export const importProducts = (rows: unknown[]) => rpc<{ added: number; skipped: number }>('import_products', { p_rows: rows });
export const importLegacySales = (rows: unknown[]) =>
  rpc<{ added: number; skipped: number }>('import_legacy_sales', { p_rows: rows });
