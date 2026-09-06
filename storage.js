function saveToLocalStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadFromLocalStorage(key) {
  return JSON.parse(localStorage.getItem(key)) || {};
}

function markDirty(key) {
  dirtyKeys.add(key);
  if (flushTimer) return;
  flushTimer = setTimeout(flushSaves, 800);
}

function flushSaves() {
  flushTimer = null;
  const keysToFlush = Array.from(dirtyKeys);
  dirtyKeys.clear();

  const run = () => {
    try {
      for (const key of keysToFlush) {
        if (key === todayCountsKey) saveToLocalStorage(key, todayCounts);
        else if (key === keyPrefix + "customShownCounts") saveToLocalStorage(key, customShownCounts);
        else if (key === customTodayCountsKey) saveToLocalStorage(key, customTodayCounts);
      }
    } catch {}
  };

  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 1000 });
  else setTimeout(run, 0);
}