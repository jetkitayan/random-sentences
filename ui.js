function updateStarUi() {
  document.getElementById("starBtn").textContent = "★";
}

function showStats() {
  const tbody = document.getElementById("statsBody");
  tbody.innerHTML = "";
  for (const s of allSentences) {
    const c = shownCounts[s.en] || 0;
    const hasOk = !!yesMarks[s.en];
    const hasStar = !!starMarks[s.en];
    const okCell = hasOk ? "☆" : "";
    const starCell = hasStar ? "★" : "";
    tbody.innerHTML += `
      <tr>
        <td>${s.jp}</td>
        <td>${s.en}</td>
        <td style="text-align:center;">${okCell}</td>
        <td style="text-align:center;">${starCell}</td>
        <td style="text-align:center;">${c}</td>
      </tr>`;
  }
  document.getElementById("statsArea").style.display = "block";
}

function copyStats(event) {
  event?.preventDefault();
  const table = document.querySelector("#statsArea table");
  if (!table) {
    alert("一覧が表示されていません。");
    return;
  }

  let text = "";
  table.querySelectorAll("tr").forEach((tr) => {
    const cols = Array.from(tr.querySelectorAll("th, td")).map((td) => td.innerText);
    text += cols.join("@") + "\n";
  });

  navigator.clipboard.writeText(text)
    .then(() => {
      alert("コピーしました。");
    })
    .catch(() => alert("コピーに失敗しました。もう一度お試しください。"));
}