(function () {
  // Safe message sender to prevent "Extension context invalidated" errors
  function isExtensionValid() {
    try {
      return !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function sendMsg(msg, cb) {
    if (!isExtensionValid()) return;
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) {
          // Extension reloaded or context inactive — fail silently
          return;
        }
        if (cb) cb(res);
      });
    } catch (e) {
      // Catch context invalidation gracefully
    }
  }

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
    sendMsg({ type: "SET_ACTIVE_TIMER", slug, state });
  }

  function elapsedSeconds() {
    if (!state.startTimestamp) return 0;
    const now = Date.now();
    const pausedNow = state.paused && state.pauseStartedAt ? now - state.pauseStartedAt : 0;
    return Math.max(0, Math.floor((now - state.startTimestamp - state.pausedAccum - pausedNow) / 1000));
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
      <textarea class="lt-notes" id="lt-notes" placeholder="Notes (optional)…" rows="2"></textarea>
      <div class="lt-status" id="lt-status"></div>
    </div>
  `;
  document.documentElement.appendChild(box);

  const elTime = box.querySelector("#lt-time");
  const elDiff = box.querySelector("#lt-diff");
  const elMeta = box.querySelector("#lt-meta");
  const elStatus = box.querySelector("#lt-status");
  const elPause = box.querySelector("#lt-pause");
  const elNotes = box.querySelector("#lt-notes");
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
    if (state.solved) return;
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
      notes: (elNotes.value || "").trim(),
    };
    sendMsg({ type: "SAVE_SESSION", session });
    elTime.textContent = fmt(duration);

    if (status === "solved") {
      const expected = { Easy: 900, Medium: 1800, Hard: 2700 };
      const exp = expected[session.difficulty] || 1800;
      const score = Math.max(
        0,
        Math.round(100 - Math.max(0, (duration / exp - 1) * 35) - (session.attempts || 0) * 12)
      );
      const pd = score >= 80 ? "Easy ✓" : score >= 50 ? "Medium" : score >= 20 ? "Hard" : "Very Hard";
      elStatus.textContent = `Accepted ✓ · Personal: ${pd} (${score})`;
      elStatus.className = "lt-status lt-status-solved";
    } else {
      elStatus.textContent = "Saved — marked unsolved";
      elStatus.className = "lt-status lt-status-unsolved";
    }

    elPause.disabled = true;
    btnGiveUp.disabled = true;
  }

  // init: resume active running timer or start fresh
  sendMsg({ type: "GET_ACTIVE_TIMER", slug }, (res) => {
    if (res && res.state && !res.state.solved && res.state.startTimestamp) {
      state = res.state;
    } else {
      state = {
        startTimestamp: Date.now(),
        pausedAccum: 0,
        paused: false,
        pauseStartedAt: null,
        attempts: 0,
        solved: false,
        finalDuration: null,
      };
      persist();
    }
    render();
    if (!state.paused && !state.solved) startTicking();
  });

  elPause.addEventListener("click", () => {
    if (state.solved) return;
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

  // Track clicks on LeetCode's submit button
  let submissionInFlight = false;
  let lastSubmitClickTime = 0;

  document.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest("button, [role='button'], div");
      if (el) {
        const txt = (el.textContent || "").trim().toLowerCase();
        if (
          txt === "submit" ||
          txt.startsWith("submit") ||
          el.getAttribute("data-e2e-locator") === "console-submit-button"
        ) {
          submissionInFlight = true;
          lastSubmitClickTime = Date.now();
        }
      }
    },
    true
  );

  // listen for verdicts coming from inject.js
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "leettrack" || data.type !== "SUBMISSION_RESULT") return;
    if (state.solved) return;

    submissionInFlight = false;
    if (data.payload.accepted) {
      finalizeAndSave("solved");
    } else {
      state.attempts += 1;
      persist();
      render();
    }
  });

  // ── DOM-based submission detection fallback ────────────────────────────────
  let lastDetectedAttemptText = "";
  let lastAttemptTime = 0;

  function scanDOMForSubmissionResult() {
    if (state.solved) return;
    // Only search DOM if submit button was clicked in the last 45s or submission was in flight
    if (!submissionInFlight && Date.now() - lastSubmitClickTime > 45000) return;

    const resultElements = document.querySelectorAll(
      "[data-e2e-locator='submission-result'], div[class*='text-green'], span[class*='text-green'], div[class*='text-sd-easy']"
    );

    for (const el of resultElements) {
      const text = el.textContent.trim();

      // Accepted detection
      if (text === "Accepted") {
        const parent = el.closest("[data-layout-path], [class*='result'], [class*='console'], [class*='tab'], div");
        const parentText = parent ? parent.textContent : "";
        if (
          parentText.includes("Runtime") ||
          parentText.includes("Memory") ||
          parentText.includes("Beats") ||
          el.getAttribute("data-e2e-locator") === "submission-result"
        ) {
          submissionInFlight = false;
          finalizeAndSave("solved");
          return;
        }
      }

      // Non-accepted attempt detection
      const failedVerdicts = [
        "Wrong Answer",
        "Time Limit Exceeded",
        "Runtime Error",
        "Memory Limit Exceeded",
        "Compile Error",
        "Output Limit Exceeded",
      ];
      if (failedVerdicts.includes(text)) {
        const now = Date.now();
        if (text !== lastDetectedAttemptText || now - lastAttemptTime > 6000) {
          lastDetectedAttemptText = text;
          lastAttemptTime = now;
          state.attempts += 1;
          persist();
          render();
        }
      }
    }
  }

  // MutationObserver to catch DOM changes when submit result renders
  try {
    const observer = new MutationObserver(() => {
      scanDOMForSubmissionResult();
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  } catch (e) {}

  // snapshot accumulated time when navigating away
  window.addEventListener("pagehide", () => {
    if (state.solved || state.paused) return;
    state.pausedAccum += Date.now() - state.startTimestamp;
    state.startTimestamp = Date.now();
    persist();
  });

  render();
})();
