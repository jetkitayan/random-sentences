const API_BASE = "https://memo-save-api.jetkitayan.workers.dev";

function getAuthHeader() {
  return "Basic " + btoa("jet-pay:kibare@1002");
}

async function fetchData(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);
  return res.text();
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