# LeetTrack — LeetCode Timer, Spaced Repetition & Daily Practice Coach

A Chrome extension that auto-times every LeetCode problem you open, detects
Accepted submissions on its own, schedules spaced-repetition reviews using the
SM-2 algorithm, tracks your topic goals, and builds an actionable daily practice plan.

---

## What makes LeetTrack different

- **Zero-click auto-timer** — starts when you open any `leetcode.com/problems/*` page, stops the second LeetCode returns "Accepted" (intercepts both `fetch` and `XMLHttpRequest`).
- **Personal Struggle Score (0–100)** — evaluates your struggle based on actual duration vs expected time (15m Easy / 30m Medium / 45m Hard) plus attempt penalties. Evaluates whether a problem is Easy, Medium, Hard, or Very Hard *for you*.
- **🔁 SM-2 Spaced Repetition Engine** — automatically schedules your next review date for every problem. Easy solves get pushed further out (1d → 6d → 15d…); high-struggle problems come back sooner.
- **🎯 Topic Goals Tracker** — set target counts per topic (e.g. Dynamic Programming → 30, Graphs → 20) and track your live progress bars and remaining counts.
- **📋 Today's Practice Plan** (`plan.html`) — open each morning for a curated agenda:
  1. Spaced repetition reviews due today with urgency indicators
  2. Recommended topic goals to tackle
  3. High-struggle weak spots to review
- **🔔 Daily Reminder Notifications** — customizable daily browser alarm (`chrome.alarms` + `chrome.notifications`) alerting you to pending reviews and goal milestones.
- **🔄 LeetCode Profile Sync** — fetches your official solved totals (Easy/Medium/Hard) directly via LeetCode's session GraphQL API and displays them alongside your local stats.
- **Survives refresh & navigation** — persistent state in `chrome.storage.local` ensures no lost time or clock drift across tabs.
- **Notes field** — attach personal insights or pattern names to any session.
- **100% private** — everything is stored locally on your machine.

---

## Install (Load Unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` in Google Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `leettrack` directory.
5. Pin the extension for quick popup access.

---

## How to use

1. **Solve problems on LeetCode**: Open any problem page — the timer widget appears bottom-right. When you submit and get Accepted, the session and SM-2 review card save automatically.
2. **Open Today's Plan**: Click the extension popup and click **📋 Open Today's Plan** to see what's due for revision and what topic goal needs practice today.
3. **Set Topic Goals in Dashboard**: Open **📊 Full Dashboard** and use the **🎯 Topic Goals** panel to define your target solve counts.
4. **Sync with LeetCode**: Click **Sync with LeetCode** on the dashboard to pull your total account solve count.
5. **Adjust Notifications**: In the popup, toggle the daily reminder and select your preferred notification time (e.g. 09:00 AM).

---

## Project Structure

```
manifest.json       — Manifest V3 configuration (alarms, notifications, storage, tabs)
content.js / .css   — Injected floating timer & notes widget
inject.js           — Intercepts LeetCode's submit polling calls in page context
background.js       — Service worker: session persistence, SM-2 scheduling, GraphQL sync & daily alarm
storage.js          — Storage helpers, struggle score formulas, SM-2 algorithm & daily plan computation
popup.html / .js    — Toolbar popup with stats, quick review notice & notification settings
plan.html / .js     — Dedicated Today's Plan page (reviews due, goal targets, weak spots)
dashboard.html / .js— Analytics dashboard (26-week heatmap, topic goals, review queue, history table, CSV export)
```
