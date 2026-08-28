// Runs in the PAGE's MAIN world context to intercept all LeetCode submit/check network calls.
// Intercepts both fetch and XMLHttpRequest (GraphQL & REST endpoints).
// Filters out "Run Code" / testcase sample runs so only REAL Submissions are captured.
// Reports submission verdicts back to content.js via window.postMessage.

(function () {
  if (window._leettrack_injected) return;
  window._leettrack_injected = true;

  function isSubmissionEndpoint(url) {
    if (!url || typeof url !== "string") return false;
    const lower = url.toLowerCase();
    // Exclude explicit interpret / run-code endpoints
    if (lower.includes("interpret_solution") || lower.includes("runcode") || lower.includes("testcase")) {
      return false;
    }
    return (
      lower.includes("/submissions/detail/") ||
      lower.includes("/submissions/check/") ||
      lower.includes("/check/") ||
      lower.includes("/submit/") ||
      lower.includes("/graphql")
    );
  }

  // Returns true if this payload is from "Run Code" / sample testcase check, NOT a real submission
  function isTestcaseRun(data) {
    if (!data || typeof data !== "object") return false;

    // 1. Check REST interpret / runcode fields
    if (
      data.code_answer !== undefined ||
      data.expected_code_answer !== undefined ||
      data.code_output !== undefined ||
      data.interpret_id !== undefined ||
      data.interpret_status_msg !== undefined ||
      data.run_success !== undefined ||
      data.correct_run_testcases !== undefined ||
      (typeof data.submission_id === "string" &&
        (data.submission_id.startsWith("interpret_") || data.submission_id.startsWith("runcode_")))
    ) {
      return true;
    }

    // 2. Check GraphQL interpret / runCode fields
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
      const sub = data.data.submissionDetails || data.data.submissionStatus;
      if (sub && (sub.interpret_id || sub.code_answer || sub.expected_code_answer || sub.run_success !== undefined)) {
        return true;
      }
    }

    return false;
  }

  function extractVerdict(data) {
    if (!data || typeof data !== "object") return null;

    // Discard any testcase / "Run Code" execution
    if (isTestcaseRun(data)) {
      return null;
    }

    // 1. Direct REST submission check response
    if (data.status_msg || data.statusDisplay) {
      const msg = data.status_msg || data.statusDisplay;
      if (["pending", "judging", "compiling", "started"].includes(msg.toLowerCase())) return null;
      if (data.state && data.state !== "SUCCESS") return null;
      return {
        statusMsg: msg,
        accepted: msg.toLowerCase() === "accepted",
      };
    }

    // 2. GraphQL response for submission status / check
    if (data.data) {
      const sub =
        data.data.submissionDetails ||
        data.data.submissionStatus ||
        data.data.checkSubmissionStatus ||
        data.data.userCheckSubmissionStatus;

      if (sub && (sub.statusDisplay || sub.status_msg)) {
        const msg = sub.statusDisplay || sub.status_msg;
        if (["pending", "judging", "compiling", "started"].includes(msg.toLowerCase())) return null;
        return {
          statusMsg: msg,
          accepted: msg.toLowerCase() === "accepted",
        };
      }
    }

    return null;
  }

  function handleData(data) {
    try {
      const verdict = extractVerdict(data);
      if (verdict && verdict.statusMsg) {
        window.postMessage(
          {
            source: "leettrack",
            type: "SUBMISSION_RESULT",
            payload: verdict,
          },
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
        response
          .clone()
          .json()
          .then(handleData)
          .catch(() => {});
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
          if (this.responseText) {
            handleData(JSON.parse(this.responseText));
          }
        } catch (e) {}
      });
    }
    return originalSend.apply(this, args);
  };
})();
