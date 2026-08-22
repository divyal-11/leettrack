# LeetTrack — LeetCode Timer & Stats

A Chrome extension that auto-times every LeetCode problem you open, detects
when you get Accepted (no manual "stop" needed), and gives you a stats
dashboard: streaks, difficulty breakdown, topic breakdown, and full session
history.

## What makes it different from a plain timer

- **Starts itself** the moment you open a problem page, and **stops itself**
  the moment LeetCode returns "Accepted" — it watches LeetCode's own submit
  polling call, no manual clicking required.
- **Counts attempts** — every non-accepted verdict (Wrong Answer, TLE, etc.)
  bumps an attempt counter for that session.
- **Survives refresh** — the timer state is persisted, so reloading the page
  doesn't reset your clock.
- **Grind trail** — a GitHub-style heatmap of your solve activity, plus
  difficulty and topic breakdowns, all computed locally.
- **CSV export** and a "Give up" button to log an honest unsolved attempt
  instead of losing the data.
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
3. If you want to bail on a problem, hit **Give up** to log it as unsolved
   with the time you spent.
4. Click the extension icon for a quick summary, or **Open dashboard** for
   the full stats page (heatmap, breakdowns, filterable history, CSV export).

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
inject.js         — page-context script that watches LeetCode's own fetch calls
background.js     — service worker: persists sessions, answers stat queries
storage.js        — shared storage + stats-computation helpers
popup.html/js/css — toolbar popup (quick stats)
dashboard.html/js/css — full stats page (heatmap, breakdowns, history, export)
```
