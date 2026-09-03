// Shared storage + stats logic. Loaded as a classic script everywhere
// (importScripts in the service worker, <script> tag in popup/dashboard),
// so it hangs everything off a single global instead of using ES modules.

const LeetTrackStorage = (() => {
  const SESSIONS_KEY = "sessions";
  const ACTIVE_PREFIX = "active_timer_";
  const SR_PREFIX = "sr_"; // spaced repetition card per slug
  const GOALS_KEY = "topic_goals"; // { [topic]: { target: number } }
  const LC_SYNC_KEY = "lc_sync"; // cached LeetCode GraphQL response
  const NOTIF_SETTINGS_KEY = "notif_settings"; // { enabled, hour, minute }

  // Target solve times (seconds) per difficulty — what a confident solver should take.
  // These are intentionally tighter than "allowed" times to give accurate personal ratings.
  const EXPECTED_TIME = { Easy: 10 * 60, Medium: 20 * 60, Hard: 35 * 60 };

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
  // Formula: start at 100, penalise for excess time and wrong attempts.
  // Time penalty ramps up sharply after the target time to differentiate ratings.
  // Attempt penalty is heavier for Easy problems (you should get those in 1 attempt).
  // Unsolved always gets 0.
  function computeStruggleScore(session) {
    if (session.status !== "solved") return 0;
    const expected = EXPECTED_TIME[session.difficulty] || EXPECTED_TIME.Medium;
    const timeRatio = session.duration / expected; // 1.0 = solved at target time

    // Time penalty: 0 up to target, then ramps up. Solving at 2x target = -40 pts.
    const timePenalty = timeRatio <= 1 ? 0 : Math.min(65, (timeRatio - 1) * 40);

    // Attempt penalty: each wrong submission = -15pts (Easy), -10pts (Medium), -7pts (Hard)
    const attemptWeights = { Easy: 15, Medium: 10, Hard: 7 };
    const penaltyPerAttempt = attemptWeights[session.difficulty] || 10;
    const attemptPenalty = Math.min(40, (session.attempts || 0) * penaltyPerAttempt);

    return Math.max(0, Math.round(100 - timePenalty - attemptPenalty));
  }

  // Returns a human label + css class for a struggle score.
  // Thresholds tuned so real interview-pace solves rate as "Good" not "Easy ✓".
  function personalDifficulty(score) {
    if (score >= 85) return { label: "Mastered ✓", cls: "pd-easy" };     // Fast + clean
    if (score >= 65) return { label: "Good Pace", cls: "pd-good" };       // Normal interview pace
    if (score >= 40) return { label: "Needed Time", cls: "pd-medium" };   // Over target but got it
    if (score >= 15) return { label: "Struggled", cls: "pd-hard" };       // Took long or multiple tries
    return { label: "Very Hard", cls: "pd-vhard" };                        // Barely solved it
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

  // ─── Topic Goals ──────────────────────────────────────────────────────────
  function getGoals() {
    return new Promise((resolve) => {
      chrome.storage.local.get([GOALS_KEY], (res) => resolve(res[GOALS_KEY] || {}));
    });
  }

  // Parse problem input (handles URL, "#198 House Robber", "198", "house-robber", etc.)
  function parseProblemInput(input, existingSessions = []) {
    if (!input || typeof input !== "string") return null;
    let clean = input.trim();

    // 1. Check if URL: https://leetcode.com/problems/house-robber/
    const urlMatch = clean.match(/\/problems\/([^/?#]+)/);
    if (urlMatch) {
      const slug = urlMatch[1];
      const title = slug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      return { slug, title };
    }

    // 2. Check if just a problem number (e.g. "198" or "#198")
    const justNumMatch = clean.match(/^[#]?(\d+)$/);
    if (justNumMatch) {
      const num = justNumMatch[1];
      // Try to find matching problem in history
      const match = (existingSessions || []).find(
        (s) => s.title.startsWith(num + ".") || s.title.startsWith("#" + num) || s.slug.includes(num)
      );
      if (match) {
        return { slug: match.slug, title: match.title, id: num };
      }
      return { slug: num, title: `Problem #${num}`, id: num };
    }

    // 3. Check if format like "198. House Robber" or "#198 House Robber" or "198 House Robber"
    const numTitleMatch = clean.match(/^[#]?(\d+)[\.\s:\-]+(.+)$/);
    if (numTitleMatch) {
      const num = numTitleMatch[1];
      const rest = numTitleMatch[2].trim();
      const slug = rest.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return { slug, title: `#${num} ${rest}`, id: num };
    }

    // 4. Check if format like "House Robber" or "house-robber"
    const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const formattedTitle = clean.includes("-")
      ? clean.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
      : clean;
    return { slug, title: formattedTitle };
  }

  function setGoal(topic, target, problems = []) {
    return new Promise((resolve) => {
      chrome.storage.local.get([GOALS_KEY], (res) => {
        const goals = res[GOALS_KEY] || {};
        const existing = goals[topic] || {};
        goals[topic] = {
          target: Number(target) || existing.target || (problems ? problems.length : 10),
          problems: problems || existing.problems || [],
        };
        chrome.storage.local.set({ [GOALS_KEY]: goals }, () => resolve(goals[topic]));
      });
    });
  }

  function addProblemToGoal(topic, problemInput) {
    const parsed = parseProblemInput(problemInput);
    if (!parsed || !parsed.slug) return Promise.resolve(null);

    return new Promise((resolve) => {
      chrome.storage.local.get([GOALS_KEY], (res) => {
        const goals = res[GOALS_KEY] || {};
        if (!goals[topic]) {
          goals[topic] = { target: 10, problems: [] };
        }
        goals[topic].problems = goals[topic].problems || [];

        // Check if already in list
        const exists = goals[topic].problems.some((p) => p.slug === parsed.slug);
        if (!exists) {
          goals[topic].problems.push(parsed);
          // If problems count exceeds target, auto-expand target
          if (goals[topic].problems.length > goals[topic].target) {
            goals[topic].target = goals[topic].problems.length;
          }
        }
        chrome.storage.local.set({ [GOALS_KEY]: goals }, () => resolve(goals[topic]));
      });
    });
  }

  function removeProblemFromGoal(topic, problemSlug) {
    return new Promise((resolve) => {
      chrome.storage.local.get([GOALS_KEY], (res) => {
        const goals = res[GOALS_KEY] || {};
        if (goals[topic] && goals[topic].problems) {
          goals[topic].problems = goals[topic].problems.filter((p) => p.slug !== problemSlug);
          chrome.storage.local.set({ [GOALS_KEY]: goals }, () => resolve(goals[topic]));
        } else {
          resolve(null);
        }
      });
    });
  }

  function deleteGoal(topic) {
    return new Promise((resolve) => {
      chrome.storage.local.get([GOALS_KEY], (res) => {
        const goals = res[GOALS_KEY] || {};
        delete goals[topic];
        chrome.storage.local.set({ [GOALS_KEY]: goals }, resolve);
      });
    });
  }

  // Merges session history with goals to return per-topic progress
  function computeGoalProgress(sessions, goals, srCards) {
    const today = dayKey(Date.now());
    return Object.entries(goals).map(([topic, g]) => {
      const topicSessions = sessions.filter(
        (s) => (s.tags || []).includes(topic)
      );

      // Problems specific to this goal
      const problemList = (g.problems || []).map((p) => {
        const matchingSession = sessions.find((s) => s.slug === p.slug && s.status === "solved");
        return {
          ...p,
          solved: !!matchingSession,
          duration: matchingSession ? matchingSession.duration : null,
          attempts: matchingSession ? matchingSession.attempts : null,
        };
      });

      // Total solved count: either matching specific problem list or matching topic tags
      const specificSolvedCount = problemList.filter((p) => p.solved).length;
      const tagSolvedCount = topicSessions.filter((s) => s.status === "solved").length;
      const solved = problemList.length > 0 ? specificSolvedCount : tagSolvedCount;
      const target = Math.max(g.target || 0, problemList.length);

      const avgStruggle = (() => {
        const withScore = topicSessions.filter((s) => s.status === "solved");
        if (!withScore.length) return null;
        return Math.round(
          withScore.reduce((a, s) => a + computeStruggleScore(s), 0) / withScore.length
        );
      })();

      const remaining = Math.max(0, target - solved);
      const pct = target > 0 ? Math.min(100, Math.round((solved / target) * 100)) : 0;
      const todaySolved = topicSessions.filter(
        (s) => dayKey(s.timestamp) === today && s.status === "solved"
      ).length;

      return {
        topic,
        target,
        solved,
        remaining,
        pct,
        todaySolved,
        problems: problemList,
        avgStruggle,
        pd: avgStruggle !== null ? personalDifficulty(avgStruggle) : null,
      };
    }).sort((a, b) => a.pct - b.pct);
  }

  // ─── LeetCode Sync Cache ──────────────────────────────────────────────────
  function getLCSyncData() {
    return new Promise((resolve) => {
      chrome.storage.local.get([LC_SYNC_KEY], (res) => resolve(res[LC_SYNC_KEY] || null));
    });
  }

  function saveLCSyncData(data) {
    const record = { ...data, fetchedAt: Date.now() };
    return new Promise((resolve) => {
      chrome.storage.local.set({ [LC_SYNC_KEY]: record }, () => resolve(record));
    });
  }

  // ─── Notification Settings ────────────────────────────────────────────────
  function getNotifSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([NOTIF_SETTINGS_KEY], (res) => {
        resolve(res[NOTIF_SETTINGS_KEY] || { enabled: true, hour: 9, minute: 0 });
      });
    });
  }

  function saveNotifSettings(settings) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [NOTIF_SETTINGS_KEY]: settings }, resolve);
    });
  }

  // ─── Daily Plan ───────────────────────────────────────────────────────────
  // Assembles the "Today's Plan" from reviews, goals, and weak spots
  function computeDailyPlan(sessions, goals, dueReviews, tagStats) {
    const today = dayKey(Date.now());
    const todaySessions = sessions.filter((s) => dayKey(s.timestamp) === today);
    const todaySolvedCount = todaySessions.filter((s) => s.status === "solved").length;

    // Goal work: topics where remaining > 0, sorted by most-behind first
    const goalWork = Object.entries(goals).map(([topic, g]) => {
      const topicSolved = sessions.filter(
        (s) => (s.tags || []).includes(topic) && s.status === "solved"
      ).length;
      const remaining = Math.max(0, g.target - topicSolved);
      const todayTopic = todaySessions.filter(
        (s) => (s.tags || []).includes(topic) && s.status === "solved"
      ).length;
      // suggest at least 1 per day until goal is met
      const suggestToday = remaining > 0 ? Math.max(1, Math.ceil(remaining / 30)) : 0;
      return { topic, target: g.target, solved: topicSolved, remaining, todayTopic, suggestToday };
    }).filter((g) => g.remaining > 0).sort((a, b) => b.remaining - a.remaining);

    // Weak spots: topics with avgStruggle < 50, at least 1 solve
    const weakSpots = (tagStats || [])
      .filter((t) => t.solved > 0 && t.avgStruggle < 50)
      .sort((a, b) => a.avgStruggle - b.avgStruggle)
      .slice(0, 3);

    return { reviews: dueReviews, goalWork, weakSpots, todaySolvedCount };
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
    // goals
    getGoals,
    setGoal,
    deleteGoal,
    addProblemToGoal,
    removeProblemFromGoal,
    parseProblemInput,
    computeGoalProgress,
    // lc sync
    getLCSyncData,
    saveLCSyncData,
    // notifications
    getNotifSettings,
    saveNotifSettings,
    // daily plan
    computeDailyPlan,
  };
})();

if (typeof module !== "undefined") {
  module.exports = LeetTrackStorage;
}
