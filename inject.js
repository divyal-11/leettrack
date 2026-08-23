// Runs in the PAGE's MAIN world context to intercept all LeetCode submit/check network calls.
// Intercepts both fetch and XMLHttpRequest (GraphQL & REST endpoints).
// Reports submission verdicts back to content.js via window.postMessage.

(function () {
  if (window._leettrack_injected) return;
  window._leettrack_injected = true;

  // Patterns for endpoints LeetCode uses for submitting and polling verdict
  const URL_KEYWORDS = ["submission", "graphql", "submit", "check"];

  function isRelevantUrl(url) {
    if (!url || typeof url !== "string") return false;
    const lower = url.toLowerCase();
    return URL_KEYWORDS.some((kw) => lower.includes(kw));
  }

  function extractVerdict(data) {
    if (!data || typeof data !== "object") return null;

    // 1. Direct properties (REST submission check)
    if (data.status_msg || data.statusDisplay) {
      const msg = data.status_msg || data.statusDisplay;
      if (msg === "Pending" || msg === "Judging" || msg === "Compiling") return null;
      return {
        statusMsg: msg,
        accepted: msg.toLowerCase() === "accepted",
      };
    }

    // 2. GraphQL nested response data
    if (data.data) {
      const sub =
        data.data.submissionDetails ||
        data.data.submissionStatus ||
        data.data.checkSubmissionStatus ||
        data.data.userCheckSubmissionStatus;

      if (sub && (sub.statusDisplay || sub.status_msg)) {
        const msg = sub.statusDisplay || sub.status_msg;
        if (msg === "Pending" || msg === "Judging" || msg === "Compiling") return null;
        return {
          statusMsg: msg,
          accepted: msg.toLowerCase() === "accepted",
        };
      }
    }

    // 3. Status code based checks (LeetCode status_code 10 == Accepted)
    if (data.state === "SUCCESS" && (data.status_code === 10 || data.status_msg === "Accepted")) {
      return {
        statusMsg: data.status_msg || "Accepted",
        accepted: true,
      };
    }

    return null;
  }

  function emitVerdict(data) {
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
    } catch (err) {
      // ignore
    }
  }

  // ── 1. Intercept fetch ──────────────────────────────────────────────────────
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (isRelevantUrl(url)) {
        response
          .clone()
          .json()
          .then(emitVerdict)
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
    if (isRelevantUrl(this._ltUrl)) {
      this.addEventListener("load", function () {
        try {
          if (this.responseText) {
            const data = JSON.parse(this.responseText);
            emitVerdict(data);
          }
        } catch (e) {}
      });
    }
    return originalSend.apply(this, args);
  };
})();
