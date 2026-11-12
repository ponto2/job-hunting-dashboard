// A per-entry save queue for text typed in place. What the user typed is the
// truth: a save response never replaces the local value, a failed save keeps
// it, and each entry has at most one save in flight (changes made meanwhile
// are sent once it returns, so the server ends on the latest text).
//
// Status per entry, reported through onStatus(id, status):
//   'dirty'  typed, waiting for the pause
//   'saving' a save is in flight
//   'saved'  the server holds the latest text (onClean(id) fires too)
//   'error'  the last save failed; the text stays and a retry is possible
//
// Plain JS with no React, so the ordering rules can be tested in Node.

export function createAutosaveQueue({
  getSave,
  onSaved = () => {},
  onStatus = () => {},
  onClean = () => {},
  delay = 1000,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = handle => clearTimeout(handle),
} = {}) {
  const records = new Map();
  const isPending = record => Boolean(record.inFlight) || record.value !== record.savedValue;

  function send(id) {
    const record = records.get(id);
    if (!record) return Promise.resolve(true);
    if (record.timer) clearTimer(record.timer);
    record.timer = null;
    if (record.inFlight) {
      record.queued = true;
      return record.inFlight;
    }
    if (record.value === record.savedValue) {
      // Typed and then undone back to what the server already holds.
      record.error = null;
      onStatus(id, 'saved');
      onClean(id);
      return Promise.resolve(true);
    }

    const value = record.value;
    onStatus(id, 'saving');
    const run = async () => {
      let ok = true;
      try {
        const saved = await getSave()(id, value);
        // Reset (modal save, delete) while this was in flight: drop the reply.
        if (records.get(id) !== record) return true;
        record.savedValue = value;
        onSaved(saved, id);
      } catch (error) {
        if (records.get(id) !== record) return false;
        record.error = error;
        ok = false;
      }
      record.inFlight = null;
      const dirty = record.value !== record.savedValue;
      if (record.queued) {
        record.queued = false;
        if (dirty) return send(id);
      }
      if (!ok) {
        onStatus(id, 'error');
        return false;
      }
      if (dirty) {
        onStatus(id, 'dirty');
        return record.timer ? true : send(id);
      }
      record.error = null;
      onStatus(id, 'saved');
      onClean(id);
      return true;
    };
    record.inFlight = run();
    return record.inFlight;
  }

  // `serverValue` is the entry's text as last loaded; a clean record starts
  // from it, since the entry may have changed elsewhere since the last save.
  function change(id, value, serverValue = '') {
    let record = records.get(id);
    if (!record) {
      record = { value: serverValue, savedValue: serverValue, timer: null, inFlight: null, queued: false, error: null };
      records.set(id, record);
    }
    if (!record.inFlight && record.value === record.savedValue) record.savedValue = serverValue;
    record.value = value;
    onStatus(id, 'dirty');
    if (record.timer) clearTimer(record.timer);
    record.timer = setTimer(() => {
      record.timer = null;
      send(id);
    }, delay);
  }

  function flush(id) {
    const record = records.get(id);
    if (!record || !isPending(record)) return Promise.resolve(true);
    return send(id);
  }

  function flushAll() {
    const pending = [];
    records.forEach((record, id) => {
      if (isPending(record)) pending.push(send(id));
    });
    return Promise.all(pending).then(results => results.every(Boolean));
  }

  function reset(id) {
    const record = records.get(id);
    if (record?.timer) clearTimer(record.timer);
    records.delete(id);
  }

  function hasPending() {
    return Array.from(records.values()).some(isPending);
  }

  function getError(id) {
    return records.get(id)?.error || null;
  }

  // Sends whatever is still waiting for its pause, without waiting for it.
  function dispose() {
    records.forEach((record, id) => {
      if (!record.timer) return;
      clearTimer(record.timer);
      record.timer = null;
      if (!record.inFlight && record.value !== record.savedValue) {
        Promise.resolve().then(() => getSave()(id, record.value)).catch(() => {});
      }
    });
  }

  return { change, flush, flushAll, reset, hasPending, getError, dispose };
}
