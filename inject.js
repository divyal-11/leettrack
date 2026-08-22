// Runs in the PAGE's own context (injected via <script src>), not the
// isolated content-script world — that's the only way to see LeetCode's
// own fetch calls. Watches for the submission-check endpoint LeetCode
// polls after you hit "Submit", and reports the verdict back to the
// content script via postMessage.

(function () {
  const CHECK_PATTERN = /\/submissions\/detail\/\d+\/check\/?$/;

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (CHECK_PATTERN.test(url)) {
        const clone = response.clone();
        clone
          .json()
          .then((data) => {
            if (data && data.state === "SUCCESS") {
              window.postMessage(
                {
                  source: "leettrack",
                  type: "SUBMISSION_RESULT",
                  payload: {
                    statusMsg: data.status_msg || "",
                    accepted: data.status_msg === "Accepted",
                  },
                },
                "*"
              );
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      // never let instrumentation break the page
    }
    return response;
  };
})();
