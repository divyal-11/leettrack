function fmtTodayDate() {
  const options = { weekday: "long", month: "short", day: "numeric", year: "numeric" };
  return new Date().toLocaleDateString(undefined, options);
}

let CURRENT_PLAN = null;
let CURRENT_GOALS = null;
let CURRENT_NOTIF_SETTINGS = null;

function renderPlan() {
  document.getElementById("welcomeDate").textContent = `Plan for ${fmtTodayDate()}`;

  Promise.all([
    new Promise((res) => chrome.runtime.sendMessage({ type: "GET_DAILY_PLAN" }, res)),
    new Promise((res) => chrome.runtime.sendMessage({ type: "GET_STATS" }, res)),
    new Promise((res) => chrome.runtime.sendMessage({ type: "GET_NOTIF_SETTINGS" }, res)),
  ]).then(([planRes, statsRes, notifRes]) => {
    const { plan, goals } = planRes || {};
    const { stats, sessions } = statsRes || {};
    const notifSettings = notifRes?.settings || { hour: 19, minute: 0 };

    CURRENT_PLAN = plan;
    CURRENT_GOALS = goals;
    CURRENT_NOTIF_SETTINGS = notifSettings;

    const reviews = plan?.reviews || [];
    const goalWork = plan?.goalWork || [];
    const weakSpots = plan?.weakSpots || [];
    const todaySolved = plan?.todaySolvedCount || 0;
    const streak = stats?.streak?.current || 0;

    // ── Summary Status ────────────────────────────────────────────────────────
    let statusText = "Ready to start today's session!";
    if (reviews.length > 0 && todaySolved === 0) {
      statusText = `You have ${reviews.length} review${reviews.length === 1 ? "" : "s"} waiting and 0 problems solved today.`;
    } else if (todaySolved > 0) {
      statusText = `Great job! You've already solved ${todaySolved} problem${todaySolved === 1 ? "" : "s"} today. Keep the momentum going!`;
    } else if (reviews.length === 0 && goalWork.length > 0) {
      statusText = `All reviews cleared! Work toward your active topic goals below.`;
    }
    document.getElementById("welcomeStatus").textContent = statusText;

    // ── Mini Stats ────────────────────────────────────────────────────────────
    const miniStatsEl = document.getElementById("todayStats");
    miniStatsEl.innerHTML = `
      <div class="mini-stat">
        <span class="mini-stat-num">${streak}</span>
        <span class="mini-stat-lbl">day streak</span>
      </div>
      <div class="mini-stat">
        <span class="mini-stat-num">${todaySolved}</span>
        <span class="mini-stat-lbl">solved today</span>
      </div>
      <div class="mini-stat">
        <span class="mini-stat-num">${reviews.length}</span>
        <span class="mini-stat-lbl">reviews due</span>
      </div>
      <div class="mini-stat">
        <span class="mini-stat-num">${Object.keys(goals || {}).length}</span>
        <span class="mini-stat-lbl">active goals</span>
      </div>
    `;

    // ── 1. Reviews Due ────────────────────────────────────────────────────────
    const reviewBadge = document.getElementById("reviewBadge");
    const reviewList = document.getElementById("planReviewList");
    reviewBadge.textContent = reviews.length;

    if (!reviews.length) {
      reviewList.innerHTML = `<div class="empty-notice">🎉 No reviews due today! All spaced repetition cards are up to date.</div>`;
    } else {
      reviewList.innerHTML = reviews.map((card) => {
        const overdueMs = Date.now() - card.nextReview;
        const daysOver = Math.floor(overdueMs / (1000 * 60 * 60 * 24));
        const urgencyClass = daysOver >= 3 ? "urgent" : daysOver >= 1 ? "warning" : "good";
        const overdueText = daysOver > 0 ? `${daysOver}d overdue` : "due today";

        return `
          <div class="plan-item ${urgencyClass}">
            <div class="item-left">
              <span class="badge ${card.difficulty || "Medium"}">${card.difficulty || "Medium"}</span>
              <a href="https://leetcode.com/problems/${card.slug}/" target="_blank" class="prob-link" title="${card.title || card.slug}">
                ${card.title || card.slug}
              </a>
            </div>
            <div class="item-right">
              <span>Interval: ${card.interval}d · ${overdueText}</span>
              <a href="https://leetcode.com/problems/${card.slug}/" target="_blank" class="action-link">Solve ➔</a>
            </div>
          </div>`;
      }).join("");
    }

    // ── 2. Topic Goals ────────────────────────────────────────────────────────
    const goalBadge = document.getElementById("goalBadge");
    const goalList = document.getElementById("planGoalList");
    goalBadge.textContent = goalWork.length;

    if (!goalWork.length) {
      goalList.innerHTML = `<div class="empty-notice">🎯 No active topic goals remaining or set. <a href="dashboard.html" style="color:var(--amber)">Set new goals in Dashboard</a></div>`;
    } else {
      goalList.innerHTML = goalWork.map((g) => {
        const goalObj = goals && goals[g.topic];
        const specificProblems = goalObj?.problems || [];
        const unsolvedSpecific = specificProblems.find((p) => {
          return !sessions.some((s) => s.slug === p.slug && s.status === "solved");
        });

        const pct = g.target > 0 ? Math.min(100, Math.round((g.solved / g.target) * 100)) : 0;
        const tagSlug = g.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const solveUrl = unsolvedSpecific
          ? `https://leetcode.com/problems/${unsolvedSpecific.slug}/`
          : `https://leetcode.com/tag/${tagSlug}/`;
        const actionText = unsolvedSpecific
          ? `Next: ${unsolvedSpecific.title} ➔`
          : `Browse Tag ➔`;

        return `
          <div class="plan-item">
            <div class="item-left">
              <span style="font-weight:600; color:var(--text);">${g.topic}</span>
              <div class="goal-plan-bar">
                <div class="goal-plan-fill" style="width:${pct}%"></div>
              </div>
            </div>
            <div class="item-right">
              <span>${g.solved}/${g.target} done (${pct}%) · ${g.remaining} left</span>
              <a href="${solveUrl}" target="_blank" class="action-link">${actionText}</a>
            </div>
          </div>`;
      }).join("");
    }

    // ── 3. Weak Spots ─────────────────────────────────────────────────────────
    const weakList = document.getElementById("planWeakList");
    if (!weakSpots.length) {
      weakList.innerHTML = `<div class="empty-notice">No low-struggle topics identified yet. Solve more problems to calibrate your weakness report.</div>`;
    } else {
      weakList.innerHTML = weakSpots.map((t) => {
        const pd = LeetTrackStorage.personalDifficulty(t.avgStruggle);
        const tagSlug = t.tag.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const leetcodeTagUrl = `https://leetcode.com/tag/${tagSlug}/`;

        return `
          <div class="plan-item warning">
            <div class="item-left">
              <span style="font-weight:600; color:var(--text);">${t.tag}</span>
              <span class="pd-badge ${pd.cls}">${pd.label}</span>
            </div>
            <div class="item-right">
              <span>Success: ${t.successRate}% · Avg Struggle: ${t.avgStruggle}/100</span>
              <a href="${leetcodeTagUrl}" target="_blank" class="action-link">Practice Tag ➔</a>
            </div>
          </div>`;
      }).join("");
    }
  });
}

// ── Google Calendar Sync Action ───────────────────────────────────────────────
function openGoogleCalendar() {
  const plan = CURRENT_PLAN;
  const goals = CURRENT_GOALS;
  const notifSettings = CURRENT_NOTIF_SETTINGS;

  const reviews = plan?.reviews || [];
  const goalWork = plan?.goalWork || [];

  let title = "🔥 LeetCode Practice & Revisions";
  if (reviews.length > 0) {
    title = `🔥 LeetCode: ${reviews.length} Revision${reviews.length === 1 ? "" : "s"} Due`;
  } else if (goalWork.length > 0) {
    title = `🔥 LeetCode: ${goalWork[0].topic} Practice`;
  }

  const descLines = ["🎯 Today's LeetCode Roadmap (LeetTrack):", ""];

  if (reviews.length > 0) {
    descLines.push("📅 SPACING REVISIONS DUE TODAY:");
    reviews.forEach((r, i) => {
      descLines.push(`${i + 1}. ${r.title || r.slug} (${r.difficulty || "Medium"}): https://leetcode.com/problems/${r.slug}/`);
    });
    descLines.push("");
  }

  if (goalWork.length > 0) {
    descLines.push("🎯 TOPIC GOALS:");
    goalWork.forEach((g) => {
      descLines.push(`• ${g.topic}: ${g.solved}/${g.target} done (${g.remaining} remaining)`);
      const goalObj = goals && goals[g.topic];
      const specific = goalObj?.problems || [];
      if (specific.length > 0) {
        specific.slice(0, 3).forEach((p) => {
          descLines.push(`   ➔ ${p.title}: https://leetcode.com/problems/${p.slug}/`);
        });
      }
    });
    descLines.push("");
  }

  descLines.push("Happy Grinding! Tracked with LeetTrack.");

  const now = new Date();
  const startTime = new Date();
  if (notifSettings && typeof notifSettings.hour === "number") {
    startTime.setHours(notifSettings.hour, notifSettings.minute || 0, 0, 0);
  } else {
    startTime.setHours(19, 0, 0, 0);
  }

  if (startTime <= now) {
    startTime.setHours(now.getHours() + 1, 0, 0, 0);
  }

  const endTime = new Date(startTime.getTime() + 45 * 60 * 1000); // 45 minutes

  const pad = (n) => String(n).padStart(2, "0");
  const formatGCalDate = (d) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

  const datesParam = `${formatGCalDate(startTime)}/${formatGCalDate(endTime)}`;
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(descLines.join("\n"))}&dates=${datesParam}`;

  window.open(gcalUrl, "_blank");
}

document.getElementById("addCalendarBtn").addEventListener("click", openGoogleCalendar);

renderPlan();
