# LeetTrack — LeetCode Timer & Stats

A Chrome extension that auto-times every LeetCode problem you open, detects
when you get Accepted (no manual "stop" needed), and gives you a stats
dashboard: streaks, difficulty breakdown, topic breakdown, and full session
history.

## What makes it different from a plain timer

- **Starts itself** the moment you open a problem page, and **stops itself**
  the moment LeetCode returns "Accepted" — it watches LeetCode's own submit
  polling call (both `fetch` and `XMLHttpRequest`), no manual clicking required.
- **Counts attempts** — every non-accepted verdict (Wrong Answer, TLE, etc.)
  bumps an attempt counter for that session.
- **Survives refresh** — the timer state is persisted, so reloading the page
  doesn't reset your clock.
- **No drift on navigation** — if you switch tabs mid-problem the timer
  snapshots itself so elapsed time stays accurate when you return.
- **Notes field** — jot down your approach or a quick insight before you submit;
  it gets saved with the session and shows in history.
- **Grind trail** — a GitHub-style heatmap of your last 26 weeks of activity,
  plus difficulty and topic breakdowns, all computed locally.
- **Deduplication** — solving the same problem twice in a day updates the
  existing session instead of creating a duplicate row.
- **CSV export** (includes notes) and a **Give up** button to log an honest
  unsolved attempt instead of losing the data.
- Everything is stored locally in `chrome.storage.local` — nothing leaves
  your machine.

## Install (unpacked, for now — not on the Chrome Web Store)

1. Unzip this folder somewhere permanent (don't delete it after installing —
   Chrome loads the extension directly from these files).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `leettrack` folder.
5. Pin the extension (puzzle-piece icon → pin) for quick access to the popup.

## Use

1. Open any `leetcode.com/problems/<slug>/` page — a small timer widget
   appears bottom-right and starts counting automatically.
2. Solve it. When you submit and get Accepted, the widget detects it,
   stops the clock, and saves the session — no action needed.
3. Optionally type a note in the widget before submitting (approach, edge
   case, hint used, etc.).
4. If you want to bail on a problem, hit **Give up** to log it as unsolved
   with the time you spent.
5. Click the extension icon for a quick summary, or **Open dashboard** for
   the full stats page (heatmap, breakdowns, sortable history, CSV export).

## Dashboard

- **Stat strip** — current streak, best streak, total solved, success rate,
  average solve time, total time practiced.
- **Grind trail** — 26-week heatmap. Hover a cell to see the date and count.
- **By difficulty** — Easy / Medium / Hard progress bars with solved/attempted counts.
- **Top topics** — scraped from LeetCode's Topics section (best-effort).
- **Session history** — filterable by difficulty, status, or search term.
  Click the **Date**, **Time**, or **Attempts** column headers to sort.
  Problem titles are clickable links back to LeetCode. Notes are shown
  truncated (hover for full text).

## Known limitations (worth knowing, not hiding)

- **Topic tags** are scraped from the page's "Topics" section. LeetCode
  occasionally changes its DOM structure, so tag scraping is best-effort —
  if a redesign breaks it, sessions still save fine, just without tags.
- **Difficulty detection** uses the same approach and has the same caveat.
- The submission-verdict detection relies on LeetCode's current internal
  API path (`/submissions/detail/<id>/check/`). If LeetCode changes this,
  auto-detection would need a selector update — the manual **Give up**
  button still works regardless.
- This only works on `leetcode.com/problems/*` pages, not the LeetCode
  mobile app or other judges.

## File layout

```
manifest.json     — MV3 config
content.js/css    — the floating timer widget injected into problem pages
inject.js         — page-context script that watches LeetCode's fetch + XHR calls
background.js     — service worker: persists sessions, answers stat queries
storage.js        — shared storage + stats-computation helpers
popup.html/js/css — toolbar popup (quick stats)
dashboard.html/js/css — full stats page (heatmap, breakdowns, history, export)
```
