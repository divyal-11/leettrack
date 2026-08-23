function fmt(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

Promise.all([
  new Promise((res) => chrome.runtime.sendMessage({ type: "GET_STATS" }, res)),
  new Promise((res) => chrome.runtime.sendMessage({ type: "GET_REVIEW_QUEUE" }, res)),
]).then(([statsRes, reviewRes]) => {
  const { sessions, stats } = statsRes;
  document.getElementById("streak").textContent = stats.streak.current;
  document.getElementById("solved").textContent = stats.solvedCount;
  document.getElementById("rate").textContent = stats.successRate + "%";
  document.getElementById("avg").textContent = fmt(stats.avgTimeOverall);

  const today = LeetTrackStorage.dayKey(Date.now());
  const todayCount = sessions.filter((s) => LeetTrackStorage.dayKey(s.timestamp) === today).length;
  document.getElementById("today").textContent = `${todayCount} problem${todayCount === 1 ? "" : "s"} today`;

  const due = reviewRes.due || [];
  if (due.length > 0) {
    const el = document.getElementById("reviewDue");
    el.style.display = "block";
    el.textContent = `📅 ${due.length} review${due.length === 1 ? "" : "s"} due`;
  }
});

document.getElementById("openDash").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});
