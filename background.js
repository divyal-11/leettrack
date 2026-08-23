importScripts("storage.js");

// ─── Daily Alarm Setup ────────────────────────────────────────────────────────
// Register alarm on install and on browser startup
chrome.runtime.onInstalled.addListener(() => scheduleDailyAlarm());
chrome.runtime.onStartup.addListener(() => scheduleDailyAlarm());

async function scheduleDailyAlarm() {
  const settings = await LeetTrackStorage.getNotifSettings();
  if (!settings.enabled) {
    chrome.alarms.clear("leettrack-daily");
    return;
  }
  // Calculate ms until next fire time today (or tomorrow if already past)
  const now = new Date();
  const next = new Date();
  next.setHours(settings.hour, settings.minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delayMs = next.getTime() - now.getTime();

  chrome.alarms.create("leettrack-daily", {
    delayInMinutes: delayMs / 60000,
    periodInMinutes: 24 * 60,
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "leettrack-daily") return;
  const settings = await LeetTrackStorage.getNotifSettings();
  if (!settings.enabled) return;

  const sessions = await LeetTrackStorage.getAllSessions();
  const due = await LeetTrackStorage.getDueReviews();
  const goals = await LeetTrackStorage.getGoals();

  const today = LeetTrackStorage.dayKey(Date.now());
  const todayCount = sessions.filter(
    (s) => LeetTrackStorage.dayKey(s.timestamp) === today && s.status === "solved"
  ).length;

  // Build a useful notification message
  const lines = [];
  if (due.length > 0) lines.push(`📅 ${due.length} review${due.length === 1 ? "" : "s"} due`);
  if (todayCount === 0) lines.push("🟡 No problems solved today yet");

  // Check if any goal is lagging
  const lagging = Object.entries(goals).filter(([topic, g]) => {
    const solved = sessions.filter(
      (s) => (s.tags || []).includes(topic) && s.status === "solved"
    ).length;
    return solved < g.target;
  });
  if (lagging.length > 0) lines.push(`🎯 ${lagging.length} topic goal${lagging.length === 1 ? "" : "s"} in progress`);

  if (lines.length === 0) lines.push("✅ All caught up — keep the streak going!");

  chrome.notifications.create("leettrack-reminder", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "LeetTrack — Time to grind 🔥",
    message: lines.join("\n"),
    priority: 1,
  });
});

// Open dashboard when notification is clicked
chrome.notifications.onClicked.addListener((id) => {
  if (id === "leettrack-reminder") {
    chrome.tabs.create({ url: chrome.runtime.getURL("plan.html") });
  }
});

// ─── LeetCode GraphQL Sync ────────────────────────────────────────────────────
async function fetchLeetCodeStats() {
  // Uses LeetCode's internal GraphQL API. Works only when the user is logged in.
  const query = `
    query userSessionProgress {
      allQuestionsCount { difficulty count }
      solvedQuestionsCount { difficulty count }
    }
  `;
  try {
    const resp = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      credentials: "include", // sends the LeetCode session cookie
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const solved = json?.data?.solvedQuestionsCount;
    if (!solved) return null;

    const get = (diff) => (solved.find((x) => x.difficulty === diff)?.count) || 0;
    const data = {
      easySolved: get("Easy"),
      mediumSolved: get("Medium"),
      hardSolved: get("Hard"),
      totalSolved: get("All"),
    };
    await LeetTrackStorage.saveLCSyncData(data);
    return data;
  } catch (e) {
    return null;
  }
}

// ─── Message Handlers ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SAVE_SESSION") {
    LeetTrackStorage.saveSession(msg.session).then((session) => {
      return LeetTrackStorage.scheduleReview(session).then(() => {
        return LeetTrackStorage.clearActiveTimer(session.slug);
      });
    }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "GET_ACTIVE_TIMER") {
    LeetTrackStorage.getActiveTimer(msg.slug).then((state) => sendResponse({ state }));
    return true;
  }

  if (msg.type === "SET_ACTIVE_TIMER") {
    LeetTrackStorage.setActiveTimer(msg.slug, msg.state).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "CLEAR_ACTIVE_TIMER") {
    LeetTrackStorage.clearActiveTimer(msg.slug).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "GET_STATS") {
    LeetTrackStorage.getAllSessions().then((sessions) => {
      sendResponse({ sessions, stats: LeetTrackStorage.computeStats(sessions) });
    });
    return true;
  }

  if (msg.type === "GET_REVIEW_QUEUE") {
    LeetTrackStorage.getDueReviews().then((due) => sendResponse({ due }));
    return true;
  }

  if (msg.type === "GET_ALL_SR_CARDS") {
    LeetTrackStorage.getAllSRCards().then((cards) => sendResponse({ cards }));
    return true;
  }

  if (msg.type === "GET_GOALS") {
    LeetTrackStorage.getGoals().then((goals) => sendResponse({ goals }));
    return true;
  }

  if (msg.type === "SET_GOAL") {
    LeetTrackStorage.setGoal(msg.topic, msg.target).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "DELETE_GOAL") {
    LeetTrackStorage.deleteGoal(msg.topic).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "GET_DAILY_PLAN") {
    Promise.all([
      LeetTrackStorage.getAllSessions(),
      LeetTrackStorage.getGoals(),
      LeetTrackStorage.getDueReviews(),
    ]).then(([sessions, goals, dueReviews]) => {
      const stats = LeetTrackStorage.computeStats(sessions);
      const plan = LeetTrackStorage.computeDailyPlan(sessions, goals, dueReviews, stats.tagStats);
      sendResponse({ plan, goals });
    });
    return true;
  }

  if (msg.type === "SYNC_LEETCODE") {
    fetchLeetCodeStats().then((data) => sendResponse({ data }));
    return true;
  }

  if (msg.type === "GET_LC_SYNC") {
    LeetTrackStorage.getLCSyncData().then((data) => sendResponse({ data }));
    return true;
  }

  if (msg.type === "SAVE_NOTIF_SETTINGS") {
    LeetTrackStorage.saveNotifSettings(msg.settings).then(() => {
      scheduleDailyAlarm(); // reschedule with new time
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "GET_NOTIF_SETTINGS") {
    LeetTrackStorage.getNotifSettings().then((settings) => sendResponse({ settings }));
    return true;
  }

  if (msg.type === "CLEAR_ALL") {
    LeetTrackStorage.clearAllSessions().then(() => sendResponse({ ok: true }));
    return true;
  }
});
