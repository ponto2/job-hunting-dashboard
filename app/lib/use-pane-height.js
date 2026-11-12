'use client';

import { useEffect, useState } from 'react';

const MIN_HEIGHT = 420;
const BOTTOM_ROOM = 20;

// The height that fits a split panel into the rest of the window, so its list
// and body scroll on their own (the selection boards size themselves the same
// way). Measured only while the view is showing; `watchRef` is an element
// above the panel whose size can change (the toolbar wraps on narrow screens).
export function usePaneHeight(panelRef, watchRef, isActive, deps = []) {
  const [height, setHeight] = useState(560);

  useEffect(() => {
    if (!isActive) return undefined;
    const measure = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const top = Math.max(0, panel.getBoundingClientRect().top);
      setHeight(Math.max(MIN_HEIGHT, Math.round(window.innerHeight - top - BOTTOM_ROOM)));
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    let observer = null;
    if (watchRef?.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(watchRef.current);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, panelRef, watchRef, ...deps]);

  return height;
}
