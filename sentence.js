function getOkCount() {
  return Object.values(yesMarks).filter((value) => value === true).length;
}

function buildOkCountText() {
  return `OK（${getOkCount()} / ${allSentences.length}）`;
}

function buildCountsInlineText() {
  return `（${getLast5MinCount()} / ${getLast1HourCount()} / ${todayShownCached} / ${totalShownCached}）`;
}

function presentSentenceByEn(en, shouldCount = true, shouldAnimate = true, hideJp = false) {
  const sentence = byEn[en];
  if (!sentence) return;
  currentSentence = sentence;

  okBtnEl.disabled = !shouldCount;
  starBtnEl.disabled = !shouldCount;
  updateStarUi();

  const updateText = () => {
    jpTextEl.textContent = hideJp ? "" : sentence.jp;
    enEl.textContent = sentence.en;
    sentenceJpEl.classList.remove("hidden");
    sentenceEnEl.classList.remove("hidden");
  };

  if (shouldAnimate) {
    sentenceJpEl.classList.add("hidden");
    sentenceEnEl.classList.add("hidden");
    requestAnimationFrame(updateText);
  } else {
    updateText();
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

    const previousText = humanElapsedWithDate(lastShownMap[en]);
    lastShownMap[en] = new Date().toISOString();
    const starMark = starMarks[en] ? "★" : "";

    topMetaEl.textContent =
      `${newShown}回目${starMark}${buildCountsInlineText()}\n` +
      `${previousText}\n` +
      `${buildOkCountText()}`;

    addPendingShown(en);
    scheduleFlushIfNeeded();
  }, 0);
}

function pickRandomFast(sentences, excludeEn) {
  const count = sentences.length;
  if (count === 0) return null;
  if (count === 1) return sentences[0];

  let index = (Math.random() * count) | 0;
  if (sentences[index] !== excludeEn) return sentences[index];

  const offset = 1 + ((Math.random() * (count - 1)) | 0);
  index = (index + offset) % count;
  return sentences[index];
}

function pickLeastShown(sentences, excludeEn) {
  if (sentences.length === 0) return null;
  if (sentences.length === 1) return sentences[0];

  let min = Infinity;
  let chosen = null;
  let seen = 0;

  for (const en of sentences) {
    if (en === excludeEn) continue;
    const count = shownCounts[en] || 0;

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

function pickOldest(sentences, excludeEn) {
  let oldestEn = null;
  let oldestTime = Infinity;

  for (const en of sentences) {
    if (en === excludeEn && sentences.length > 1) continue;
    const shownAt = lastShownMap[en];
    const shownTime = shownAt ? new Date(shownAt).getTime() : 0;

    if (shownTime < oldestTime) {
      oldestTime = shownTime;
      oldestEn = en;
    }
  }

  return oldestEn ?? sentences[0];
}

function prepareNext() {
  if (remainingArr.length === 0) {
    nextEn = null;
    return;
  }

  const excludeEn = currentSentence?.en;
  if (showMode === 0) nextEn = pickRandomFast(remainingArr, excludeEn);
  if (showMode === 1) nextEn = pickLeastShown(remainingArr, excludeEn);
  if (showMode === 2) nextEn = pickOldest(remainingArr, excludeEn);
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

  if (!nextEn) prepareNext();
  const en = nextEn;
  nextEn = null;

  presentSentenceByEn(en);
  requestAnimationFrame(prepareNext);
  lastShowMode = "all";
}

function showRandomStarred() {
  let pool = remainingArr.filter((en) => !!starMarks[en]);
  if (pool.length === 0) pool = Object.keys(starMarks).filter((en) => starMarks[en]);
  if (pool.length === 0) {
    alert("☆が付いた英文がありません。先に『☆』でお気に入り登録してください。");
    return;
  }

  lastShowMode = "star";
  presentSentenceByEn(pickRandomFast(pool, currentSentence?.en));
}

function confirmSentence() {
  if (!currentSentence) return;
  yesMarks[currentSentence.en] = true;
  syncOkToDb(currentSentence.en).catch((err) => console.error("ok sync failed", err));

  remainingSet.delete(currentSentence.en);
  remainingArr = Array.from(remainingSet);

  if (remainingArr.length > 0) {
    showRandom();
    return;
  }

  topMetaEl.textContent = "すべての英文を表示しました！";
  jpTextEl.textContent = "";
  enEl.textContent = "";
  document.getElementById("last-shown").textContent = "";
  showBtnEl.disabled = true;
  showBtn2El.disabled = true;
  okBtnEl.disabled = true;
  starBtnEl.disabled = true;
}

function toggleStar() {
  if (!currentSentence) return;
  const en = currentSentence.en;
  const isStarred = !starMarks[en];
  starMarks[en] = isStarred;

  syncStarToDb(en, isStarred).catch((err) => console.error("star sync failed", err));
  updateStarUi();

  if (lastShowMode === "star") showRandomStarred();
  else showRandom();
}
