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
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const y = get("year");
  const m = get("month");
  const d = get("day");
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

let minuteRing = createMinuteRingState(minuteKey);

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
  advanceMinuteRing(minuteRing, nowMin);
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

let customMinuteRing = createMinuteRingState(customMinuteKey);

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
  advanceMinuteRing(customMinuteRing, nowMin);
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
    jsonA = await (await fetch("data/sentences.json")).json();
    jsonB = await (await fetch("data/sentences_cleared.json")).json();
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

  minuteRing = createMinuteRingState(minuteKey);
  customMinuteRing = createMinuteRingState(customMinuteKey);
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

  minuteRing = createMinuteRingState(minuteKey);
  customMinuteRing = createMinuteRingState(customMinuteKey);

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

async function showModeRandomly(file, sentences) {
  if (!sentences.length) return;
  if (fileParam !== file) await switchMode(file, sentences);
  showRandom();
}

document.getElementById("showBtn").onclick = () => showModeRandomly("default", jsonA);
document.getElementById("showBtn2").onclick = () => showModeRandomly("advanced", jsonB);
document.getElementById("showStarBtn").onclick = showRandomStarred;
document.getElementById("okBtn").onclick = () => {
  if (!currentSentence) return;
  if (confirm("OK？")) confirmSentence();
};
document.getElementById("starBtn").onclick = toggleStar;
document.getElementById("resetBtn").onclick = resetData;
document.getElementById("statsBtn").onclick = showStats;
document.getElementById("copyBtn").onclick = copyStats;
