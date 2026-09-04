# LeetTrack ⏱️

A smart Chrome extension that automatically times your LeetCode problems, tracks every wrong attempt, reminds you when to revise old questions, and gives you an honest personal difficulty rating — not LeetCode's generic Easy/Medium/Hard.

Built for fun to make daily LeetCode practice a lot less chaotic.

---

## 🚀 What it does

- **Zero-click timer**: Opens automatically on any LeetCode problem. Stops the clock the second you get **Accepted** — whether you click Submit or press `Ctrl + Enter`.
- **Close or minimize the widget anytime**: Hit `−` to collapse it to just the header, or `×` to hide it completely and pause the timer. It comes back on your next problem.
- **Accurate attempt counter**: Every real wrong submission (`Wrong Answer`, `Time Limit Exceeded`, `Runtime Error`, etc.) is counted and flashes the widget border **red** instantly. Running test cases that fail does **not** count — only actual submissions do.
- **Honest personal difficulty rating**: Rates how hard a problem *actually was for you* — not LeetCode's generic labels. Ratings are based on how fast you solved it and how many wrong submissions you had:
  - 🟢 **Mastered ✓** — Fast and clean
  - 🔵 **Good Pace** — Normal interview pace
  - 🟡 **Needed Time** — Over target but got it
  - 🔴 **Struggled** — Long time or multiple wrong submissions
  - 🟣 **Very Hard** — Barely got it
- **Revision scheduler (Spaced Repetition)**: Automatically schedules when you should revisit each problem (1 day → 6 days → 15 days...) based on how hard it was *for you personally*.
- **Topic & problem goals**: Set custom targets (e.g. *Dynamic Programming → 20 problems*) and add specific problem names or numbers to your checklist.
- **Weak Spots panel**: Auto-fetches official topic tags from LeetCode's API and highlights the topics where you struggle the most.
- **Today's practice plan**: Open the plan page each morning to see what's due for revision and what to solve next.
- **📅 Google Calendar Reminders**: 1-click export your daily plan & revision queue directly into Google Calendar.
- **Sync with LeetCode**: One click pulls your total solved count from your LeetCode profile into the dashboard.
- **Daily reminder**: Optional browser notification at your chosen time so you never break your streak.
- **100% private**: Everything stays in your local browser (`chrome.storage.local`). No account, no server.

---

## 💻 How to install

1. Download or clone this repo.
2. Open Chrome and go to `chrome://extensions`
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and pick the folder.
5. Pin the extension to your toolbar.

Open any LeetCode problem and the timer starts automatically. Click the extension icon to open **Today's Plan** or the **Full Dashboard**.
