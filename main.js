document.addEventListener("DOMContentLoaded", () => {
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
});