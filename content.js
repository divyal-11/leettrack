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
      <button class="lt-close" id="lt-close" title="Close widget">&times;</button>
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
  const btnClose = box.querySelector("#lt-close");
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
      // Reuse the same formula as storage.js personalDifficulty
      const exp = { Easy: 10 * 60, Medium: 20 * 60, Hard: 35 * 60 };
      const expected = exp[session.difficulty] || exp.Medium;
      const timeRatio = duration / expected;
      const timePenalty = timeRatio <= 1 ? 0 : Math.min(65, (timeRatio - 1) * 40);
      const attemptWeights = { Easy: 15, Medium: 10, Hard: 7 };
      const penaltyPerAttempt = attemptWeights[session.difficulty] || 10;
      const attemptPenalty = Math.min(40, (session.attempts || 0) * penaltyPerAttempt);
      const score = Math.max(0, Math.round(100 - timePenalty - attemptPenalty));
      const pd = score >= 85 ? "Mastered ✓" : score >= 65 ? "Good Pace" : score >= 40 ? "Needed Time" : score >= 15 ? "Struggled" : "Very Hard";
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

  btnClose.addEventListener("click", () => {
    // Pause the timer if it's running
    if (!state.paused && !state.solved) {
      state.paused = true;
      state.pauseStartedAt = Date.now();
      stopTicking();
      persist();
    }
    // Hide the widget for this page visit
    box.style.display = "none";
    // Store dismissed slug so popup can offer to reopen it
    try { sessionStorage.setItem("lt_dismissed", slug); } catch(e) {}
  });

  // If the user previously dismissed this widget on this tab, keep it hidden
  try {
    if (sessionStorage.getItem("lt_dismissed") === slug) {
      box.style.display = "none";
    }
  } catch(e) {}

  // Track clicks on LeetCode's submit button
  // Track clicks and keyboard shortcuts on LeetCode's submit/run buttons
  let submissionInFlight = false;
  let lastSubmitClickTime = 0;

  // 1. Keyboard shortcut: Ctrl + Enter / Cmd + Enter (LeetCode submit shortcut)
  // Only treat as a submit if focus is in the code editor area (not search boxes etc.)
  document.addEventListener(
    "keydown",
    (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter")) {
        // Check active element is inside the code editor, not some other input
        const active = document.activeElement;
        const inEditor =
          !active ||
          active.tagName === "BODY" ||
          active.closest(".monaco-editor, [class*='CodeMirror'], [class*='editor'], [data-mode-id], [class*='code-area']");
        if (inEditor) {
          submissionInFlight = true;
          lastSubmitClickTime = Date.now();
        }
      }
    },
    true
  );

  // 2. Mouse clicks on Submit / Run buttons
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest("button, [role='button'], div");
      if (!el) return;
      const txt = (el.textContent || "").trim().toLowerCase();
      const locator = el.getAttribute("data-e2e-locator") || "";

      // "Run" / "Run Code" button — NOT a submission; clear in-flight to avoid false positives
      if (
        locator === "console-run-button" ||
        txt === "run" ||
        txt === "run code"
      ) {
        submissionInFlight = false;
        return;
      }

      // "Submit" button — mark submission in-flight
      if (
        locator === "console-submit-button" ||
        txt === "submit"
      ) {
        submissionInFlight = true;
        lastSubmitClickTime = Date.now();
      }
    },
    true
  );

  // Safety valve: if no verdict arrives within 90s of submitting, clear the flag
  // so a future Run Code click or Ctrl+Enter isn’t blocked by a stuck state.
  setInterval(() => {
    if (submissionInFlight && Date.now() - lastSubmitClickTime > 90000) {
      submissionInFlight = false;
    }
  }, 10000);

  // Listen for verdicts coming from inject.js (network interceptor)
  // Guard: only process this if a submission is actually in-flight.
  // This prevents stale test-case responses from being counted as attempts.
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "leettrack" || data.type !== "SUBMISSION_RESULT") return;
    if (state.solved) return;

    // Only act on this network result if the user actually submitted (not just ran test cases)
    if (!submissionInFlight) return;

    submissionInFlight = false;

    if (data.payload.accepted) {
      finalizeAndSave("solved");
    } else {
      // Wrong Answer / TLE / Runtime Error — count as an attempt
      state.attempts += 1;
      persist();
      render();
      // Flash widget border red briefly to give visual feedback
      box.style.boxShadow = "0 0 0 2px #D9534F";
      elStatus.textContent = `❌ ${data.payload.statusMsg} · Attempt ${state.attempts}`;
      elStatus.className = "lt-status lt-status-unsolved";
      setTimeout(() => { box.style.boxShadow = ""; }, 2000);
    }
  });

  // ── DOM-based submission detection (Accepted only) ───────────────────────
  // IMPORTANT: The DOM scanner is ONLY used to detect "Accepted" as a fallback.
  // We deliberately do NOT count failed verdicts (Wrong Answer, TLE, etc.) from
  // the DOM because that text stays on screen from previous test case runs, which
  // caused false attempt counts when submitting after a failed "Run Code".
  // Failed attempts are handled exclusively by the network interceptor (inject.js).

  function scanDOMForSubmissionResult() {
    if (state.solved) return;
    if (!submissionInFlight) return;
    if (Date.now() - lastSubmitClickTime > 60000) {
      submissionInFlight = false;
      return;
    }

    const greenElements = document.querySelectorAll(
      "[data-e2e-locator='submission-result'], " +
      "div[class*='text-green'], span[class*='text-green'], div[class*='text-sd-easy']"
    );

    for (const el of greenElements) {
      const text = el.textContent.trim();
      if (text !== "Accepted") continue;

      // Skip if this Accepted is inside the Test Result / testcase panel (Run Code output)
      // Walk up the tree looking for any element that is clearly a testcase container
      let node = el.parentElement;
      let isTestPanel = false;
      for (let depth = 0; depth < 12 && node; depth++) {
        const nodeText = node.textContent || "";
        if (
          node.getAttribute("data-e2e-locator") === "console-testcase-panel" ||
          (nodeText.includes("Test Result") && nodeText.includes("Case 1")) ||
          (nodeText.includes("Expected") && nodeText.includes("Output") && nodeText.includes("Input"))
        ) {
          isTestPanel = true;
          break;
        }
        node = node.parentElement;
      }
      if (isTestPanel) continue;

      // Only accept this as a real submission Accepted if we see runtime/beats context
      const parentText = el.closest("[data-layout-path], main, #app, body")?.textContent || "";
      if (
        el.getAttribute("data-e2e-locator") === "submission-result" ||
        parentText.includes("Beats") ||
        parentText.includes("Submissions") ||
        parentText.includes("Submission Result")
      ) {
        submissionInFlight = false;
        finalizeAndSave("solved");
        return;
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
