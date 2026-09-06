function createMinuteRingState(storageKey) {
  try {
    const state = JSON.parse(localStorage.getItem(storageKey));
    if (
      state &&
      Number.isFinite(state.baseMin) &&
      Array.isArray(state.ring) &&
      state.ring.length === 60
    ) {
      return state;
    }
  } catch {}

  return {
    baseMin: Math.floor(Date.now() / 60000),
    ring: Array(60).fill(0),
  };
}

function advanceMinuteRing(state, nowMin) {
  const diff = nowMin - state.baseMin;
  if (diff <= 0) return;

  if (diff >= 60) {
    state.ring.fill(0);
    state.baseMin = nowMin;
    return;
  }

  for (let index = 0; index < 60 - diff; index++) {
    state.ring[index] = state.ring[index + diff];
  }
  for (let index = 60 - diff; index < 60; index++) {
    state.ring[index] = 0;
  }
  state.baseMin = nowMin;
}
