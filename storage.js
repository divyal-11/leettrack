// Shared storage + stats logic. Loaded as a classic script everywhere
// (importScripts in the service worker, <script> tag in popup/dashboard),
// so it hangs everything off a single global instead of using ES modules.

const LeetTrackStorage = (() => {
  const SESSIONS_KEY = "sessions";
  const ACTIVE_PREFIX = "active_timer_";

  function getAllSessions() {
    return new Promise((resolve) => {
      chrome.storage.local.get([SESSIONS_KEY], (res) => {
        resolve(res[SESSIONS_KEY] || []);
      });
    });
  }

  function saveSession(session) {
    return new Promise((resolve) => {
      chrome.storage.local.get([SESSIONS_KEY], (res) => {
        const sessions = res[SESSIONS_KEY] || [];
        // replace an existing session for the same slug on the same day
        // so reopening + resubmitting a problem doesn't create duplicates
        const todayKey = dayKey(session.timestamp);
        const idx = sessions.findIndex(
          (s) => s.slug === session.slug && dayKey(s.timestamp) === todayKey
        );
        if (idx !== -1) {
          sessions[idx] = session;
        } else {
          sessions.push(session);
        }
        chrome.storage.local.set({ [SESSIONS_KEY]: sessions }, () => resolve(session));
      });
    });
  }

  function clearAllSessions() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [SESSIONS_KEY]: [] }, resolve);
    });
  }

  function getActiveTimer(slug) {
    const key = ACTIVE_PREFIX + slug;
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (res) => resolve(res[key] || null));
    });
  }

  function setActiveTimer(slug, state) {
    const key = ACTIVE_PREFIX + slug;
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: state }, resolve);
    });
  }

  function clearActiveTimer(slug) {
    const key = ACTIVE_PREFIX + slug;
    return new Promise((resolve) => {
      chrome.storage.local.remove([key], resolve);
    });
  }

  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }

  function computeStats(sessions) {
    const total = sessions.length;
    const solved = sessions.filter((s) => s.status === "solved");
    const successRate = total ? Math.round((solved.length / total) * 100) : 0;

    const avgTime = (list) =>
      list.length ? Math.round(list.reduce((a, s) => a + s.duration, 0) / list.length) : 0;

    const byDifficulty = { Easy: [], Medium: [], Hard: [] };
    sessions.forEach((s) => {
      if (byDifficulty[s.difficulty]) byDifficulty[s.difficulty].push(s);
    });

    const difficultyStats = Object.fromEntries(
      Object.entries(byDifficulty).map(([diff, list]) => [
        diff,
        {
          count: list.length,
          solved: list.filter((s) => s.status === "solved").length,
          avgTime: avgTime(list.filter((s) => s.status === "solved")),
        },
      ])
    );

    // Tag stats (best-effort — tags may be empty if LeetCode didn't expose them)
    const tagMap = {};
    sessions.forEach((s) => {
      (s.tags || []).forEach((tag) => {
        if (!tagMap[tag]) tagMap[tag] = { count: 0, solved: 0, totalTime: 0 };
        tagMap[tag].count += 1;
        if (s.status === "solved") {
          tagMap[tag].solved += 1;
          tagMap[tag].totalTime += s.duration;
        }
      });
    });
    const tagStats = Object.entries(tagMap)
      .map(([tag, v]) => ({
        tag,
        count: v.count,
        solved: v.solved,
        avgTime: v.solved ? Math.round(v.totalTime / v.solved) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Daily activity map for the grind trail (day -> solved count)
    const dailyMap = {};
    sessions.forEach((s) => {
      const k = dayKey(s.timestamp);
      dailyMap[k] = dailyMap[k] || { solved: 0, attempted: 0 };
      dailyMap[k].attempted += 1;
      if (s.status === "solved") dailyMap[k].solved += 1;
    });

    // Streak: consecutive days (ending today or yesterday) with >=1 solve
    const solvedDays = new Set(
      solved.map((s) => dayKey(s.timestamp))
    );
    let current = 0;
    let cursor = new Date();
    // allow streak to still count if today has no solve yet but yesterday does
    if (!solvedDays.has(dayKey(cursor.getTime()))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (solvedDays.has(dayKey(cursor.getTime()))) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    let best = 0;
    let run = 0;
    const sortedDays = Array.from(solvedDays).sort();
    let prevDate = null;
    sortedDays.forEach((dstr) => {
      const d = new Date(dstr);
      if (prevDate && (d - prevDate) / 86400000 === 1) {
        run += 1;
      } else {
        run = 1;
      }
      best = Math.max(best, run);
      prevDate = d;
    });

    return {
      total,
      solvedCount: solved.length,
      successRate,
      avgTimeOverall: avgTime(solved),
      difficultyStats,
      tagStats,
      dailyMap,
      streak: { current, best },
    };
  }

  return {
    getAllSessions,
    saveSession,
    clearAllSessions,
    getActiveTimer,
    setActiveTimer,
    clearActiveTimer,
    computeStats,
    dayKey,
  };
})();

if (typeof module !== "undefined") {
  module.exports = LeetTrackStorage;
}
