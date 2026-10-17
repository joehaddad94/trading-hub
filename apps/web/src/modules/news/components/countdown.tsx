'use client';

import { countdown } from '@trading/core';
import { useEffect, useState } from 'react';

/** Live "in 2h 05m" text; `now` from the server keeps the first render identical on both sides. */
export function Countdown({ to, now }: { to: string; now: string }) {
  const target = new Date(to);
  const [current, setCurrent] = useState(() => new Date(now));
  useEffect(() => {
    setCurrent(new Date());
    const t = setInterval(() => setCurrent(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const text = countdown(target, current);
  return (
    <span className="num" data-testid="countdown">
      {text ?? 'now'}
    </span>
  );
}
