const dirtyKeys = new Set();
let flushTimer = null;

let dataReady = false;
let nextEn = null;

let allSentences = [];
const params = new URLSearchParams(window.location.search);
let fileParam = params.get("file") || "default";
let jsonFile = `${fileParam}.json`;
let keyPrefix = `randomApp_${fileParam}_`;

const sentenceJpEl = document.getElementById("sentence-jp");
const sentenceEnEl = document.getElementById("sentence-en");
const showBtnEl = document.getElementById("showBtn");
showBtnEl.disabled = true;
const showBtn2El = document.getElementById("showBtn2");
showBtn2El.disabled = true;
document.getElementById("showStarBtn").disabled = true;
const okBtnEl = document.getElementById("okBtn");
const starBtnEl = document.getElementById("starBtn");

let shownCounts = {};
let yesMarks = {};
let starMarks = {};
let remainingArr = [];
let remainingSet = new Set();
let lastShownMap = {};

let lastShowMode = "all";
let customShownCounts = JSON.parse(localStorage.getItem(keyPrefix + "customShownCounts")) || {};

function getCustomTotalShown() {
  return Object.values(customShownCounts).reduce((a, b) => a + (b || 0), 0);
}

function getTodayYMD() {
  const now = new Date();
  const tz = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const d = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
const todayKey = getTodayYMD();

let todayCountsKey = keyPrefix + "shownCounts_" + todayKey;
let todayCounts = JSON.parse(localStorage.getItem(todayCountsKey)) || {};

let customTodayCountsKey = keyPrefix + "customShownCounts_" + todayKey;
let customTodayCounts = JSON.parse(localStorage.getItem(customTodayCountsKey)) || {};
let customTodayShownCached = Object.values(customTodayCounts).reduce((a, b) => a + (b || 0), 0);

let totalShownCached = 0;
let todayShownCached = Object.values(todayCounts).reduce((a, b) => a + (b || 0), 0);

let currentSentence = null;
let showMode = 0;

async function loadDbState() {
  const url = `${API_BASE}/api/random-sync?file=${encodeURIComponent(fileParam)}`;
  const headers = { "Authorization": getAuthHeader() };

  const text = await fetchData(url, headers);
  const data = parseDbData(text);

  shownCounts = data.shownCounts || {};
  yesMarks = data.yesMarks || {};
  starMarks = data.starMarks || {};
  lastShownMap = data.lastShownMap || {};
  simpleCustomList = data.simpleCustomList || [];

  totalShownCached = Object.values(shownCounts).reduce((a, b) => a + (b || 0), 0);
}

let pendingShown = {};
let pendingLastShown = {};
let pendingShowTotal = 0;
const SHOW_BATCH_THRESHOLD = 5;

function addPendingShown(en) {
  pendingShown[en] = (pendingShown[en] || 0) + 1;
  pendingLastShown[en] = new Date().toISOString();
  pendingShowTotal++;
}

async function flushPendingShown() {
  const entries = Object.entries(pendingShown);
  if (entries.length === 0) return;

  const items = entries.map(([en, count]) => ({
    en,
    count,
    lastShown: pendingLastShown[en] || new Date().toISOString(),
  }));

  pendingShown = {};
  pendingLastShown = {};
  pendingShowTotal = 0;

  try {
    await apiPost("/api/random-sync/show-batch", {
      file: fileParam,
      items,
    });
  } catch (err) {
    console.error("flushPendingShown failed", err);
    for (const item of items) {
      pendingShown[item.en] = (pendingShown[item.en] || 0) + item.count;
      pendingLastShown[item.en] = item.lastShown;
      pendingShowTotal += item.count;
    }
  }
}

function scheduleFlushIfNeeded() {
  if (pendingShowTotal >= SHOW_BATCH_THRESHOLD) {
    flushPendingShown();
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushPendingShown();
    flushSaves();
  }
});

let minuteKey = keyPrefix + "minuteRing_v1";

let minuteRing = (() => {
  try {
    const o = JSON.parse(localStorage.getItem(minuteKey));
    if (!o || !Number.isFinite(o.baseMin) || !Array.isArray(o.ring) || o.ring.length !== 60) {
      throw 0;
    }
    return o;
  } catch {
    return {
      baseMin: Math.floor(Date.now() / 60000),
      ring: Array(60).fill(0),
    };
  }
})();

let ringSaveScheduled = false;
function scheduleSaveMinuteRing() {
  if (ringSaveScheduled) return;
  ringSaveScheduled = true;
  setTimeout(() => {
    try {
      localStorage.setItem(minuteKey, JSON.stringify(minuteRing));
    } catch {}
    ringSaveScheduled = false;
  }, 300);
}

function advanceRingTo(nowMin) {
  let diff = nowMin - minuteRing.baseMin;
  if (diff <= 0) return;

  if (diff >= 60) {
    minuteRing.ring.fill(0);
    minuteRing.baseMin = nowMin;
    return;
  }

  const r = minuteRing.ring;
  for (let i = 0; i < 60 - diff; i++) r[i] = r[i + diff];
  for (let i = 60 - diff; i < 60; i++) r[i] = 0;

  minuteRing.baseMin = nowMin;
}

function addNowCountFast() {
  const nowMin = Math.floor(Date.now() / 60000);
  advanceRingTo(nowMin);
  minuteRing.ring[59]++;
  scheduleSaveMinuteRing();
}

function getLastMinutesCount(min) {
  const nowMin = Math.floor(Date.now() / 60000);
  advanceRingTo(nowMin);

  const n = Math.min(60, Math.max(1, min));
  let sum = 0;
  for (let i = 60 - n; i < 60; i++) sum += minuteRing.ring[i];
  return sum;
}

const getLast1HourCount = () => getLastMinutesCount(60);
const getLast5MinCount = () => getLastMinutesCount(5);

let customMinuteKey = keyPrefix + "customMinuteRing_v1";

let customMinuteRing = (() => {
  try {
    const o = JSON.parse(localStorage.getItem(customMinuteKey));
    if (!o || !Number.isFinite(o.baseMin) || !Array.isArray(o.ring) || o.ring.length !== 60) throw 0;
    return o;
  } catch {
    return { baseMin: Math.floor(Date.now() / 60000), ring: Array(60).fill(0) };
  }
})();

let customRingSaveScheduled = false;
function scheduleSaveCustomMinuteRing() {
  if (customRingSaveScheduled) return;
  customRingSaveScheduled = true;
  setTimeout(() => {
    try { localStorage.setItem(customMinuteKey, JSON.stringify(customMinuteRing)); } catch {}
    customRingSaveScheduled = false;
  }, 300);
}

function advanceCustomRingTo(nowMin) {
  const diff = nowMin - customMinuteRing.baseMin;
  if (diff <= 0) return;

  if (diff >= 60) {
    customMinuteRing.ring.fill(0);
    customMinuteRing.baseMin = nowMin;
    return;
  }

  const r = customMinuteRing.ring;
  for (let i = 0; i < 60 - diff; i++) r[i] = r[i + diff];
  for (let i = 60 - diff; i < 60; i++) r[i] = 0;
  customMinuteRing.baseMin = nowMin;
}

function addCustomNowCountFast() {
  const nowMin = Math.floor(Date.now() / 60000);
  advanceCustomRingTo(nowMin);
  customMinuteRing.ring[59]++;
  scheduleSaveCustomMinuteRing();
}

function getCustomLastMinutesCount(min) {
  const nowMin = Math.floor(Date.now() / 60000);
  advanceCustomRingTo(nowMin);

  const n = Math.min(60, Math.max(1, min));
  let sum = 0;
  for (let i = 60 - n; i < 60; i++) sum += customMinuteRing.ring[i];
  return sum;
}
const getCustomLast1HourCount = () => getCustomLastMinutesCount(60);
const getCustomLast5MinCount = () => getCustomLastMinutesCount(5);

function formatTokyoYmdHm(date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  const m = get("month");
  const d = get("day");
  const hh = get("hour");
  const mm = get("minute");
  return `${m}/${d} ${hh}:${mm}`;
}

function humanElapsedWithDate(iso) {
  try {
    if (!iso) return "なし";
    const t = new Date(iso);
    const diffSec = Math.floor((Date.now() - t.getTime()) / 1000);

    let rel;
    if (diffSec < 60) rel = `${diffSec}秒前`;
    else {
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) rel = `${diffMin}分前`;
      else {
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) rel = `${diffHour}時間前`;
        else rel = `${Math.floor(diffHour / 24)}日前`;
      }
    }

    return `${rel}（${formatTokyoYmdHm(t)}）`;
  } catch {
    return "なし";
  }
}

const byEn = Object.create(null);
let simpleKey = keyPrefix + "simpleCustom";
let simpleCustomList = [];

const topMetaEl = document.getElementById("topMeta");
const jpTextEl = document.getElementById("jpText");
const enEl = document.getElementById("sentence-en");

let jsonA = [];
let jsonB = [];
let currentList = [];

async function initApp() {
  try {
    jsonA = await (await fetch("sentences.json")).json();
    jsonB = await (await fetch("sentences_cleared.json")).json();
    await switchMode("default", jsonA);
  } catch (err) {
    topMetaEl.textContent = String(err.message || err);
    console.error(err);
  }
}
initApp();

function rebuildKeysFor(file) {
  fileParam = file;
  jsonFile = `${fileParam}.json`;
  keyPrefix = `randomApp_${fileParam}_`;

  todayCountsKey = keyPrefix + "shownCounts_" + todayKey;
  customTodayCountsKey = keyPrefix + "customShownCounts_" + todayKey;

  minuteKey = keyPrefix + "minuteRing_v1";
  customMinuteKey = keyPrefix + "customMinuteRing_v1";
  simpleKey = keyPrefix + "simpleCustom";
}

function loadLocalStateForCurrent() {
  customShownCounts = JSON.parse(localStorage.getItem(keyPrefix + "customShownCounts")) || {};

  todayCounts = JSON.parse(localStorage.getItem(todayCountsKey)) || {};
  todayShownCached = Object.values(todayCounts).reduce((a, b) => a + (b || 0), 0);

  customTodayCounts = JSON.parse(localStorage.getItem(customTodayCountsKey)) || {};
  customTodayShownCached = Object.values(customTodayCounts).reduce((a, b) => a + (b || 0), 0);

  minuteRing = (() => {
    try {
      const o = JSON.parse(localStorage.getItem(minuteKey));
      if (!o || !Number.isFinite(o.baseMin) || !Array.isArray(o.ring) || o.ring.length !== 60) throw 0;
      return o;
    } catch {
      return { baseMin: Math.floor(Date.now() / 60000), ring: Array(60).fill(0) };
    }
  })();

  customMinuteRing = (() => {
    try {
      const o = JSON.parse(localStorage.getItem(customMinuteKey));
      if (!o || !Number.isFinite(o.baseMin) || !Array.isArray(o.ring) || o.ring.length !== 60) throw 0;
      return o;
    } catch {
      return { baseMin: Math.floor(Date.now() / 60000), ring: Array(60).fill(0) };
    }
  })();
}

async function switchMode(file, list) {
  dataReady = false;
  nextEn = null;

  await flushPendingShown().catch(() => {});

  rebuildKeysFor(file);
  loadLocalStateForCurrent();

  await loadDbState();

  allSentences = list;

  for (const k in byEn) delete byEn[k];
  for (const s of allSentences) byEn[s.en] = s;

  for (const t of simpleCustomList) {
    const text = (t || "").trim();
    if (!text) continue;
    if (byEn[text]) continue;
    byEn[text] = { jp: text, en: text };
  }

  remainingArr = allSentences
    .map((s) => s.en)
    .filter((en) => !yesMarks[en]);
  remainingSet = new Set(remainingArr);

  localStorage.setItem(simpleKey, JSON.stringify(simpleCustomList));

  currentSentence = null;
  dataReady = true;

  showBtnEl.disabled = false;
  showBtn2El.disabled = false;
  document.getElementById("showStarBtn").disabled = false;

  okBtnEl.disabled = true;
  starBtnEl.disabled = true;
  updateStarUi();

  document.getElementById("last-shown").textContent = "";
  jpTextEl.textContent = "";
  enEl.textContent = "";

  topMetaEl.textContent = `Mode: ${fileParam}\nPress "Random" to start`;
}

function getOkCount() {
  return Object.values(yesMarks).filter((v) => v === true).length;
}

function buildOkCountText() {
  const okCount = getOkCount();
  const total = allSentences.length;
  return `OK（${okCount} / ${total}）`;
}

function buildCountsInlineText() {
  return `（${getLast5MinCount()} / ${getLast1HourCount()} / ${todayShownCached} / ${totalShownCached}）`;
}

function presentSentenceByEn(en, shouldCount = true, shouldAnimate = true, hideJp = false) {
  const s = byEn[en];
  if (!s) return;
  currentSentence = s;

  okBtnEl.disabled = !shouldCount;
  starBtnEl.disabled = !shouldCount;
  updateStarUi();

  if (shouldAnimate) {
    sentenceJpEl.classList.add("hidden");
    sentenceEnEl.classList.add("hidden");

    requestAnimationFrame(() => {
      jpTextEl.textContent = hideJp ? "" : s.jp;
      enEl.textContent = s.en;

      sentenceJpEl.classList.remove("hidden");
      sentenceEnEl.classList.remove("hidden");
    });
  } else {
    sentenceJpEl.classList.remove("hidden");
    sentenceEnEl.classList.remove("hidden");
    jpTextEl.textContent = hideJp ? "" : s.jp;
    enEl.textContent = s.en;
  }

  if (!shouldCount) return;

  setTimeout(() => {
    const newShown = (shownCounts[en] || 0) + 1;
    shownCounts[en] = newShown;
    totalShownCached++;

    todayCounts[en] = (todayCounts[en] || 0) + 1;
    todayShownCached++;
    markDirty(todayCountsKey);

    addNowCountFast();

    const prevIso = lastShownMap[en];
    const prevText = humanElapsedWithDate(prevIso);
    lastShownMap[en] = new Date().toISOString();

    const starMark = starMarks[en] ? "★" : "";
    topMetaEl.textContent =
      `${newShown}回目${starMark}${buildCountsInlineText()}\n` +
      `${prevText}\n` +
      `${buildOkCountText()}`;

    addPendingShown(en);
    scheduleFlushIfNeeded();
  }, 0);
}

function pickRandomFast(arr, excludeEn) {
  const n = arr.length;
  if (n === 0) return null;
  if (n === 1) return arr[0];

  let idx = (Math.random() * n) | 0;
  if (arr[idx] !== excludeEn) return arr[idx];

  const offset = 1 + ((Math.random() * (n - 1)) | 0);
  idx = (idx + offset) % n;
  return arr[idx];
}

function pickLeastShown(arr, excludeEn) {
  const n = arr.length;
  if (n === 0) return null;
  if (n === 1) return arr[0];

  let min = Infinity;
  let chosen = null;
  let seen = 0;

  for (let i = 0; i < n; i++) {
    const en = arr[i];
    if (en === excludeEn && n > 1) continue;

    const c = shownCounts[en] || 0;

    if (c < min) {
      min = c;
      chosen = en;
      seen = 1;
    } else if (c === min) {
      seen++;
      if ((Math.random() * seen) < 1) chosen = en;
    }
  }

  return chosen ?? arr[0];
}

function pickOldest(arr, excludeEn) {
  let oldestEn = null;
  let oldestTime = Infinity;

  for (const en of arr) {
    if (en === excludeEn && arr.length > 1) continue;

    const iso = lastShownMap[en];
    const t = iso ? new Date(iso).getTime() : 0;

    if (t < oldestTime) {
      oldestTime = t;
      oldestEn = en;
    }
  }

  return oldestEn ?? arr[0];
}

function prepareNext() {
  if (remainingArr.length === 0) {
    nextEn = null;
    return;
  }

  switch (showMode) {
    case 0:
      nextEn = pickRandomFast(remainingArr, currentSentence?.en);
      break;
    case 1:
      nextEn = pickLeastShown(remainingArr, currentSentence?.en);
      break;
    case 2:
      nextEn = pickOldest(remainingArr, currentSentence?.en);
      break;
  }

  showMode = (showMode + 1) % 3;
}

function showRandom() {
  if (!dataReady) {
    topMetaEl.textContent = "Loading...";
    return;
  }

  if (remainingArr.length === 0) {
    topMetaEl.textContent = "すべての英文を表示しました！";
    jpTextEl.textContent = "";
    enEl.textContent = "";
    return;
  }

  if (!nextEn) {
    prepareNext();
  }

  const en = nextEn;
  nextEn = null;

  presentSentenceByEn(en);
  requestAnimationFrame(prepareNext);
  lastShowMode = "all";
}

function showRandomStarred() {
  let pool = remainingArr.filter((en) => !!starMarks[en]);
  if (pool.length === 0) {
    pool = Object.keys(starMarks).filter((en) => starMarks[en]);
  }
  if (pool.length === 0) {
    alert("☆が付いた英文がありません。先に『☆』でお気に入り登録してください。");
    return;
  }
  const en = pickRandomFast(pool, currentSentence?.en);
  lastShowMode = "star";
  presentSentenceByEn(en);
}

function confirmSentence() {
  if (!currentSentence) return;
  yesMarks[currentSentence.en] = true;

  syncOkToDb(currentSentence.en).catch((err) => console.error("ok sync failed", err));

  remainingSet.delete(currentSentence.en);
  remainingArr = Array.from(remainingSet);

  if (remainingArr.length > 0) showRandom();
  else {
    topMetaEl.textContent = "すべての英文を表示しました！";
    jpTextEl.textContent = "";
    enEl.textContent = "";
    document.getElementById("last-shown").textContent = "";
    document.getElementById("showBtn").disabled = true;
    document.getElementById("showBtn2").disabled = true;
    document.getElementById("okBtn").disabled = true;
    document.getElementById("starBtn").disabled = true;
  }
}

function toggleStar() {
  if (!currentSentence) return;
  const en = currentSentence.en;
  const now = !starMarks[en];
  starMarks[en] = now;

  syncStarToDb(en, now).catch((err) => console.error("star sync failed", err));

  updateStarUi();

  if (lastShowMode === "star") showRandomStarred();
  else showRandom();
}

function clearDailyCounts() {
  const prefix = keyPrefix + "shownCounts_";
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) localStorage.removeItem(k);
  }
}

async function resetData() {
  if (!confirm("Reset？")) return;

  try {
    await flushPendingShown();
    await syncResetToDb();
  } catch (err) {
    console.error(err);
  }

  localStorage.removeItem(minuteKey);
  localStorage.removeItem(keyPrefix + "customShownCounts");
  localStorage.removeItem(customTodayCountsKey);
  localStorage.removeItem(customMinuteKey);
  localStorage.removeItem(simpleKey);
  clearDailyCounts();

  shownCounts = {};
  yesMarks = {};
  lastShownMap = {};
  starMarks = {};
  totalShownCached = 0;
  todayShownCached = 0;
  todayCounts = {};
  customShownCounts = {};
  customTodayCounts = {};
  customTodayShownCached = 0;
  simpleCustomList = [];

  minuteRing = { baseMin: Math.floor(Date.now() / 60000), ring: Array(60).fill(0) };
  customMinuteRing = { baseMin: Math.floor(Date.now() / 60000), ring: Array(60).fill(0) };

  pendingShown = {};
  pendingLastShown = {};
  pendingShowTotal = 0;

  for (const k in byEn) delete byEn[k];
  for (const s of allSentences) byEn[s.en] = s;

  remainingArr = allSentences.map((s) => s.en);
  remainingSet = new Set(remainingArr);
  currentSentence = null;

  topMetaEl.textContent = 'Press "Random" to start';
  jpTextEl.textContent = "";
  enEl.textContent = "";
  document.getElementById("last-shown").textContent = "";
  document.getElementById("showBtn").disabled = false;
  document.getElementById("showBtn2").disabled = false;
  document.getElementById("okBtn").disabled = true;
  document.getElementById("starBtn").disabled = true;
  document.getElementById("statsArea").style.display = "none";
}

function escapeCsvCell(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCustomOnlyCsv() {
  if (!simpleCustomList || simpleCustomList.length === 0) {
    alert("Customがありません");
    return;
  }

  const seen = new Set();
  const cleaned = [];
  for (const t of simpleCustomList) {
    const text = (t || "").trim();
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    cleaned.push(text);
  }

  const lines = [];
  lines.push("text");
  for (const text of cleaned) {
    lines.push(escapeCsvCell(text));
  }
  const csv = lines.join("\r\n");

  const ymd = getTodayYMD();
  const filename = `custom_only_${fileParam}_${ymd}.csv`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const customTextEl = document.getElementById("customText");
const addSimpleBtn = document.getElementById("addSimpleBtn");
const customOnlyBtn = document.getElementById("customOnlyBtn");
const clearCustomBtn = document.getElementById("clearCustomBtn");
const addMsg = document.getElementById("addMsg");
const exportCustomCsvBtn = document.getElementById("exportCustomCsvBtn");

function saveSimple() {
  localStorage.setItem(simpleKey, JSON.stringify(simpleCustomList));
}

async function addSimpleSentence() {
  const text = (customTextEl.value || "").trim();
  if (!text) {
    addMsg.textContent = "空です";
    return;
  }

  try {
    await syncCustomToDb(text);

    simpleCustomList.push(text);
    saveSimple();

    customTextEl.value = "";

    if (!byEn[text]) {
      byEn[text] = { jp: text, en: text };
    }

    addMsg.textContent = "追加しました";
    customTextEl.blur();

    setTimeout(() => {
      const y = window.scrollY;
      window.scrollTo(0, y + 1);
      window.scrollTo(0, y);
    }, 0);
  } catch (err) {
    console.error(err);
    addMsg.textContent = "DB登録に失敗しました";
  }
}

function pickLeastShownCustom(arr, excludeEn) {
  const n = arr.length;
  if (n === 0) return null;
  if (n === 1) return arr[0];

  let min = Infinity;
  let chosen = null;
  let seen = 0;

  for (let i = 0; i < n; i++) {
    const en = arr[i];
    if (en === excludeEn && n > 1) continue;

    const c = customShownCounts[en] || 0;

    if (c < min) {
      min = c;
      chosen = en;
      seen = 1;
    } else if (c === min) {
      seen++;
      if ((Math.random() * seen) < 1) chosen = en;
    }
  }
  return chosen ?? arr[0];
}

let customShowMode = 0;

function pickCustom(enList, excludeEn) {
  if (customShowMode === 1) return pickLeastShownCustom(enList, excludeEn);
  return pickRandomFast(enList, excludeEn);
}

function getCustomRegisteredCount() {
  if (!Array.isArray(simpleCustomList)) return 0;
  return simpleCustomList.map((t) => (t || "").trim()).filter(Boolean).length;
}

function showRandomCustomOnly() {
  const nn = getCustomRegisteredCount();
  if (nn === 0) {
    alert("Customがありません");
    return;
  }

  const pool = simpleCustomList.map((t) => (t || "").trim()).filter(Boolean);
  const en = pickCustom(pool, currentSentence?.en);
  customShowMode = (customShowMode + 1) % 2;

  presentSentenceByEn(en, false, false, true);

  const newCustomShown = (customShownCounts[en] || 0) + 1;
  customShownCounts[en] = newCustomShown;
  markDirty(keyPrefix + "customShownCounts");

  customTodayCounts[en] = (customTodayCounts[en] || 0) + 1;
  customTodayShownCached++;
  markDirty(customTodayCountsKey);

  addCustomNowCountFast();

  const totalCustom = getCustomTotalShown();
  const perTotal = newCustomShown;
  const perToday = customTodayCounts[en] || 0;

  topMetaEl.textContent =
    `${nn}：この文 ${perTotal}回（今日 ${perToday}）\n` +
    `（${getCustomLast5MinCount()} / ${getCustomLast1HourCount()} / 今日 ${customTodayShownCached} / 合計 ${totalCustom}）`;

  document.getElementById("last-shown").textContent = "";
}

async function clearSimple() {
  if (!confirm("全部削除する？")) return;

  try {
    await syncCustomClearToDb();
  } catch (err) {
    console.error(err);
  }

  const toRemove = new Set(simpleCustomList.map((t) => (t || "").trim()).filter(Boolean));

  simpleCustomList = [];
  saveSimple();

  for (const t of toRemove) delete byEn[t];

  addMsg.textContent = "削除しました";
  flushSaves();
}

function bindFastTap(el, fn) {
  el.addEventListener("pointerup", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  }, { passive: false });
}

bindFastTap(addSimpleBtn, addSimpleSentence);
bindFastTap(customOnlyBtn, showRandomCustomOnly);
bindFastTap(clearCustomBtn, clearSimple);
bindFastTap(exportCustomCsvBtn, exportCustomOnlyCsv);

document.getElementById("showBtn").onclick = async () => {
  if (!jsonA.length) return;
  await switchMode("default", jsonA);
  showRandom();
};
document.getElementById("showBtn2").onclick = async () => {
  if (!jsonB.length) return;
  await switchMode("advanced", jsonB);
  showRandom();
};
document.getElementById("showStarBtn").onclick = showRandomStarred;
document.getElementById("okBtn").onclick = () => {
  if (!currentSentence) return;
  if (confirm("OK？")) confirmSentence();
};
document.getElementById("starBtn").onclick = toggleStar;
document.getElementById("resetBtn").onclick = resetData;
document.getElementById("statsBtn").onclick = showStats;
document.getElementById("copyBtn").onclick = copyStats;
