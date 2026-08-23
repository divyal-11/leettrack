let ALL_SESSIONS = [];
let ALL_STATS = null;
let ALL_GOALS = {};

function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Stat Strip ────────────────────────────────────────────────────────────────
function renderStatStrip(stats) {
  const totalTimeMin = Math.round(
    ALL_SESSIONS.reduce((a, s) => a + s.duration, 0) / 60
  );
  const items = [
    [stats.streak.current, "day streak"],
    [stats.streak.best, "best streak"],
    [stats.solvedCount, "solved"],
    [stats.successRate + "%", "success rate"],
    [fmtTime(stats.avgTimeOverall), "avg time"],
    [totalTimeMin + "m", "total practiced"],
  ];
  document.getElementById("statStrip").innerHTML = items
    .map(([num, lbl]) => `<div class="stat-card"><div class="stat-num">${num}</div><div class="stat-lbl">${lbl}</div></div>`)
    .join("");
}

// ── LeetCode Sync Strip ───────────────────────────────────────────────────────
function renderLCSync(data) {
  const textEl = document.getElementById("syncText");
  const usernameInput = document.getElementById("syncUsername");

  if (!data) {
    textEl.innerHTML = `LeetCode Profile: <span style="color:var(--muted)">Not synced yet (enter your LeetCode username or log into leetcode.com)</span>`;
    return;
  }

  if (data.username && !usernameInput.value) {
    usernameInput.value = data.username;
  }

  const minsAgo = Math.max(0, Math.round((Date.now() - data.fetchedAt) / 60000));
  const timeStr = minsAgo === 0 ? "just now" : `${minsAgo}m ago`;
  const userTag = data.username ? ` (@${data.username})` : "";

  textEl.innerHTML = `LeetCode Profile${userTag}: <span class="sync-badge">${data.totalSolved || 0} solved</span> (${data.easySolved || 0}E / ${data.mediumSolved || 0}M / ${data.hardSolved || 0}H) · synced ${timeStr}`;
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
function renderHeatmap(stats) {
  const days = 182; // ~26 weeks
  const cells = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let max = 1;
  Object.values(stats.dailyMap).forEach((d) => (max = Math.max(max, d.solved)));

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = LeetTrackStorage.dayKey(d.getTime());
    const entry = stats.dailyMap[key];
    const solved = entry ? entry.solved : 0;
    let level = 0;
    if (solved > 0) {
      const ratio = solved / max;
      level = ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
    }
    cells.push(`<div class="heat-cell l${level}" title="${key}: ${solved} solved"></div>`);
  }
  document.getElementById("heatmap").innerHTML = cells.join("");
  document.getElementById("trailSub").textContent = `last ${days} days`;
}

// ── Topic Goals ───────────────────────────────────────────────────────────────
function renderGoals(goals, sessions) {
  ALL_GOALS = goals || {};
  const entries = Object.entries(ALL_GOALS);
  const subEl = document.getElementById("goalsSub");
  const listEl = document.getElementById("goalsList");

  subEl.textContent = `${entries.length} active goal${entries.length === 1 ? "" : "s"}`;

  if (!entries.length) {
    listEl.innerHTML = '<div class="tag-empty">No active goals. Create a study goal below (e.g. "Dynamic Programming" or "Blind 75").</div>';
    return;
  }

  listEl.innerHTML = entries.map(([topic, g]) => {
    const problems = g.problems || [];
    
    // Check which problems are solved from sessions
    const problemItems = problems.map((p) => {
      const match = sessions.find((s) => s.slug === p.slug && s.status === "solved");
      return {
        ...p,
        solved: !!match,
        duration: match ? match.duration : null,
        attempts: match ? match.attempts : null,
      };
    });

    const specificSolved = problemItems.filter((p) => p.solved).length;
    const tagSolved = sessions.filter(
      (s) => (s.tags || []).includes(topic) && s.status === "solved"
    ).length;
    const solved = problems.length > 0 ? specificSolved : tagSolved;
    const target = Math.max(g.target || 0, problems.length);
    const pct = target > 0 ? Math.min(100, Math.round((solved / target) * 100)) : 0;

    const problemsHtml = problemItems.length > 0
      ? `<div class="goal-problems">
          ${problemItems.map((p) => `
            <div class="goal-prob-row">
              <div class="goal-prob-left">
                <span class="prob-status-dot ${p.solved ? 'solved' : 'unsolved'}">${p.solved ? '✅' : '⏳'}</span>
                <a href="https://leetcode.com/problems/${p.slug}/" target="_blank" class="goal-prob-link" title="${p.title}">
                  ${p.title}
                </a>
              </div>
              <div class="goal-prob-right">
                ${p.solved ? `<span>${fmtTime(p.duration)} · ${p.attempts || 1} att</span>` : '<span style="color:var(--muted)">to solve</span>'}
                <button class="prob-del-btn" data-topic="${topic.replace(/"/g, '&quot;')}" data-slug="${p.slug}" title="Remove problem">&times;</button>
              </div>
            </div>
          `).join("")}
        </div>`
      : '';

    return `
      <div class="goal-card" data-topic="${topic.replace(/"/g, '&quot;')}">
        <div class="goal-card-header">
          <span class="goal-name" title="${topic}">${topic}</span>
          <div class="goal-track">
            <div class="goal-fill" style="width: ${pct}%"></div>
          </div>
          <span class="goal-nums">${solved}/${target} (${pct}%)</span>
          <button class="goal-del-btn" data-topic="${topic.replace(/"/g, '&quot;')}" title="Delete goal">&times;</button>
        </div>
        ${problemsHtml}
        <form class="goal-add-prob-form" data-topic="${topic.replace(/"/g, '&quot;')}">
          <input type="text" class="goal-add-prob-input" placeholder="Add specific problem (e.g. #198 House Robber, 300, or URL)…" required />
          <button type="submit" class="goal-add-prob-btn">+ Add Problem</button>
        </form>
      </div>`;
  }).join("");

  // Delete Goal handler
  listEl.querySelectorAll(".goal-del-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const topic = btn.dataset.topic;
      if (confirm(`Delete the "${topic}" goal?`)) {
        chrome.runtime.sendMessage({ type: "DELETE_GOAL", topic }, loadAndRender);
      }
    });
  });

  // Remove Problem from Goal handler
  listEl.querySelectorAll(".prob-del-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const topic = btn.dataset.topic;
      const slug = btn.dataset.slug;
      chrome.runtime.sendMessage({ type: "REMOVE_PROBLEM_FROM_GOAL", topic, slug }, loadAndRender);
    });
  });

  // Add Problem to Goal handler
  listEl.querySelectorAll(".goal-add-prob-form").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const topic = form.dataset.topic;
      const input = form.querySelector(".goal-add-prob-input");
      const problemInput = (input.value || "").trim();
      if (!problemInput) return;

      chrome.runtime.sendMessage({ type: "ADD_PROBLEM_TO_GOAL", topic, problemInput }, () => {
        loadAndRender();
      });
    });
  });
}

function populateTopicSuggestions(tagStats) {
  const datalist = document.getElementById("topicSuggestions");
  const commonTopics = [
    "Array", "String", "Hash Table", "Dynamic Programming", "Math",
    "Sorting", "Greedy", "Depth-First Search", "Binary Search", "Tree",
    "Breadth-First Search", "Matrix", "Two Pointers", "Bit Manipulation",
    "Stack", "Heap (Priority Queue)", "Graph", "Backtracking", "Design"
  ];
  const discovered = (tagStats || []).map((t) => t.tag);
  const all = [...new Set([...discovered, ...commonTopics])];
  datalist.innerHTML = all.map((t) => `<option value="${t}"></option>`).join("");
}

// ── Difficulty Bars ───────────────────────────────────────────────────────────
function renderDiffBars(stats) {
  const order = ["Easy", "Medium", "Hard"];
  const maxCount = Math.max(1, ...order.map((d) => stats.difficultyStats[d]?.count || 0));
  document.getElementById("diffBars").innerHTML = order
    .map((d) => {
      const s = stats.difficultyStats[d] || { count: 0, solved: 0, avgTime: 0 };
      const pct = Math.round((s.count / maxCount) * 100);
      return `
        <div class="diff-row">
          <span>${d}</span>
          <div class="diff-track"><div class="diff-fill ${d}" style="width:${pct}%"></div></div>
          <span class="diff-num">${s.solved}/${s.count}</span>
        </div>`;
    })
    .join("");
}

// ── Top Topics ────────────────────────────────────────────────────────────────
function renderTags(stats) {
  const top = stats.tagStats.slice(0, 8);
  if (!top.length) {
    document.getElementById("tagList").innerHTML =
      '<div class="tag-empty">No topic data yet — LeetCode doesn\'t always expose topics on the problem page.</div>';
    return;
  }
  document.getElementById("tagList").innerHTML = top
    .map((t) => `<div class="tag-row"><span class="tag-name">${t.tag}</span><span class="tag-count">${t.count}</span></div>`)
    .join("");
}

// ── Review Queue ──────────────────────────────────────────────────────────────
function renderReviewQueue(due) {
  const sub = document.getElementById("reviewSub");
  const list = document.getElementById("reviewList");

  if (!due || due.length === 0) {
    sub.textContent = "all clear";
    list.innerHTML = '<div class="tag-empty">No reviews due — keep grinding! 🎉</div>';
    return;
  }

  sub.innerHTML = `<span class="review-badge">${due.length} due</span>`;

  list.innerHTML = due.map((card) => {
    const overdueMs = Date.now() - card.nextReview;
    const daysOver = Math.floor(overdueMs / (1000 * 60 * 60 * 24));
    const urgency = daysOver >= 3 ? "review-urgent" : daysOver >= 1 ? "review-warn" : "";
    return `
      <div class="review-row ${urgency}">
        <a href="https://leetcode.com/problems/${card.slug}/" target="_blank" class="prob-link review-title">${card.title || card.slug}</a>
        <span class="badge ${card.difficulty || ''}">${card.difficulty || '?'}</span>
        <span class="review-meta">interval ${card.interval}d · ${daysOver > 0 ? daysOver + 'd overdue' : 'due today'}</span>
      </div>`;
  }).join("");
}

// ── Weak Spots ────────────────────────────────────────────────────────────────
function renderWeakSpots(stats) {
  const el = document.getElementById("weakSpots");

  const withScores = stats.tagStats
    .filter((t) => t.solved > 0)
    .sort((a, b) => a.avgStruggle - b.avgStruggle)
    .slice(0, 8);

  if (!withScores.length) {
    el.innerHTML = '<div class="tag-empty">Solve more problems to see your weak spots.</div>';
    return;
  }

  el.innerHTML = withScores.map((t) => {
    const pd = LeetTrackStorage.personalDifficulty(t.avgStruggle);
    return `
      <div class="tag-row">
        <span class="tag-name">${t.tag}</span>
        <div class="struggle-bar-wrap">
          <div class="struggle-bar" style="width:${t.avgStruggle}%" title="avg struggle score ${t.avgStruggle}/100"></div>
        </div>
        <span class="pd-badge ${pd.cls}">${pd.label}</span>
        <span class="tag-count">${t.successRate}%</span>
      </div>`;
  }).join("");
}

// ── History Table ─────────────────────────────────────────────────────────────
let sortCol = "timestamp";
let sortDir = -1; // -1 = desc, 1 = asc

function renderHistory() {
  const diffFilter = document.getElementById("fDiff").value;
  const statusFilter = document.getElementById("fStatus").value;
  const search = document.getElementById("fSearch").value.toLowerCase();

  const rows = ALL_SESSIONS
    .filter((s) => !diffFilter || s.difficulty === diffFilter)
    .filter((s) => !statusFilter || s.status === statusFilter)
    .filter((s) => !search || s.title.toLowerCase().includes(search))
    .sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
    });

  document.getElementById("emptyState").style.display = ALL_SESSIONS.length ? "none" : "block";

  document.querySelectorAll("table.history th[data-sort]").forEach((th) => {
    const arrow = th.dataset.sort === sortCol ? (sortDir === 1 ? " ↑" : " ↓") : "";
    th.textContent = th.dataset.label + arrow;
  });

  document.getElementById("historyBody").innerHTML = rows
    .map((s) => {
      const score = LeetTrackStorage.computeStruggleScore(s);
      const pd = LeetTrackStorage.personalDifficulty(score);
      const pdBadge = s.status === "solved"
        ? `<span class="pd-badge ${pd.cls}">${pd.label}</span>`
        : `<span class="pd-badge pd-unsolved">—</span>`;
      return `
      <tr>
        <td>${fmtDate(s.timestamp)}</td>
        <td><a href="https://leetcode.com/problems/${s.slug}/" target="_blank" class="prob-link">${s.title}</a></td>
        <td><span class="badge ${s.difficulty}">${s.difficulty}</span></td>
        <td>${pdBadge}</td>
        <td>${(s.tags || []).slice(0, 3).join(", ") || "—"}</td>
        <td class="time-mono">${fmtTime(s.duration)}</td>
        <td>${s.attempts}</td>
        <td class="status-${s.status}">${s.status === "solved" ? "Solved" : "Unsolved"}</td>
        <td class="notes-cell">${s.notes ? `<span title="${s.notes.replace(/"/g,'&quot;')}">${s.notes.length > 40 ? s.notes.slice(0,40) + '…' : s.notes}</span>` : "—"}</td>
      </tr>`;
    })
    .join("");
}

// ── CSV Export ────────────────────────────────────────────────────────────────
function exportCSV() {
  const header = ["date", "title", "difficulty", "personal_difficulty", "tags", "duration_sec", "attempts", "status", "notes"];
  const lines = [header.join(",")];
  ALL_SESSIONS.forEach((s) => {
    const score = LeetTrackStorage.computeStruggleScore(s);
    const pd = s.status === "solved" ? LeetTrackStorage.personalDifficulty(score).label : "unsolved";
    lines.push(
      [
        new Date(s.timestamp).toISOString(),
        `"${s.title.replace(/"/g, '""')}"`,
        s.difficulty,
        pd,
        `"${(s.tags || []).join("; ")}"`,
        s.duration,
        s.attempts,
        s.status,
        `"${(s.notes || "").replace(/"/g, '""')}"`,
      ].join(",")
    );
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leettrack-sessions.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Init ──────────────────────────────────────────────────────────────────────
function loadAndRender() {
  Promise.all([
    new Promise((res) => chrome.runtime.sendMessage({ type: "GET_STATS" }, res)),
    new Promise((res) => chrome.runtime.sendMessage({ type: "GET_REVIEW_QUEUE" }, res)),
    new Promise((res) => chrome.runtime.sendMessage({ type: "GET_GOALS" }, res)),
    new Promise((res) => chrome.runtime.sendMessage({ type: "GET_LC_SYNC" }, res)),
  ]).then(([statsRes, reviewRes, goalsRes, syncRes]) => {
    ALL_SESSIONS = statsRes.sessions;
    ALL_STATS = statsRes.stats;
    renderLCSync(syncRes?.data);
    renderStatStrip(ALL_STATS);
    renderGoals(goalsRes?.goals, ALL_SESSIONS);
    populateTopicSuggestions(ALL_STATS.tagStats);
    renderHeatmap(ALL_STATS);
    renderDiffBars(ALL_STATS);
    renderTags(ALL_STATS);
    renderWeakSpots(ALL_STATS);
    CURRENT_DUE_REVIEWS = reviewRes.due || [];
    renderReviewQueue(reviewRes.due);
    renderHistory();
  });
}

document.getElementById("fDiff").addEventListener("change", renderHistory);
document.getElementById("fStatus").addEventListener("change", renderHistory);
document.getElementById("fSearch").addEventListener("input", renderHistory);
document.getElementById("exportBtn").addEventListener("click", exportCSV);

// Topic Goal creation form
document.getElementById("goalForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const topic = document.getElementById("goalTopic").value.trim();
  const target = parseInt(document.getElementById("goalTarget").value, 10);
  if (!topic || isNaN(target) || target <= 0) return;

  chrome.runtime.sendMessage({ type: "SET_GOAL", topic, target }, () => {
    document.getElementById("goalTopic").value = "";
    document.getElementById("goalTarget").value = "";
    loadAndRender();
  });
});

// Sync LeetCode button
document.getElementById("syncBtn").addEventListener("click", () => {
  const btn = document.getElementById("syncBtn");
  const usernameInput = document.getElementById("syncUsername");
  const username = usernameInput ? usernameInput.value.trim() : "";

  btn.textContent = "Syncing…";
  btn.disabled = true;

  chrome.runtime.sendMessage({ type: "SYNC_LEETCODE", username }, (res) => {
    btn.textContent = "Sync Now";
    btn.disabled = false;
    if (res?.data) {
      renderLCSync(res.data);
    } else {
      alert("Could not fetch LeetCode data. Please enter your LeetCode username or ensure you are logged into https://leetcode.com.");
    }
  });
});

// Sortable history table
document.querySelectorAll("table.history th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    if (sortCol === th.dataset.sort) {
      sortDir *= -1;
    } else {
      sortCol = th.dataset.sort;
      sortDir = -1;
    }
    renderHistory();
  });
});

// Google Calendar for Review Queue
let CURRENT_DUE_REVIEWS = [];

document.getElementById("reviewCalBtn").addEventListener("click", () => {
  const due = CURRENT_DUE_REVIEWS;
  if (!due || due.length === 0) {
    alert("No reviews due today! All spaced repetition cards are up to date.");
    return;
  }

  const title = `🔥 LeetCode: ${due.length} Revision${due.length === 1 ? "" : "s"} Due`;
  const descLines = ["📅 LeetCode Spaced Repetition Revisions Due Today:", ""];
  due.forEach((r, i) => {
    descLines.push(`${i + 1}. ${r.title || r.slug} (${r.difficulty || "Medium"}): https://leetcode.com/problems/${r.slug}/`);
  });
  descLines.push("", "Happy Grinding! Tracked with LeetTrack.");

  const now = new Date();
  const startTime = new Date();
  startTime.setHours(19, 0, 0, 0);
  if (startTime <= now) {
    startTime.setHours(now.getHours() + 1, 0, 0, 0);
  }
  const endTime = new Date(startTime.getTime() + 45 * 60 * 1000);

  const pad = (n) => String(n).padStart(2, "0");
  const formatGCalDate = (d) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

  const datesParam = `${formatGCalDate(startTime)}/${formatGCalDate(endTime)}`;
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(descLines.join("\n"))}&dates=${datesParam}`;

  window.open(url, "_blank");
});

document.getElementById("clearBtn").addEventListener("click", () => {
  if (confirm("Clear all LeetTrack session history? This can't be undone.")) {
    chrome.runtime.sendMessage({ type: "CLEAR_ALL" }, loadAndRender);
  }
});

loadAndRender();
