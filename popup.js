function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

chrome.runtime.sendMessage({ type: "GET_STATS" }, (res) => {
  const { sessions, stats } = res;
  document.getElementById("streak").textContent = stats.streak.current;
  document.getElementById("solved").textContent = stats.solvedCount;
  document.getElementById("rate").textContent = stats.successRate + "%";
  document.getElementById("avg").textContent = fmt(stats.avgTimeOverall);

  const today = LeetTrackStorage.dayKey(Date.now());
  const todayCount = sessions.filter((s) => LeetTrackStorage.dayKey(s.timestamp) === today).length;
  document.getElementById("today").textContent = `${todayCount} problem${todayCount === 1 ? "" : "s"} today`;
});

document.getElementById("openDash").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});
