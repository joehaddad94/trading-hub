'use client';

import Decimal from 'decimal.js';
import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/format';

/**
 * A money figure that counts up from $0 when it appears (design spec, lively motion). Interpolates with
 * Decimal, never floats. The server renders the final value, and reduced motion skips the animation.
 */
export function CountUpMoney({ value, signed = false, ms = 900 }: { value: string; signed?: boolean; ms?: number }) {
  const [shown, setShown] = useState(() => new Decimal(value));
  useEffect(() => {
    const target = new Decimal(value);
    if (target.isZero() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - p) ** 3;
      setShown(p >= 1 ? target : target.times(eased.toFixed(4)).toDecimalPlaces(2));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);
  const text = formatMoney(shown);
  return <>{signed && shown.gt(0) ? `+${text}` : text}</>;
}
