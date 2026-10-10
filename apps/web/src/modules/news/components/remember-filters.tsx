'use client';

import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { NEWS_FILTER_PARAMS } from '../search-params';

const STORAGE_KEY = 'news.filters';

/**
 * News filters are URL-driven; this keeps the last choice on this device (like the Tracker scope): a URL
 * without filter params gets the remembered ones, and every filtered URL is remembered.
 */
export function RememberFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const own = new URLSearchParams();
    for (const k of NEWS_FILTER_PARAMS) {
      const v = params.get(k);
      if (v) own.set(k, v);
    }
    try {
      if (own.size > 0) {
        window.localStorage.setItem(STORAGE_KEY, own.toString());
        return;
      }
      if (params.get('filters') === 'default') {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const next = new URLSearchParams(params);
      for (const [k, v] of new URLSearchParams(stored)) next.set(k, v);
      router.replace(`${pathname}?${next.toString()}` as Route, { scroll: false });
    } catch {
      // Storage blocked: the URL still carries the filters.
    }
  }, [params, router, pathname]);
  return null;
}
