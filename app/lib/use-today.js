'use client';

import { useSyncExternalStore } from 'react';

const listeners = new Set();
const day = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
let today = day();
let timer;
function update() {
  const next = day();
  if (today !== next) {
    today = next;
    listeners.forEach(listener => listener());
  }
}
function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    update();
    timer = setInterval(update, 1000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    }
  };
}
// One shared Japanese calendar day for every deadline view, including resume.
export function useToday() {
  return useSyncExternalStore(subscribe, () => today, day);
}
