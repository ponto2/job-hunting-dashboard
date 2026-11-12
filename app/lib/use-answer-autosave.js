'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createAutosaveQueue } from '@/lib/autosave-queue';

function without(object, key) {
  if (!Object.hasOwn(object, key)) return object;
  const next = { ...object };
  delete next[key];
  return next;
}

// Autosave for answers typed in place, on top of lib/autosave-queue.js.
// `drafts` holds the local text of entries with unsaved or just-typed
// changes; show it instead of the entry's own answer while it is there.
export function useAnswerAutosave({ save, onSaved, delay = 1000 }) {
  const saveRef = useRef(save);
  const onSavedRef = useRef(onSaved);
  const queueRef = useRef(null);
  const [drafts, setDrafts] = useState({});
  const [statuses, setStatuses] = useState({});

  useEffect(() => {
    saveRef.current = save;
    onSavedRef.current = onSaved;
  });

  const getQueue = useCallback(() => {
    if (!queueRef.current) {
      queueRef.current = createAutosaveQueue({
        delay,
        getSave: () => saveRef.current,
        onSaved: saved => onSavedRef.current?.(saved),
        onStatus: (id, status) => setStatuses(prev => (prev[id] === status ? prev : { ...prev, [id]: status })),
        onClean: id => setDrafts(prev => without(prev, id)),
      });
    }
    return queueRef.current;
  }, [delay]);

  const change = useCallback((entry, value) => {
    const id = String(entry.id);
    setDrafts(prev => ({ ...prev, [id]: value }));
    getQueue().change(id, value, entry.answer || '');
  }, [getQueue]);

  const flush = useCallback(id => getQueue().flush(String(id)), [getQueue]);
  const flushAll = useCallback(() => getQueue().flushAll(), [getQueue]);
  const getError = useCallback(id => getQueue().getError(String(id)), [getQueue]);

  // Forget local state, e.g. after the modal saved or the entry was deleted.
  const reset = useCallback((id) => {
    const key = String(id);
    getQueue().reset(key);
    setDrafts(prev => without(prev, key));
    setStatuses(prev => without(prev, key));
  }, [getQueue]);

  // Leaving the page with unsaved text asks first; unmounting sends it.
  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!getQueue().hasPending()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      getQueue().dispose();
    };
  }, [getQueue]);

  return { drafts, statuses, change, flush, flushAll, reset, getError };
}
