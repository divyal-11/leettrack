// Shared storage + stats logic. Loaded as a classic script everywhere
// (importScripts in the service worker, <script> tag in popup/dashboard),
// so it hangs everything off a single global instead of using ES modules.

const LeetTrackStorage = (() => {
  const SESSIONS_KEY = "sessions";
  const ACTIVE_PREFIX = "active_timer_";
  const SR_PREFIX = "sr_"; // spaced repetition card per slug

  // Expected solve times (seconds) per difficulty — used for struggle scoring
  const EXPECTED_TIME = { Easy: 15 * 60, Medium: 30 * 60, Hard: 45 * 60 };

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

  // ─── Personal Struggle Score ──────────────────────────────────────────────
  // Returns 0–100. Lower = harder for you personally.
  // Formula: start at 100 if solved, penalise for excess time and each attempt.
  // Unsolved always gets 0.
  function computeStruggleScore(session) {
    if (session.status !== "solved") return 0;
    const expected = EXPECTED_TIME[session.difficulty] || EXPECTED_TIME.Medium;
    const timeRatio = session.duration / expected; // 1.0 = right on expected time
    const timePenalty = Math.max(0, (timeRatio - 1) * 35); // -35pts per expected-time overage
    const attemptPenalty = (session.attempts || 0) * 12; // -12pts per wrong answer
    return Math.max(0, Math.round(100 - timePenalty - attemptPenalty));
  }

  // Returns a human label + css class for a struggle score
  function personalDifficulty(score) {
    if (score >= 80) return { label: "Easy ✓", cls: "pd-easy" };
    if (score >= 50) return { label: "Medium", cls: "pd-medium" };
    if (score >= 20) return { label: "Hard", cls: "pd-hard" };
    return { label: "Very Hard", cls: "pd-vhard" };
  }

  // Derives an SM-2 quality rating (0–5) from a struggle score
  // 5 = trivial recall, 0 = complete blackout / unsolved
  function qualityFromScore(score) {
    if (score >= 85) return 5;
    if (score >= 70) return 4;
    if (score >= 50) return 3;
    if (score >= 20) return 2;
    if (score > 0)   return 1;
    return 0; // unsolved
  }

  // ─── SM-2 Spaced Repetition ───────────────────────────────────────────────
  // Each problem gets a "card" with SM-2 metadata stored under sr_<slug>.
  // Reference: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2

  function _srKey(slug) { return SR_PREFIX + slug; }

  function getSRCard(slug) {
    return new Promise((resolve) => {
      chrome.storage.local.get([_srKey(slug)], (res) => {
        resolve(res[_srKey(slug)] || null);
      });
    });
  }

  // Apply SM-2 update given a quality rating q (0–5) and current card state.
  // Returns the updated card (does NOT persist — caller must call saveSRCard).
  function sm2Update(card, q) {
    const now = Date.now();
    let { easeFactor = 2.5, interval = 1, repetitions = 0 } = card || {};

    if (q >= 3) {
      // successful recall
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easeFactor);
      }
      easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
      repetitions += 1;
    } else {
      // failed recall — reset to beginning
      repetitions = 0;
      interval = 1;
    }

    const nextReview = now + interval * 24 * 60 * 60 * 1000;
    return { easeFactor, interval, repetitions, nextReview, lastReviewed: now };
  }

  function saveSRCard(slug, card) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [_srKey(slug)]: card }, resolve);
    });
  }

  // Schedule (or re-schedule) a problem after a session is saved.
  // Automatically called by saveSessionAndSchedule.
  function scheduleReview(session) {
    const slug = session.slug;
    return getSRCard(slug).then((existing) => {
      const q = qualityFromScore(computeStruggleScore(session));
      const updated = sm2Update(existing, q);
      // carry forward the problem title for the review queue UI
      updated.slug = slug;
      updated.title = session.title;
      updated.difficulty = session.difficulty;
      return saveSRCard(slug, updated);
    });
  }

  // Returns all SR cards whose nextReview <= now (i.e. due today or overdue)
  function getDueReviews() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (all) => {
        const now = Date.now();
        const due = Object.entries(all)
          .filter(([k]) => k.startsWith(SR_PREFIX))
          .map(([, v]) => v)
          .filter((c) => c && c.nextReview <= now)
          .sort((a, b) => a.nextReview - b.nextReview);
        resolve(due);
      });
    });
  }

  // Returns all SR cards (for the full schedule view)
  function getAllSRCards() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (all) => {
        const cards = Object.entries(all)
          .filter(([k]) => k.startsWith(SR_PREFIX))
          .map(([, v]) => v)
          .sort((a, b) => a.nextReview - b.nextReview);
        resolve(cards);
      });
    });
  }

  // ─── Stats ────────────────────────────────────────────────────────────────
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

    // Tag stats enriched with struggle scores for weak-spot detection
    const tagMap = {};
    sessions.forEach((s) => {
      const score = computeStruggleScore(s);
      (s.tags || []).forEach((tag) => {
        if (!tagMap[tag]) tagMap[tag] = { count: 0, solved: 0, totalTime: 0, totalScore: 0 };
        tagMap[tag].count += 1;
        if (s.status === "solved") {
          tagMap[tag].solved += 1;
          tagMap[tag].totalTime += s.duration;
          tagMap[tag].totalScore += score;
        }
      });
    });
    const tagStats = Object.entries(tagMap)
      .map(([tag, v]) => ({
        tag,
        count: v.count,
        solved: v.solved,
        avgTime: v.solved ? Math.round(v.totalTime / v.solved) : 0,
        // avgStruggle: lower = harder for you. Only for solved problems.
        avgStruggle: v.solved ? Math.round(v.totalScore / v.solved) : 0,
        successRate: Math.round((v.solved / v.count) * 100),
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
    // struggle score
    computeStruggleScore,
    personalDifficulty,
    qualityFromScore,
    // spaced repetition
    getSRCard,
    sm2Update,
    saveSRCard,
    scheduleReview,
    getDueReviews,
    getAllSRCards,
  };
})();

if (typeof module !== "undefined") {
  module.exports = LeetTrackStorage;
}
