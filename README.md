# LeetTrack ⏱️

A smart Chrome extension that automatically times your LeetCode problems, tracks every wrong attempt, reminds you when to revise old questions, and gives you an honest personal difficulty rating — not LeetCode's generic Easy/Medium/Hard.

Built for fun to make daily LeetCode practice a lot less chaotic.

---

## 🚀 What it does

- **Zero-click timer**: Opens automatically on any LeetCode problem. Stops the clock the second you get **Accepted** — whether you click Submit or press `Ctrl + Enter`.
- **Attempt counter**: Every wrong submission (`Wrong Answer`, `Time Limit Exceeded`, `Runtime Error`, etc.) is counted and flashes the widget border **red** in real-time so you see it register immediately.
- **Honest personal difficulty rating**: Rates how hard a problem *actually was for you* — not LeetCode's generic labels. Solving a Medium problem in 40 minutes isn't the same as solving it in 15. Ratings are:
  - 🟢 **Mastered ✓** — Solved fast and clean (under ~10/20/35 min for Easy/Med/Hard, 0–1 attempts)
  - 🔵 **Good Pace** — Normal interview pace, got it without major struggles
  - 🟡 **Needed Time** — Over the target time but managed it
  - 🔴 **Struggled** — Took a long time or multiple wrong attempts
  - 🟣 **Very Hard** — Barely got it through significant effort
- **Revision scheduler (Spaced Repetition)**: Automatically figures out when you should solve the problem again (1 day, 6 days, 15 days...) based on how hard it was *for you*.
- **Topic & problem goals**: Create custom targets (e.g. *Dynamic Programming → 20 problems* or *Blind 75*) and add specific problem names/numbers to your checklist.
- **Weak Spots panel**: Automatically fetches official topic tags (e.g. `Dynamic Programming`, `Two Pointers`, `Binary Search`) from LeetCode's API and highlights the topics where your personal struggle score is lowest.
- **Today's practice plan**: Open the plan page each morning to see which questions are due for revision and what to solve next.
- **📅 Google Calendar Reminders**: 1-click export your daily practice plan & due revisions directly into Google Calendar so you get reminders on your phone and smartwatch.
- **Sync with LeetCode**: One click pulls your total solved count from your LeetCode profile directly into your dashboard.
- **Daily reminder**: Optional browser notification at your chosen time (like 9:00 AM) so you never break your streak.
- **100% private**: All your session logs and notes stay on your local browser (`chrome.storage.local`).

---

## 💻 How to use it

1. Download or clone this folder.
2. Open Chrome and go to `chrome://extensions`
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** (top-left) and pick this folder.
5. Pin the extension to your toolbar!

Now just open any problem on LeetCode and start solving. Click the extension icon anytime to view **Today's Plan** or open the **Full Dashboard**.
