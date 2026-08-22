(function () {
  // ---------- inject page-context script so we can see LeetCode's fetch calls ----------
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("inject.js");
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);

  // ---------- problem detection ----------
  function getSlug() {
    const m = window.location.pathname.match(/\/problems\/([^/]+)/);
    return m ? m[1] : null;
  }

  function getTitle() {
    const t = document.title.split(" - ")[0].trim();
    if (t && t.toLowerCase() !== "leetcode") return t;
    const h1 = document.querySelector("h1, [class*='title']");
    return h1 ? h1.textContent.trim() : getSlug() || "Unknown problem";
  }

  function getDifficulty() {
    const candidates = Array.from(document.querySelectorAll("div,span,button"));
    for (const el of candidates) {
      if (el.children.length === 0) {
        const txt = el.textContent.trim();
        if (txt === "Easy" || txt === "Medium" || txt === "Hard") return txt;
      }
    }
    return "Unknown";
  }

  function getTags() {
    try {
      const header = Array.from(document.querySelectorAll("div,span,p,h3,h4")).find(
        (el) => el.children.length === 0 && el.textContent.trim() === "Topics"
      );
      if (!header) return [];
      let container = header.parentElement;
      for (let i = 0; i < 3 && container; i++) {
        const links = Array.from(container.querySelectorAll("a,button")).filter((el) => {
          const t = el.textContent.trim();
          return t.length > 1 && t.length < 30 && t !== "Topics";
        });
        if (links.length) return [...new Set(links.map((l) => l.textContent.trim()))];
        container = container.parentElement;
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  // ---------- timer state ----------
  const slug = getSlug();
  if (!slug) return;

  let state = {
    startTimestamp: null,
    pausedAccum: 0,
    paused: false,
    pauseStartedAt: null,
    attempts: 0,
    solved: false,
    finalDuration: null,
  };
  let tickHandle = null;

  function persist() {
    chrome.runtime.sendMessage({ type: "SET_ACTIVE_TIMER", slug, state });
  }

  function elapsedSeconds() {
    if (!state.startTimestamp) return 0;
    const now = Date.now();
    const pausedNow = state.paused && state.pauseStartedAt ? now - state.pauseStartedAt : 0;
    return Math.floor((now - state.startTimestamp - state.pausedAccum - pausedNow) / 1000);
  }

  function fmt(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s2 = sec % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s2).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  // ---------- widget UI ----------
  const box = document.createElement("div");
  box.id = "leettrack-widget";
  box.innerHTML = `
    <div class="lt-header">
      <span class="lt-dot"></span>
      <span class="lt-name">LeetTrack</span>
      <span class="lt-diff" id="lt-diff">--</span>
      <button class="lt-min" id="lt-min" title="Minimize">&minus;</button>
    </div>
    <div class="lt-body" id="lt-body">
      <div class="lt-time" id="lt-time">00:00</div>
      <div class="lt-meta" id="lt-meta">0 attempts</div>
      <div class="lt-row">
        <button class="lt-btn" id="lt-pause">Pause</button>
        <button class="lt-btn" id="lt-reset">Reset</button>
        <button class="lt-btn lt-btn-danger" id="lt-giveup">Give up</button>
      </div>
      <div class="lt-status" id="lt-status"></div>
    </div>
  `;
  document.documentElement.appendChild(box);

  const elTime = box.querySelector("#lt-time");
  const elDiff = box.querySelector("#lt-diff");
  const elMeta = box.querySelector("#lt-meta");
  const elStatus = box.querySelector("#lt-status");
  const elPause = box.querySelector("#lt-pause");
  const btnMin = box.querySelector("#lt-min");
  const btnReset = box.querySelector("#lt-reset");
  const btnGiveUp = box.querySelector("#lt-giveup");

  elDiff.textContent = getDifficulty();
  elDiff.className = "lt-diff lt-diff-" + elDiff.textContent.toLowerCase();

  function render() {
    elTime.textContent = fmt(elapsedSeconds());
    elMeta.textContent = `${state.attempts} attempt${state.attempts === 1 ? "" : "s"}`;
    elPause.textContent = state.paused ? "Resume" : "Pause";
  }

  function startTicking() {
    if (tickHandle) return;
    tickHandle = setInterval(render, 1000);
  }
  function stopTicking() {
    clearInterval(tickHandle);
    tickHandle = null;
  }

  function finalizeAndSave(status) {
    stopTicking();
    const duration = elapsedSeconds();
    state.solved = status === "solved";
    state.finalDuration = duration;
    const session = {
      slug,
      title: getTitle(),
      difficulty: getDifficulty(),
      tags: getTags(),
      duration,
      timestamp: Date.now(),
      status,
      attempts: state.attempts,
    };
    chrome.runtime.sendMessage({ type: "SAVE_SESSION", session });
    elTime.textContent = fmt(duration);
    elStatus.textContent = status === "solved" ? "Saved — Accepted ✓" : "Saved — marked unsolved";
    elStatus.className = "lt-status lt-status-" + status;
    elPause.disabled = true;
    btnGiveUp.disabled = true;
  }

  // init: resume existing timer or start a fresh one
  chrome.runtime.sendMessage({ type: "GET_ACTIVE_TIMER", slug }, (res) => {
    if (res && res.state && !res.state.solved) {
      state = res.state;
    } else {
      state.startTimestamp = Date.now();
      persist();
    }
    render();
    if (!state.paused) startTicking();
  });

  elPause.addEventListener("click", () => {
    if (state.paused) {
      state.pausedAccum += Date.now() - state.pauseStartedAt;
      state.paused = false;
      state.pauseStartedAt = null;
      startTicking();
    } else {
      state.paused = true;
      state.pauseStartedAt = Date.now();
      stopTicking();
    }
    persist();
    render();
  });

  btnReset.addEventListener("click", () => {
    stopTicking();
    state = {
      startTimestamp: Date.now(),
      pausedAccum: 0,
      paused: false,
      pauseStartedAt: null,
      attempts: 0,
      solved: false,
      finalDuration: null,
    };
    elStatus.textContent = "";
    elPause.disabled = false;
    btnGiveUp.disabled = false;
    persist();
    render();
    startTicking();
  });

  btnGiveUp.addEventListener("click", () => finalizeAndSave("unsolved"));

  btnMin.addEventListener("click", () => {
    box.classList.toggle("lt-collapsed");
    btnMin.textContent = box.classList.contains("lt-collapsed") ? "+" : "\u2212";
  });

  // listen for verdicts coming from inject.js
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "leettrack" || data.type !== "SUBMISSION_RESULT") return;
    if (state.solved) return;
    if (data.payload.accepted) {
      finalizeAndSave("solved");
    } else {
      state.attempts += 1;
      persist();
      render();
    }
  });

  render();
})();
