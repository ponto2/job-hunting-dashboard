'use client';

import { useLayoutEffect, useState } from 'react';

// Whether a flex row's children no longer fit side by side in it: their
// widths and the gaps between them add up to more than the row. Hidden
// children do not count. The widths do not depend on how the row wraps, so
// a caller can rearrange the row on the answer without it flipping back.
// Measured only while the view is showing.
export function useWrapsRow(rowRef, isActive) {
  const [wraps, setWraps] = useState(false);

  useLayoutEffect(() => {
    if (!isActive) return undefined;
    const row = rowRef.current;
    if (!row) return undefined;
    const measure = () => {
      const items = [...row.children].filter(item => item.getClientRects().length > 0);
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const needed = items.reduce((sum, item) => sum + item.getBoundingClientRect().width, 0)
        + gap * Math.max(0, items.length - 1);
      setWraps(needed > row.clientWidth + 0.5);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    // The row for its width; each child for its own (a count, a font).
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    [...row.children].forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, [isActive, rowRef]);

  return wraps;
}
