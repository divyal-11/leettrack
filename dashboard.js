let ALL_SESSIONS = [];
let ALL_STATS = null;

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

function renderHeatmap(stats) {
  const days = 182; // ~26 weeks
  const cells = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // find max solved-in-a-day for scaling
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
    cells.push(
      `<div class="heat-cell l${level}" title="${key}: ${solved} solved"></div>`
    );
  }
  document.getElementById("heatmap").innerHTML = cells.join("");
  document.getElementById("trailSub").textContent = `last ${days} days`;
}

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

  // update sort indicators on headers
  document.querySelectorAll("table.history th[data-sort]").forEach((th) => {
    const arrow = th.dataset.sort === sortCol ? (sortDir === 1 ? " ↑" : " ↓") : "";
    th.textContent = th.dataset.label + arrow;
  });

  document.getElementById("historyBody").innerHTML = rows
    .map(
      (s) => `
      <tr>
        <td>${fmtDate(s.timestamp)}</td>
        <td><a href="https://leetcode.com/problems/${s.slug}/" target="_blank" class="prob-link">${s.title}</a></td>
        <td><span class="badge ${s.difficulty}">${s.difficulty}</span></td>
        <td>${(s.tags || []).slice(0, 3).join(", ") || "—"}</td>
        <td class="time-mono">${fmtTime(s.duration)}</td>
        <td>${s.attempts}</td>
        <td class="status-${s.status}">${s.status === "solved" ? "Solved" : "Unsolved"}</td>
      </tr>`
    )
    .join("");
}

function exportCSV() {
  const header = ["date", "title", "difficulty", "tags", "duration_sec", "attempts", "status"];
  const lines = [header.join(",")];
  ALL_SESSIONS.forEach((s) => {
    lines.push(
      [
        new Date(s.timestamp).toISOString(),
        `"${s.title.replace(/"/g, '""')}"`,
        s.difficulty,
        `"${(s.tags || []).join("; ")}"`,
        s.duration,
        s.attempts,
        s.status,
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

function loadAndRender() {
  chrome.runtime.sendMessage({ type: "GET_STATS" }, (res) => {
    ALL_SESSIONS = res.sessions;
    ALL_STATS = res.stats;
    renderStatStrip(ALL_STATS);
    renderHeatmap(ALL_STATS);
    renderDiffBars(ALL_STATS);
    renderTags(ALL_STATS);
    renderHistory();
  });
}

document.getElementById("fDiff").addEventListener("change", renderHistory);
document.getElementById("fStatus").addEventListener("change", renderHistory);
document.getElementById("fSearch").addEventListener("input", renderHistory);
document.getElementById("exportBtn").addEventListener("click", exportCSV);

// sortable column headers
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

document.getElementById("clearBtn").addEventListener("click", () => {
  if (confirm("Clear all LeetTrack session history? This can't be undone.")) {
    chrome.runtime.sendMessage({ type: "CLEAR_ALL" }, loadAndRender);
  }
});

loadAndRender();
