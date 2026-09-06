function updateStarUi() {
    document.getElementById("starBtn").textContent = "★";
  }
  
  function showStats() {
    const tbody = document.getElementById("statsBody");
    tbody.innerHTML = "";
    for (const s of allSentences) {
      const c = shownCounts[s.en] || 0;
      const yes = yesMarks[s.en] ? "●" : "○";
      const star = starMarks[s.en] ? "★" : "☆";
      tbody.innerHTML += `
        <tr>
          <td>${s.jp}</td>
          <td>${s.en}</td>
          <td style="text-align:center;">${yes}</td>
          <td style="text-align:center;">${star}</td>
          <td style="text-align:center;">${c}</td>
        </tr>`;
    }
    document.getElementById("statsArea").style.display = "block";
  }