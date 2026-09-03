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
async function fetchLeetCodeStats(manualUsername) {
  try {
    let username = manualUsername ? manualUsername.trim() : "";

    // 1. If username not provided, try to detect active logged-in user session
    if (!username) {
      try {
        const statusResp = await fetch("https://leetcode.com/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Referer: "https://leetcode.com",
          },
          body: JSON.stringify({
            query: `query globalData { userStatus { isSignedIn username } }`,
          }),
        });
        if (statusResp.ok) {
          const statusJson = await statusResp.json();
          if (statusJson?.data?.userStatus?.isSignedIn && statusJson.data.userStatus.username) {
            username = statusJson.data.userStatus.username;
          }
        }
      } catch (e) {}
    }

    // 2. Query LeetCode GraphQL by username
    if (username) {
      const query = `
        query userProblemsSolved($username: String!) {
          matchedUser(username: $username) {
            username
            submitStatsGlobal {
              acSubmissionNum {
                difficulty
                count
              }
            }
          }
        }
      `;
      const resp = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Referer: "https://leetcode.com",
        },
        body: JSON.stringify({
          query,
          variables: { username },
        }),
      });

      if (resp.ok) {
        const json = await resp.json();
        const acList = json?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum;
        if (acList) {
          const get = (d) => acList.find((x) => x.difficulty === d)?.count || 0;
          const data = {
            username,
            easySolved: get("Easy"),
            mediumSolved: get("Medium"),
            hardSolved: get("Hard"),
            totalSolved: get("All"),
          };
          await LeetTrackStorage.saveLCSyncData(data);
          return data;
        }
      }
    }

    // 3. Fallback to session query
    const sessionQuery = `
      query userSessionProgress {
        allQuestionsCount { difficulty count }
        solvedQuestionsCount { difficulty count }
      }
    `;
    const sessionResp = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: "https://leetcode.com",
      },
      body: JSON.stringify({ query: sessionQuery }),
    });
    if (sessionResp.ok) {
      const sessionJson = await sessionResp.json();
      const solved = sessionJson?.data?.solvedQuestionsCount;
      if (solved) {
        const get = (d) => solved.find((x) => x.difficulty === d)?.count || 0;
        const data = {
          username: username || "LeetCode User",
          easySolved: get("Easy"),
          mediumSolved: get("Medium"),
          hardSolved: get("Hard"),
          totalSolved: get("All"),
        };
        await LeetTrackStorage.saveLCSyncData(data);
        return data;
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}


// ─── Fetch topic tags for a problem slug from LeetCode GraphQL ───────────────
async function fetchTopicTags(slug) {
  try {
    const resp = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: "https://leetcode.com" },
      body: JSON.stringify({
        query: `query questionData($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            topicTags { name }
          }
        }`,
        variables: { titleSlug: slug },
      }),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    return (json?.data?.question?.topicTags || []).map((t) => t.name);
  } catch (e) {
    return [];
  }
}

// ─── Message Handlers ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SAVE_SESSION") {
    const session = msg.session;
    // Enrich tags from LeetCode GraphQL if page-scraped tags are empty
    const enrichAndSave = async () => {
      if (!session.tags || session.tags.length === 0) {
        session.tags = await fetchTopicTags(session.slug);
      }
      await LeetTrackStorage.saveSession(session);
      await LeetTrackStorage.scheduleReview(session);
      await LeetTrackStorage.clearActiveTimer(session.slug);
      sendResponse({ ok: true });
    };
    enrichAndSave();
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

  if (msg.type === "ADD_PROBLEM_TO_GOAL") {
    LeetTrackStorage.addProblemToGoal(msg.topic, msg.problemInput).then((goal) => {
      sendResponse({ ok: true, goal });
    });
    return true;
  }

  if (msg.type === "REMOVE_PROBLEM_FROM_GOAL") {
    LeetTrackStorage.removeProblemFromGoal(msg.topic, msg.slug).then((goal) => {
      sendResponse({ ok: true, goal });
    });
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
    fetchLeetCodeStats(msg.username).then((data) => sendResponse({ data }));
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
