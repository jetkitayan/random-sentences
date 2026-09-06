const API_BASE = "https://memo-save-api.jetkitayan.workers.dev";
const BASIC_USER = "jet-pay";
const BASIC_PASS = "kibare@1002";

function getAuthHeader() {
  return "Basic " + btoa(`${BASIC_USER}:${BASIC_PASS}`);
}

async function fetchData(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);
  return res.text();
}

function parseDbData(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("DBデータの解析に失敗しました");
  }
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": getAuthHeader(),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`API失敗: HTTP ${res.status}`);
  }

  if (!res.ok || !data.ok) {
    throw new Error(data.error || `API失敗: HTTP ${res.status}`);
  }
  return data;
}

async function syncOkToDb(en) {
  await apiPost("/api/random-sync/ok", {
    file: fileParam,
    en,
  });
}

async function syncStarToDb(en, star) {
  await apiPost("/api/random-sync/star", {
    file: fileParam,
    en,
    star,
  });
}

async function syncCustomToDb(text) {
  await apiPost("/api/random-sync/custom", {
    file: fileParam,
    text,
  });
}

async function syncCustomClearToDb() {
  await apiPost("/api/random-sync/custom-clear", {
    file: fileParam,
  });
}

async function syncResetToDb() {
  await apiPost("/api/random-sync/reset", {
    file: fileParam,
  });
}