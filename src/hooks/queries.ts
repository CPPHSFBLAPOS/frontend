import { useQuery } from '@tanstack/react-query';
import { getSettings, memberDirectory } from '../api/admin';
import { listCategories, listProducts } from '../api/catalog';
import type { Product } from '../api/types';

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: getSettings, staleTime: 10 * 60 * 1000 });
}

export function useDirectory() {
  return useQuery({ queryKey: ['directory'], queryFn: memberDirectory, staleTime: 5 * 60 * 1000 });
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: listCategories, staleTime: 5 * 60 * 1000 });
}

// Products are cached in localStorage too, so the register can still show
// its grid after a reload while offline.
const CACHE_KEY = 'fbla-products';

export function useProducts(includeArchived = false) {
  return useQuery({
    queryKey: ['products', includeArchived],
    queryFn: async () => {
      const list = await listProducts(includeArchived);
      if (!includeArchived) {
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(list));
        } catch {
          // Storage full or blocked.
        }
      }
      return list;
    },
    initialData: () => {
      if (includeArchived) return undefined;
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? (JSON.parse(raw) as Product[]) : undefined;
      } catch {
        return undefined;
      }
    },
    initialDataUpdatedAt: 0,
    staleTime: 30 * 1000,
  });
}

export function nameOf(directory: Array<{ id: string; display_name: string }> | undefined, id: string | null | undefined) {
  if (!id) return 'System';
  return directory?.find((d) => d.id === id)?.display_name ?? 'Former member';
}
