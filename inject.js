// Runs in the PAGE's MAIN world context to intercept all LeetCode submit/check network calls.
// Intercepts both fetch and XMLHttpRequest (GraphQL & REST endpoints).
// Filters out "Run Code" / testcase sample runs so only REAL Submissions are captured.
// Reports submission verdicts back to content.js via window.postMessage.

(function () {
  if (window._leettrack_injected) return;
  window._leettrack_injected = true;

  // Known verdict strings for real submissions
  const ACCEPTED_MSG = "accepted";
  const FAILED_MSGS = [
    "wrong answer",
    "time limit exceeded",
    "runtime error",
    "memory limit exceeded",
    "compile error",
    "output limit exceeded",
    "internal error",
  ];
  const PENDING_MSGS = ["pending", "judging", "compiling", "started", "running"];

  function isSubmissionEndpoint(url) {
    if (!url || typeof url !== "string") return false;
    const lower = url.toLowerCase();

    // Explicitly exclude interpret / run-code / testcase endpoints by URL path
    if (
      lower.includes("interpret_solution") ||
      lower.includes("runcode") ||
      lower.includes("testcase") ||
      lower.includes("/run/") ||
      lower.includes("/interpret/")
    ) {
      return false;
    }

    return (
      lower.includes("/submissions/detail/") ||
      lower.includes("/submissions/check/") ||
      // Only match /check/ if it looks like a submission check (not generic /check/)
      /\/problems\/[^/]+\/check\//.test(lower) ||
      lower.includes("/submit/") ||
      lower.includes("/graphql")
    );
  }

  // Returns true if this payload is from "Run Code" / sample testcase, NOT a real submission
  function isTestcaseRun(data) {
    if (!data || typeof data !== "object") return false;

    // 1. REST interpret / runcode payload fields
    if (
      data.code_answer !== undefined ||
      data.expected_code_answer !== undefined ||
      data.code_output !== undefined ||
      data.interpret_id !== undefined ||
      data.interpret_status_msg !== undefined ||
      data.run_success !== undefined ||
      data.correct_run_testcases !== undefined ||
      (typeof data.submission_id === "string" &&
        (data.submission_id.startsWith("interpret_") ||
          data.submission_id.startsWith("runcode_")))
    ) {
      return true;
    }

    // 2. GraphQL interpret / runCode operation fields
    if (data.data) {
      if (
        data.data.interpretSolution ||
        data.data.runCode ||
        data.data.interpretSolutionStatus ||
        data.data.runCodeStatus ||
        data.data.checkRunCodeStatus
      ) {
        return true;
      }
      // Also check inside submissionDetails / submissionStatus for interpret markers
      const sub = data.data.submissionDetails || data.data.submissionStatus;
      if (
        sub &&
        (sub.interpret_id ||
          sub.code_answer !== undefined ||
          sub.expected_code_answer !== undefined ||
          sub.run_success !== undefined)
      ) {
        return true;
      }
    }

    return false;
  }

  function normaliseVerdict(msg) {
    if (!msg || typeof msg !== "string") return null;
    const lower = msg.trim().toLowerCase();
    if (PENDING_MSGS.includes(lower)) return null; // still processing
    if (lower === ACCEPTED_MSG) return { statusMsg: msg.trim(), accepted: true };
    if (FAILED_MSGS.includes(lower)) return { statusMsg: msg.trim(), accepted: false };
    return null; // unrecognised — ignore
  }

  function extractVerdict(data) {
    if (!data || typeof data !== "object") return null;

    // Discard any testcase / "Run Code" execution
    if (isTestcaseRun(data)) return null;

    // 1. Direct REST submission check response (polling /check/ endpoint)
    if (data.status_msg || data.statusDisplay) {
      return normaliseVerdict(data.status_msg || data.statusDisplay);
    }

    // 2. GraphQL response (submissionDetails / submissionStatus / checkSubmissionStatus)
    if (data.data) {
      const sub =
        data.data.submissionDetails ||
        data.data.submissionStatus ||
        data.data.checkSubmissionStatus ||
        data.data.userCheckSubmissionStatus;

      if (sub) {
        return normaliseVerdict(sub.statusDisplay || sub.status_msg);
      }
    }

    return null;
  }

  function handleData(data) {
    try {
      const verdict = extractVerdict(data);
      if (verdict) {
        window.postMessage(
          { source: "leettrack", type: "SUBMISSION_RESULT", payload: verdict },
          "*"
        );
      }
    } catch (err) {}
  }

  // ── 1. Intercept fetch ──────────────────────────────────────────────────────
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (isSubmissionEndpoint(url)) {
        response.clone().json().then(handleData).catch(() => {});
      }
    } catch (e) {}
    return response;
  };

  // ── 2. Intercept XMLHttpRequest ─────────────────────────────────────────────
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._ltUrl = typeof url === "string" ? url : "";
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (isSubmissionEndpoint(this._ltUrl)) {
      this.addEventListener("load", function () {
        try {
          if (this.responseText) handleData(JSON.parse(this.responseText));
        } catch (e) {}
      });
    }
    return originalSend.apply(this, args);
  };
})();
