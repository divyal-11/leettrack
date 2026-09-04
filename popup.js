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
  new Promise((res) => chrome.runtime.sendMessage({ type: "GET_NOTIF_SETTINGS" }, res)),
]).then(([statsRes, reviewRes, notifRes]) => {
  const { sessions, stats } = statsRes || {};
  document.getElementById("streak").textContent = stats?.streak?.current || 0;
  document.getElementById("solved").textContent = stats?.solvedCount || 0;
  document.getElementById("rate").textContent = (stats?.successRate || 0) + "%";
  document.getElementById("avg").textContent = fmt(stats?.avgTimeOverall || 0);

  const today = LeetTrackStorage.dayKey(Date.now());
  const todayCount = (sessions || []).filter((s) => LeetTrackStorage.dayKey(s.timestamp) === today).length;
  document.getElementById("today").textContent = `${todayCount} problem${todayCount === 1 ? "" : "s"} today`;

  const due = reviewRes?.due || [];
  if (due.length > 0) {
    const el = document.getElementById("reviewDue");
    el.style.display = "block";
    el.textContent = `📅 ${due.length} review${due.length === 1 ? "" : "s"} due`;
  }

  // Load notification settings
  const settings = notifRes?.settings || { enabled: true, hour: 9, minute: 0 };
  const toggleEl = document.getElementById("notifEnable");
  const timeEl = document.getElementById("notifTime");

  toggleEl.checked = settings.enabled;
  const hh = String(settings.hour).padStart(2, "0");
  const mm = String(settings.minute).padStart(2, "0");
  timeEl.value = `${hh}:${mm}`;

  function persistSettings() {
    const [h, m] = timeEl.value.split(":").map(Number);
    const newSettings = {
      enabled: toggleEl.checked,
      hour: isNaN(h) ? 9 : h,
      minute: isNaN(m) ? 0 : m,
    };
    chrome.runtime.sendMessage({ type: "SAVE_NOTIF_SETTINGS", settings: newSettings });
  }

  toggleEl.addEventListener("change", persistSettings);
  timeEl.addEventListener("change", persistSettings);
});

document.getElementById("openPlan").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("plan.html") });
});

document.getElementById("openDash").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

// Check if the widget is dismissed on the current tab and show the restore button
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab || !tab.url || !tab.url.includes("leetcode.com/problems/")) return;

  // Ask the content script if the widget is currently hidden
  chrome.tabs.sendMessage(tab.id, { type: "LT_GET_WIDGET_STATE" }, (res) => {
    if (chrome.runtime.lastError) return; // content script not loaded
    if (res && res.dismissed) {
      document.getElementById("restoreBar").style.display = "block";
    }
  });
});

document.getElementById("showTimer").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "LT_SHOW_WIDGET" });
    window.close(); // close the popup after restoring
  });
});
