importScripts("storage.js");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SAVE_SESSION") {
    LeetTrackStorage.saveSession(msg.session).then((session) => {
      // auto-schedule spaced repetition review for every session saved
      return LeetTrackStorage.scheduleReview(session).then(() => {
        return LeetTrackStorage.clearActiveTimer(session.slug);
      });
    }).then(() => {
      sendResponse({ ok: true });
    });
    return true; // async
  }

  if (msg.type === "GET_ACTIVE_TIMER") {
    LeetTrackStorage.getActiveTimer(msg.slug).then((state) => sendResponse({ state }));
    return true;
  }

  if (msg.type === "SET_ACTIVE_TIMER") {
    LeetTrackStorage.setActiveTimer(msg.slug, msg.state).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "CLEAR_ACTIVE_TIMER") {
    LeetTrackStorage.clearActiveTimer(msg.slug).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "GET_STATS") {
    LeetTrackStorage.getAllSessions().then((sessions) => {
      sendResponse({ sessions, stats: LeetTrackStorage.computeStats(sessions) });
    });
    return true;
  }

  if (msg.type === "GET_REVIEW_QUEUE") {
    LeetTrackStorage.getDueReviews().then((due) => sendResponse({ due }));
    return true;
  }

  if (msg.type === "GET_ALL_SR_CARDS") {
    LeetTrackStorage.getAllSRCards().then((cards) => sendResponse({ cards }));
    return true;
  }

  if (msg.type === "CLEAR_ALL") {
    LeetTrackStorage.clearAllSessions().then(() => sendResponse({ ok: true }));
    return true;
  }
});
