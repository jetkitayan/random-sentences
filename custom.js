function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function exportCustomOnlyCsv() {
  if (!simpleCustomList || simpleCustomList.length === 0) {
    alert("Customがありません");
    return;
  }

  const seen = new Set();
  const cleaned = [];
  for (const value of simpleCustomList) {
    const text = (value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    cleaned.push(text);
  }

  const lines = ["text", ...cleaned.map(escapeCsvCell)];
  const csv = lines.join("\r\n");
  const filename = `custom_only_${fileParam}_${getTodayYMD()}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
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

    if (!byEn[text]) byEn[text] = { jp: text, en: text };

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

function pickLeastShownCustom(sentences, excludeEn) {
  if (sentences.length === 0) return null;
  if (sentences.length === 1) return sentences[0];

  let min = Infinity;
  let chosen = null;
  let seen = 0;

  for (const en of sentences) {
    if (en === excludeEn) continue;
    const count = customShownCounts[en] || 0;

    if (count < min) {
      min = count;
      chosen = en;
      seen = 1;
    } else if (count === min) {
      seen++;
      if (Math.random() * seen < 1) chosen = en;
    }
  }

  return chosen ?? sentences[0];
}

let customShowMode = 0;

function pickCustom(sentences, excludeEn) {
  if (customShowMode === 1) return pickLeastShownCustom(sentences, excludeEn);
  return pickRandomFast(sentences, excludeEn);
}

function getCustomRegisteredCount() {
  if (!Array.isArray(simpleCustomList)) return 0;
  return simpleCustomList.filter((text) => (text || "").trim()).length;
}

function showRandomCustomOnly() {
  const registeredCount = getCustomRegisteredCount();
  if (registeredCount === 0) {
    alert("Customがありません");
    return;
  }

  const pool = simpleCustomList.map((text) => (text || "").trim()).filter(Boolean);
  const en = pickCustom(pool, currentSentence?.en);
  customShowMode = (customShowMode + 1) % 2;

  presentSentenceByEn(en, false, false, true);

  const shown = (customShownCounts[en] || 0) + 1;
  customShownCounts[en] = shown;
  markDirty(keyPrefix + "customShownCounts");

  customTodayCounts[en] = (customTodayCounts[en] || 0) + 1;
  customTodayShownCached++;
  markDirty(customTodayCountsKey);
  addCustomNowCountFast();

  topMetaEl.textContent =
    `${registeredCount}：この文 ${shown}回（今日 ${customTodayCounts[en]}）\n` +
    `（${getCustomLast5MinCount()} / ${getCustomLast1HourCount()} / 今日 ${customTodayShownCached} / 合計 ${getCustomTotalShown()}）`;
  document.getElementById("last-shown").textContent = "";
}

async function clearSimple() {
  if (!confirm("全部削除する？")) return;

  try {
    await syncCustomClearToDb();
  } catch (err) {
    console.error(err);
  }

  const toRemove = new Set(simpleCustomList.map((text) => (text || "").trim()).filter(Boolean));
  simpleCustomList = [];
  saveSimple();

  for (const text of toRemove) delete byEn[text];
  addMsg.textContent = "削除しました";
  flushSaves();
}

function bindFastTap(element, handler) {
  element.addEventListener("pointerup", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler();
  }, { passive: false });
}

bindFastTap(addSimpleBtn, addSimpleSentence);
bindFastTap(customOnlyBtn, showRandomCustomOnly);
bindFastTap(clearCustomBtn, clearSimple);
bindFastTap(exportCustomCsvBtn, exportCustomOnlyCsv);
