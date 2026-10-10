import "./dashboard.css";

type Task = {
  id: string;
  title: string;
  category: string;
  estimatedMinutes: number;
  completed: boolean;
  date: string;
};

type DailyUpdate = {
  userId: string;
  date: string;
  completedTasks: string;
  incompleteTasks: string;
  reason: string;
  learning: string;
  tomorrowPlan: string;
  createdAt: string;
};

type WeeklyReview = {
  id: string;
  userId: string;
  weekId: string;
  weekStart: string;
  weekEnd: string;
  wentWell: string;
  didntGoWell: string;
  learnings: string;
  nextWeekFocus: string;
  createdAt: string;
  updatedAt: string;
};

type WeekRange = {
  weekId: string;
  weekStart: string;
  weekEnd: string;
  label: string;
};

type TestFriend = {
  id: string;
  name: string;
  goal: string;
  progress: {
    todayPercent: number;
    weekPercent: number;
    monthPercent: number;
    problemsSolved: number;
    points: number;
    latestUpdate: string;
    updatedAt: string;
  };
};

type ActivityItem = {
  id?: string;
  date: string;
  type?: string;
  title: string;
  createdAt?: string;
  time?: string;
  detail?: string;
};

const STORAGE_KEYS = {
  tasks: "studysync.tasks",
  dailyUpdates: "studysync_daily_updates",
  weeklyReviews: "studysync_weekly_reviews",
  testFriend: "studysync_test_friend",
  activity: "studysync_activity",
};
const currentUserId = "user1";

const today = new Date();
const dateKey = formatDateKey(today);
const currentDate = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
}).format(today);
const currentMonthLabel = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
}).format(today);
const currentMonthNumber = today.getMonth() + 1;

const initialTasks: Task[] = [
  {
    id: "task-arrays",
    title: "Complete Arrays lecture 3",
    category: "DSA",
    estimatedMinutes: 45,
    completed: true,
    date: dateKey,
  },
  {
    id: "task-leetcode",
    title: "Solve two LeetCode problems",
    category: "DSA",
    estimatedMinutes: 35,
    completed: true,
    date: dateKey,
  },
  {
    id: "task-profile-card",
    title: "Build responsive profile card",
    category: "HTML/CSS",
    estimatedMinutes: 30,
    completed: true,
    date: dateKey,
  },
  {
    id: "task-sql",
    title: "Practice SQL joins",
    category: "SQL",
    estimatedMinutes: 25,
    completed: false,
    date: dateKey,
  },
  {
    id: "task-javascript",
    title: "Review JavaScript closures",
    category: "JavaScript",
    estimatedMinutes: 20,
    completed: false,
    date: dateKey,
  },
];

const initialActivity: ActivityItem[] = [
  {
    time: "09:30",
    title: "Completed Arrays lecture 3",
    detail: "Finished the final lesson and added two review notes.",
    date: dateKey,
  },
  {
    time: "17:15",
    title: "Solved LeetCode problem",
    detail: "Completed “Two Sum” and verified the solution.",
    date: dateKey,
  },
  {
    time: "Oct 6",
    title: "Completed HTML/CSS practice",
    detail: "Built a responsive navigation card and checked mobile layout.",
    date: "2026-10-06",
  },
];

let tasks: Task[] = loadTasks();
let dailyUpdates: DailyUpdate[] = loadDailyUpdates();
let weeklyReviews: WeeklyReview[] = loadWeeklyReviews();
let testFriend: TestFriend | null = loadTestFriend();
let activity: ActivityItem[] = loadActivity();
let activeReviewWeek: WeekRange | null = null;

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentWeek(date: Date): WeekRange {
  const weekStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - ((date.getDay() + 6) % 7),
  );
  const weekEnd = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 6,
  );
  const thursday = new Date(
    Date.UTC(
      weekStart.getFullYear(),
      weekStart.getMonth(),
      weekStart.getDate() + 3,
    ),
  );
  const weekYear = thursday.getUTCFullYear();
  const januaryFourth = new Date(Date.UTC(weekYear, 0, 4));
  const januaryFourthOffset = (januaryFourth.getUTCDay() + 6) % 7;
  const firstMonday = Date.UTC(weekYear, 0, 4 - januaryFourthOffset);
  const weekNumber =
    Math.floor(
      (Date.UTC(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate(),
      ) -
        firstMonday) /
        604800000,
    ) + 1;
  const startLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
  }).format(weekStart);
  const endLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
  }).format(weekEnd);
  const label =
    weekStart.getFullYear() === weekEnd.getFullYear()
      ? `${startLabel} – ${endLabel}, ${weekEnd.getFullYear()}`
      : `${new Intl.DateTimeFormat("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(weekStart)} – ${new Intl.DateTimeFormat("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(weekEnd)}`;

  return {
    weekId: `${weekYear}-W${String(weekNumber).padStart(2, "0")}`,
    weekStart: formatDateKey(weekStart),
    weekEnd: formatDateKey(weekEnd),
    label,
  };
}

function isWeeklyReview(value: unknown): value is WeeklyReview {
  if (typeof value !== "object" || value === null) return false;
  const review = value as Record<string, unknown>;
  return [
    "id",
    "userId",
    "weekId",
    "weekStart",
    "weekEnd",
    "wentWell",
    "didntGoWell",
    "learnings",
    "nextWeekFocus",
    "createdAt",
    "updatedAt",
  ].every((key) => typeof review[key] === "string");
}

function isTestFriend(value: unknown): value is TestFriend {
  if (typeof value !== "object" || value === null) return false;
  const friend = value as Record<string, unknown>;
  const progress = friend.progress;
  if (typeof progress !== "object" || progress === null) return false;
  const friendProgress = progress as Record<string, unknown>;
  return (
    typeof friend.id === "string" &&
    typeof friend.name === "string" &&
    typeof friend.goal === "string" &&
    ["todayPercent", "weekPercent", "monthPercent", "problemsSolved", "points"]
      .every((key) => typeof friendProgress[key] === "number") &&
    typeof friendProgress.latestUpdate === "string" &&
    typeof friendProgress.updatedAt === "string"
  );
}

function loadTasks(): Task[] {
  const storedTasks = localStorage.getItem(STORAGE_KEYS.tasks);
  if (storedTasks) {
    try {
      const parsedTasks = JSON.parse(storedTasks) as Task[];
      return Array.isArray(parsedTasks) ? parsedTasks : initialTasks;
    } catch {
      localStorage.removeItem(STORAGE_KEYS.tasks);
    }
  }
  return initialTasks;
}

function saveTasks(): void {
  localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
}

function loadDailyUpdates(): DailyUpdate[] {
  const storedUpdates = localStorage.getItem(STORAGE_KEYS.dailyUpdates);
  if (!storedUpdates) return [];
  try {
    const parsedUpdates = JSON.parse(storedUpdates) as DailyUpdate[];
    if (!Array.isArray(parsedUpdates)) return [];
    const latestUpdates = new Map<string, DailyUpdate>();
    for (const update of parsedUpdates) {
      const key = `${update.userId}\u0000${update.date}`;
      const existing = latestUpdates.get(key);
      if (
        !existing ||
        Date.parse(update.createdAt) >= Date.parse(existing.createdAt)
      ) {
        latestUpdates.set(key, update);
      }
    }
    const normalizedUpdates = Array.from(latestUpdates.values());
    if (normalizedUpdates.length !== parsedUpdates.length) {
      localStorage.setItem(
        STORAGE_KEYS.dailyUpdates,
        JSON.stringify(normalizedUpdates),
      );
    }
    return normalizedUpdates;
  } catch {
    return [];
  }
}

function saveDailyUpdates(): void {
  localStorage.setItem(STORAGE_KEYS.dailyUpdates, JSON.stringify(dailyUpdates));
}

function loadWeeklyReviews(): WeeklyReview[] {
  const storedReviews = localStorage.getItem(STORAGE_KEYS.weeklyReviews);
  if (!storedReviews) return [];
  try {
    const parsedReviews: unknown = JSON.parse(storedReviews);
    if (!Array.isArray(parsedReviews)) {
      throw new TypeError("Saved weekly reviews must be an array.");
    }
    const validReviews = parsedReviews.filter(isWeeklyReview);
    if (validReviews.length !== parsedReviews.length) {
      console.error("Some saved weekly reviews have an invalid format.");
    }
    return validReviews;
  } catch (error) {
    console.error("Unable to load saved weekly reviews.", error);
    return [];
  }
}

function loadTestFriend(): TestFriend | null {
  try {
    const storedFriend = localStorage.getItem(STORAGE_KEYS.testFriend);
    if (!storedFriend) return null;
    const parsedFriend: unknown = JSON.parse(storedFriend);
    if (!isTestFriend(parsedFriend)) {
      console.error("The saved test friend has an invalid format.");
      return null;
    }
    return parsedFriend;
  } catch (error) {
    console.error("Unable to load the saved test friend.", error);
    return null;
  }
}

function loadActivity(): ActivityItem[] {
  const storedActivity = localStorage.getItem(STORAGE_KEYS.activity);
  if (!storedActivity) return initialActivity;
  try {
    const parsedActivity = JSON.parse(storedActivity) as ActivityItem[];
    if (!Array.isArray(parsedActivity)) return initialActivity;
    const latestDailyActivity = new Map<string, ActivityItem>();
    for (const item of parsedActivity) {
      if (item.type !== "daily_update") continue;
      const existing = latestDailyActivity.get(item.date);
      if (
        !existing ||
        Date.parse(item.createdAt ?? item.date) >=
          Date.parse(existing.createdAt ?? existing.date)
      ) {
        latestDailyActivity.set(item.date, item);
      }
    }
    const normalizedActivity = parsedActivity.filter(
      (item) =>
        item.type !== "daily_update" ||
        latestDailyActivity.get(item.date) === item,
    );
    if (normalizedActivity.length !== parsedActivity.length) {
      localStorage.setItem(
        STORAGE_KEYS.activity,
        JSON.stringify(normalizedActivity),
      );
    }
    return normalizedActivity;
  } catch {
    return initialActivity;
  }
}

function saveActivity(): void {
  localStorage.setItem(STORAGE_KEYS.activity, JSON.stringify(activity));
}

function createUniqueId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTaskMarkup(): string {
  return tasks
    .map(
      (task) => `
        <article class="task-row ${task.completed ? "is-complete" : ""}">
          <button
            class="task-toggle"
            type="button"
            data-task-id="${task.id}"
            aria-label="${task.completed ? "Mark" : "Mark"} ${escapeHtml(task.title)} ${task.completed ? "incomplete" : "complete"}"
            aria-pressed="${task.completed}"
          >
            <span class="task-indicator" aria-hidden="true">${task.completed ? "✓" : "○"}</span>
          </button>
          <div class="task-content">
            <h3>${escapeHtml(task.title)}</h3>
            <div class="task-meta">
              <span class="category-tag category-${escapeHtml(task.category.toLowerCase().replaceAll("/", "-"))}">${escapeHtml(task.category)}</span>
              <span>${task.estimatedMinutes} min</span>
            </div>
          </div>
          <span class="task-status">${task.completed ? "Done" : "Planned"}</span>
        </article>
      `,
    )
    .join("");
}

function renderActivityMarkup(): string {
  return activity
    .slice()
    .reverse()
    .map((item) => {
      const isDailyUpdate = item.type === "daily_update";
      const activityTime = isDailyUpdate
        ? new Intl.DateTimeFormat("en-US", {
            month: "long",
            day: "numeric",
          }).format(new Date(`${item.date}T00:00:00`))
        : (item.time ?? "");
      const activityDetail = isDailyUpdate
        ? `Saved at ${new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(item.createdAt ?? item.date))}`
        : (item.detail ?? "");

      return `
        <article class="activity-item">
          <span class="activity-time">${escapeHtml(activityTime)}</span>
          <div class="activity-marker" aria-hidden="true"></div>
          <div class="activity-copy">
            <h3>${escapeHtml(isDailyUpdate ? "Daily update" : item.title)}</h3>
            <p>${escapeHtml(activityDetail)}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function calculateDailyProgress(): number {
  if (tasks.length === 0) return 0;
  const completedTasks = tasks.filter((task) => task.completed).length;
  return Math.round((completedTasks / tasks.length) * 100);
}

function getTaskCountMarkup(): string {
  const completedCount = tasks.filter((task) => task.completed).length;
  return `${completedCount} of ${tasks.length} done`;
}

function renderFriendProgressMarkup(): string {
  if (!testFriend) {
    return `
      <div class="friend-empty-state">
        <strong>No test friend loaded</strong>
        <p>Use Test Friend to add a local study partner and preview their progress here.</p>
      </div>
    `;
  }

  const { progress } = testFriend;
  return `
    <div class="friend-profile">
      <div class="friend-avatar" aria-hidden="true">${escapeHtml(testFriend.name.slice(0, 1).toUpperCase())}</div>
      <div><h3>${escapeHtml(testFriend.name)}</h3><p>${escapeHtml(testFriend.goal)}</p></div>
      <span class="friend-score">+${progress.points} points</span>
    </div>
    <div class="friend-metrics">
      <div><span>Today</span><strong>${progress.todayPercent}%</strong></div>
      <div><span>Week</span><strong>${progress.weekPercent}%</strong></div>
      <div><span>Month</span><strong>${progress.monthPercent}%</strong></div>
      <div><span>Problems</span><strong>${progress.problemsSolved}</strong></div>
    </div>
    <div class="latest-update">
      <span>Latest update</span>
      <p>${escapeHtml(progress.latestUpdate)}</p>
    </div>
  `;
}

const dashboard = `
  <div class="app-shell">
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="#top" aria-label="StudySync home">
          <span class="brand-mark" aria-hidden="true">S</span>
          <span class="brand-copy">
            <strong>StudySync</strong>
            <small>Study • Track • Review • Improve</small>
          </span>
        </a>
        <div class="header-date">
          <span>Today</span>
          <strong>${currentDate}</strong>
        </div>
      </div>
    </header>

    <main id="top">
      <section class="hero" aria-labelledby="page-title">
        <div class="hero-copy">
          <p class="eyebrow">Study accountability dashboard</p>
          <h1 id="page-title">Make every study session count.</h1>
          <p>Keep your monthly goals, weekly checkpoints, daily work, and study partner updates in one focused workspace.</p>
        </div>
        <div class="hero-summary">
          <div class="hero-summary-heading">
            <div>
              <span>Current month</span>
              <strong>${currentMonthLabel}</strong>
            </div>
            <span class="month-chip">Month ${currentMonthNumber}</span>
          </div>
          <div class="goal-progress-block">
            <div class="progress-label">
              <span>Monthly goal progress</span>
              <strong>68%</strong>
            </div>
            <div class="progress-bar" role="progressbar" aria-label="Monthly goal progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="68">
              <span style="width: 68%"></span>
            </div>
          </div>
          <div class="goal-details">
            <div><strong>27</strong><span>Completed</span></div>
            <div><strong>40</strong><span>Target</span></div>
            <div><strong>13</strong><span>Remaining</span></div>
          </div>
        </div>
      </section>

      <section class="dashboard-content" aria-labelledby="dashboard-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Your workspace</p>
            <h2 id="dashboard-title">My Progress</h2>
          </div>
          <p class="section-date">${currentDate}</p>
        </div>

        <div class="metric-grid">
          <article class="metric-card">
            <div class="metric-icon icon-blue" aria-hidden="true">✓</div>
            <div><span>Today’s completion</span><strong>${calculateDailyProgress()}%</strong></div>
            <div class="mini-progress"><span style="width: ${calculateDailyProgress()}%"></span></div>
          </article>
          <article class="metric-card">
            <div class="metric-icon icon-purple" aria-hidden="true">▦</div>
            <div><span>Weekly completion</span><strong>72%</strong></div>
            <div class="mini-progress"><span style="width: 72%"></span></div>
          </article>
          <article class="metric-card">
            <div class="metric-icon icon-green" aria-hidden="true">◌</div>
            <div><span>Monthly completion</span><strong>68%</strong></div>
            <div class="mini-progress"><span style="width: 68%"></span></div>
          </article>
          <article class="metric-card">
            <div class="metric-icon icon-orange" aria-hidden="true">#</div>
            <div><span>LeetCode solved</span><strong>18</strong></div>
            <small>+4 this week</small>
          </article>
          <article class="metric-card">
            <div class="metric-icon icon-blue" aria-hidden="true">▶</div>
            <div><span>Lectures completed</span><strong>12</strong></div>
            <small>3 in progress</small>
          </article>
        </div>

        <div class="dashboard-grid">
          <section class="panel monthly-panel" aria-labelledby="monthly-goal-title">
            <div class="panel-heading">
              <div>
                <p class="section-kicker">Current month</p>
                <h2 id="monthly-goal-title">Monthly Goal</h2>
              </div>
              <span class="status-pill">In progress</span>
            </div>
            <div class="goal-card">
              <div class="goal-card-icon" aria-hidden="true">⌁</div>
              <div>
                <h3>Build a strong DSA foundation</h3>
                <p>Arrays → Strings → Hashing → Two Pointers → Sliding Window</p>
              </div>
            </div>
            <div class="goal-stats">
              <div><span>Target</span><strong>40 problems</strong></div>
              <div><span>Completed</span><strong>27</strong></div>
              <div><span>Remaining</span><strong>13</strong></div>
            </div>
            <div class="progress-label"><span>Overall monthly progress</span><strong>68%</strong></div>
            <div class="progress-bar large" role="progressbar" aria-label="Overall monthly progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="68">
              <span style="width: 68%"></span>
            </div>
            <div class="roadmap" aria-label="Monthly learning roadmap">
              <span class="complete">✓ Arrays</span>
              <span class="complete">✓ Strings</span>
              <span class="current">3 Hashing</span>
              <span>4 Two Pointers</span>
              <span>5 Sliding Window</span>
            </div>
          </section>

          <section class="panel weekly-panel" aria-labelledby="weekly-title">
            <div class="panel-heading">
              <div>
                <p class="section-kicker">7-day checkpoint</p>
                <h2 id="weekly-title">Weekly Checkpoint</h2>
              </div>
              <span class="week-number">Week 1</span>
            </div>
            <div class="week-range"><span>October 5</span><span class="range-line"></span><span>October 11</span></div>
            <div class="weekly-score">
              <div><span>Weekly progress</span><strong>72%</strong></div>
              <div class="progress-bar" role="progressbar" aria-label="Weekly progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="72">
                <span style="width: 72%"></span>
              </div>
            </div>
            <div class="weekly-target">
              <span class="target-icon" aria-hidden="true">◎</span>
              <div><strong>Weekly target</strong><p>Complete 5 learning sessions and 8 DSA problems.</p></div>
            </div>
            <ul class="checklist">
              <li><span class="check complete">✓</span><div><strong>DSA study</strong><small>4 of 5 sessions</small></div></li>
              <li><span class="check complete">✓</span><div><strong>HTML/CSS practice</strong><small>Completed</small></div></li>
              <li><span class="check pending">2</span><div><strong>SQL practice</strong><small>2 of 3 tasks</small></div></li>
            </ul>
          </section>

          <section class="panel tasks-panel" aria-labelledby="tasks-title">
            <div class="panel-heading">
              <div>
                <p class="section-kicker">Stay focused</p>
                <h2 id="tasks-title">Today’s Tasks</h2>
              </div>
              <div class="task-heading-actions">
                <span class="status-pill">${getTaskCountMarkup()}</span>
                <button class="add-task-button" id="add-task-button" type="button">+ Add Task</button>
              </div>
            </div>
            <div class="task-list" id="task-list">${renderTaskMarkup()}</div>
          </section>

          <section class="panel friend-panel" aria-labelledby="friend-title">
            <div class="panel-heading">
              <div>
                <p class="section-kicker">Study partner</p>
                <h2 id="friend-title">Friend’s Progress</h2>
              </div>
              <span class="online-badge">Local demo</span>
            </div>
            <div id="friend-progress-content">${renderFriendProgressMarkup()}</div>
          </section>

          <section class="panel activity-panel" aria-labelledby="activity-title">
            <div class="panel-heading">
              <div>
                <p class="section-kicker">Progress history</p>
                <h2 id="activity-title">Recent Activity</h2>
              </div>
              <span class="activity-count">${activity.length} updates</span>
            </div>
            <div class="activity-timeline" id="activity-timeline">${renderActivityMarkup()}</div>
          </section>

          <section class="panel actions-panel" aria-labelledby="actions-title">
            <div class="panel-heading">
              <div>
                <p class="section-kicker">Quick access</p>
                <h2 id="actions-title">Dashboard Actions</h2>
              </div>
            </div>
            <div class="action-grid">
              <button class="action-card daily-update-button" id="daily-update-button" type="button"><span aria-hidden="true">✎</span><strong>Today’s Update</strong><small>Record your daily progress</small></button>
              <button class="action-card weekly-review-button" id="weekly-review-button" type="button"><span aria-hidden="true">▤</span><strong>Weekly Review</strong><small>Reflect on this week</small></button>
              <button class="action-card" type="button"><span aria-hidden="true">◷</span><strong>Monthly Review</strong><small>Review your month</small></button>
              <button class="action-card test-friend-button" id="test-friend-button" type="button"><span aria-hidden="true">↗</span><strong>Test Friend</strong><small>Load a local study partner</small></button>
            </div>
            <p class="actions-note">Phase 2 daily updates are saved in this browser.</p>
          </section>
        </div>
      </section>
    </main>

    <footer>
      <div class="footer-inner">
        <a class="brand footer-brand" href="#top"><span class="brand-mark" aria-hidden="true">S</span><span><strong>StudySync</strong><small>Study • Track • Review • Improve</small></span></a>
        <p>Built to make learning progress visible and collaborative.</p>
        <span>Phase 2 · Daily update system</span>
      </div>
    </footer>

    <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>

    <div class="modal-backdrop" id="daily-update-modal" hidden>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="daily-update-title">
        <div class="modal-heading">
          <div>
            <p class="section-kicker" id="daily-update-date">${dateKey}</p>
            <h2 id="daily-update-title">Today’s Update</h2>
          </div>
          <button class="modal-close" id="close-daily-update" type="button" aria-label="Close daily update">×</button>
        </div>
        <form id="daily-update-form" novalidate>
          <div class="form-field">
            <label for="completed-tasks">What did you complete today?</label>
            <textarea id="completed-tasks" name="completedTasks" rows="3" placeholder="List the work you finished..."></textarea>
          </div>
          <div class="form-field">
            <label for="incomplete-tasks">What did you not complete?</label>
            <textarea id="incomplete-tasks" name="incompleteTasks" rows="3" placeholder="Add unfinished work..."></textarea>
          </div>
          <div class="form-field">
            <label for="reason">Why was it not completed?</label>
            <textarea id="reason" name="reason" rows="2" placeholder="Optional explanation..."></textarea>
          </div>
          <div class="form-field">
            <label for="learning">What did you learn today?</label>
            <textarea id="learning" name="learning" rows="2" placeholder="Add a short takeaway..."></textarea>
          </div>
          <div class="form-field">
            <label for="tomorrow-plan">What will you do tomorrow?</label>
            <textarea id="tomorrow-plan" name="tomorrowPlan" rows="2" placeholder="Plan your next step..."></textarea>
          </div>
          <p class="form-feedback" id="form-feedback" role="status" aria-live="polite"></p>
          <div class="modal-actions">
            <button class="secondary-button" id="cancel-daily-update" type="button">Cancel</button>
            <button class="primary-button" type="submit">Save Daily Update</button>
          </div>
        </form>
      </section>
    </div>

    <div class="modal-backdrop" id="weekly-review-modal" hidden>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="weekly-review-title">
        <div class="modal-heading">
          <div>
            <p class="section-kicker" id="weekly-review-week">Week</p>
            <h2 id="weekly-review-title">Weekly Review</h2>
          </div>
          <button class="modal-close" id="close-weekly-review" type="button" aria-label="Close weekly review">×</button>
        </div>
        <form id="weekly-review-form" novalidate>
          <div class="form-field">
            <label for="went-well">1. What went well this week?</label>
            <textarea id="went-well" name="wentWell" rows="3" placeholder="Celebrate the progress and wins from this week..."></textarea>
          </div>
          <div class="form-field">
            <label for="didnt-go-well">2. What didn't go well?</label>
            <textarea id="didnt-go-well" name="didntGoWell" rows="3" placeholder="Note any challenges or things you'd like to improve..."></textarea>
          </div>
          <div class="form-field">
            <label for="learnings">3. Key learnings</label>
            <textarea id="learnings" name="learnings" rows="3" placeholder="What did you learn this week?"></textarea>
          </div>
          <div class="form-field">
            <label for="next-week-focus">4. What will I focus on next week?</label>
            <textarea id="next-week-focus" name="nextWeekFocus" rows="3" placeholder="Choose the most important focus for next week..."></textarea>
          </div>
          <p class="form-feedback" id="weekly-review-feedback" role="status" aria-live="polite"></p>
          <div class="modal-actions">
            <button class="secondary-button" id="cancel-weekly-review" type="button">Cancel</button>
            <button class="primary-button" type="submit">Save Weekly Review</button>
          </div>
        </form>
      </section>
    </div>

    <div class="add-task-backdrop" id="add-task-modal" hidden>
      <section class="modal-card compact-modal" role="dialog" aria-modal="true" aria-labelledby="add-task-title">
        <div class="modal-heading">
          <div>
            <p class="section-kicker">Today</p>
            <h2 id="add-task-title">Add Task</h2>
          </div>
          <button class="modal-close" id="close-add-task" type="button" aria-label="Close add task form">×</button>
        </div>
        <form id="add-task-form" novalidate>
          <div class="form-field">
            <label for="task-title">Task title</label>
            <input id="task-title" name="title" type="text" maxlength="120" required placeholder="What do you want to do?" />
          </div>
          <div class="form-field">
            <label for="task-category">Category</label>
            <select id="task-category" name="category">
              <option>DSA</option>
              <option>HTML/CSS</option>
              <option>JavaScript</option>
              <option>SQL</option>
              <option>General</option>
            </select>
          </div>
          <div class="form-field">
            <label for="task-time">Estimated time (minutes)</label>
            <input id="task-time" name="estimatedMinutes" type="number" min="1" max="1440" value="30" required />
          </div>
          <p class="form-feedback" id="task-form-feedback" role="status" aria-live="polite"></p>
          <div class="modal-actions">
            <button class="secondary-button" id="cancel-add-task" type="button">Cancel</button>
            <button class="primary-button" type="submit">Add Task</button>
          </div>
        </form>
      </section>
    </div>
  </div>
`;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("The application root element was not found.");
}

app.innerHTML = dashboard;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required dashboard element was not found: ${selector}`);
  }
  return element;
}

const taskList = requireElement<HTMLDivElement>("#task-list");
const activityTimeline = requireElement<HTMLDivElement>("#activity-timeline");
const taskCount = requireElement<HTMLElement>(".tasks-panel .status-pill");
const completionCard = requireElement<HTMLElement>(".metric-card");
const friendProgressContent = requireElement<HTMLDivElement>(
  "#friend-progress-content",
);
const dailyUpdateModal = requireElement<HTMLDivElement>("#daily-update-modal");
const weeklyReviewModal = requireElement<HTMLDivElement>("#weekly-review-modal");
const addTaskModal = requireElement<HTMLDivElement>("#add-task-modal");
const dailyUpdateForm = requireElement<HTMLFormElement>("#daily-update-form");
const weeklyReviewForm = requireElement<HTMLFormElement>("#weekly-review-form");
const addTaskForm = requireElement<HTMLFormElement>("#add-task-form");
const formFeedback = requireElement<HTMLElement>("#form-feedback");
const weeklyReviewFeedback = requireElement<HTMLElement>(
  "#weekly-review-feedback",
);
const taskFormFeedback = requireElement<HTMLElement>("#task-form-feedback");
const toast = requireElement<HTMLDivElement>("#toast");

function showToast(message: string, isError = false): void {
  toast.textContent = message;
  toast.className = isError ? "toast is-error" : "toast";
  toast.hidden = false;
  window.setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}

function renderTasks(): void {
  taskList.innerHTML = renderTaskMarkup();
  const completedCount = tasks.filter((task) => task.completed).length;
  taskCount.textContent = `${completedCount} of ${tasks.length} done`;
  const progress = calculateDailyProgress();
  const progressLabel = completionCard.querySelector<HTMLDivElement>(
    ":scope > div:nth-child(2)",
  );
  const progressBar = completionCard.querySelector<HTMLSpanElement>(
    ".mini-progress span",
  );

  if (progressLabel) {
    progressLabel.innerHTML = `<span>Today’s completion</span><strong>${progress}%</strong>`;
  }
  if (progressBar) progressBar.style.width = `${progress}%`;
}

function renderActivity(): void {
  activityTimeline.innerHTML = renderActivityMarkup();
  const activityCount = document.querySelector<HTMLElement>(".activity-count");
  if (activityCount) activityCount.textContent = `${activity.length} updates`;
}

function renderFriendProgress(): void {
  friendProgressContent.innerHTML = renderFriendProgressMarkup();
}

function loadOrCreateTestFriend(): void {
  if (testFriend) {
    renderFriendProgress();
    showToast("Your local test friend is ready.");
    return;
  }

  const now = new Date().toISOString();
  const newFriend: TestFriend = {
    id: "friend1",
    name: "Anagha",
    goal: "Improve DSA and Full Stack skills",
    progress: {
      todayPercent: 80,
      weekPercent: 76,
      monthPercent: 71,
      problemsSolved: 21,
      points: 12,
      latestUpdate:
        "Completed the SQL joins practice set and learned about inner joins.",
      updatedAt: now,
    },
  };

  try {
    localStorage.setItem(STORAGE_KEYS.testFriend, JSON.stringify(newFriend));
  } catch (error) {
    console.error("Unable to save the local test friend.", error);
    showToast(
      "The test friend could not be saved in this browser. Please try again.",
      true,
    );
    return;
  }

  testFriend = newFriend;
  renderFriendProgress();
  showToast("Test friend added and saved in this browser.");
}

function addTask(formData: FormData): void {
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "General");
  const estimatedMinutes = Number(formData.get("estimatedMinutes"));

  if (!title || !Number.isFinite(estimatedMinutes) || estimatedMinutes < 1) {
    taskFormFeedback.textContent = "Enter a task title and estimated time.";
    taskFormFeedback.className = "form-feedback is-error";
    return;
  }

  tasks.push({
    id: `task-${Date.now()}`,
    title,
    category,
    estimatedMinutes,
    completed: false,
    date: dateKey,
  });
  saveTasks();
  renderTasks();
  closeAddTaskModal();
  addTaskForm.reset();
  taskFormFeedback.textContent = "Task added to today’s list.";
  taskFormFeedback.className = "form-feedback is-success";
  showToast("Task added to today’s list.");
}

function toggleTask(taskId: string): void {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.completed = !task.completed;
  saveTasks();
  renderTasks();
}

function openDailyUpdateModal(): void {
  const updateDate = formatDateKey(new Date());
  const savedUpdate = dailyUpdates.find(
    (update) => update.userId === currentUserId && update.date === updateDate,
  );
  const dateLabel = document.querySelector<HTMLElement>("#daily-update-date");
  if (dateLabel) dateLabel.textContent = updateDate;
  dailyUpdateForm.reset();
  for (const field of [
    "completedTasks",
    "incompleteTasks",
    "reason",
    "learning",
    "tomorrowPlan",
  ] as const) {
    const input = dailyUpdateForm.elements.namedItem(field);
    if (input instanceof HTMLTextAreaElement) {
      input.value = savedUpdate?.[field] ?? "";
    }
  }
  dailyUpdateModal.hidden = false;
  document.body.style.overflow = "hidden";
  formFeedback.textContent = "";
  formFeedback.className = "form-feedback";
  document.querySelector<HTMLTextAreaElement>("#completed-tasks")?.focus();
}

function closeDailyUpdateModal(): void {
  dailyUpdateModal.hidden = true;
  document.body.style.overflow = "";
  dailyUpdateForm.reset();
}

function openWeeklyReviewModal(): void {
  activeReviewWeek = getCurrentWeek(new Date());
  const weekLabel = requireElement<HTMLElement>("#weekly-review-week");
  weekLabel.textContent = `Week: ${activeReviewWeek.label} · ${activeReviewWeek.weekId}`;
  const savedReview = weeklyReviews.find(
    (review) =>
      review.userId === currentUserId &&
      review.weekId === activeReviewWeek?.weekId,
  );

  weeklyReviewForm.reset();
  for (const field of [
    "wentWell",
    "didntGoWell",
    "learnings",
    "nextWeekFocus",
  ] as const) {
    const input = weeklyReviewForm.elements.namedItem(field);
    if (input instanceof HTMLTextAreaElement) {
      input.value = savedReview?.[field] ?? "";
    }
  }
  weeklyReviewFeedback.textContent = "";
  weeklyReviewFeedback.className = "form-feedback";
  weeklyReviewModal.hidden = false;
  document.body.style.overflow = "hidden";
  document.querySelector<HTMLTextAreaElement>("#went-well")?.focus();
}

function closeWeeklyReviewModal(): void {
  weeklyReviewModal.hidden = true;
  document.body.style.overflow = "";
  weeklyReviewForm.reset();
  activeReviewWeek = null;
}

function openAddTaskModal(): void {
  addTaskModal.hidden = false;
  document.body.style.overflow = "hidden";
  taskFormFeedback.textContent = "";
  taskFormFeedback.className = "form-feedback";
  document.querySelector<HTMLInputElement>("#task-title")?.focus();
}

function closeAddTaskModal(): void {
  addTaskModal.hidden = true;
  document.body.style.overflow = "";
  addTaskForm.reset();
}

function saveDailyUpdate(formData: FormData): void {
  const updateDate = formatDateKey(new Date());
  const completedTasks = String(formData.get("completedTasks") ?? "").trim();
  const incompleteTasks = String(formData.get("incompleteTasks") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const learning = String(formData.get("learning") ?? "").trim();
  const tomorrowPlan = String(formData.get("tomorrowPlan") ?? "").trim();

  if (!completedTasks && !incompleteTasks && !learning && !tomorrowPlan) {
    formFeedback.textContent = "Add at least one detail before saving.";
    formFeedback.className = "form-feedback is-error";
    return;
  }

  const existingUpdate = dailyUpdates.find(
    (update) => update.userId === currentUserId && update.date === updateDate,
  );
  const createdAt = new Date().toISOString();
  const update: DailyUpdate = {
    userId: currentUserId,
    date: updateDate,
    completedTasks,
    incompleteTasks,
    reason,
    learning,
    tomorrowPlan,
    createdAt: existingUpdate?.createdAt ?? createdAt,
  };
  dailyUpdates = dailyUpdates.filter(
    (item) => item.userId !== currentUserId || item.date !== updateDate,
  );
  dailyUpdates.push(update);

  const existingActivity = activity.find(
    (item) => item.type === "daily_update" && item.date === updateDate,
  );
  const activityItem: ActivityItem = {
    id: existingActivity?.id ?? createUniqueId("activity"),
    date: updateDate,
    type: "daily_update",
    title: "Daily update",
    createdAt,
  };

  saveDailyUpdates();

  activity = activity.filter(
    (item) => item.type !== "daily_update" || item.date !== updateDate,
  );
  activity.push(activityItem);
  saveActivity();
  renderActivity();
  closeDailyUpdateModal();
  formFeedback.textContent = "Daily update saved.";
  formFeedback.className = "form-feedback is-success";
  showToast("Daily update saved to Recent Activity.");
}

function saveWeeklyReview(formData: FormData): void {
  const week = activeReviewWeek;
  if (!week) {
    weeklyReviewFeedback.textContent =
      "Unable to determine the review week. Close and reopen the review.";
    weeklyReviewFeedback.className = "form-feedback is-error";
    return;
  }

  const wentWell = String(formData.get("wentWell") ?? "").trim();
  const didntGoWell = String(formData.get("didntGoWell") ?? "").trim();
  const learnings = String(formData.get("learnings") ?? "").trim();
  const nextWeekFocus = String(formData.get("nextWeekFocus") ?? "").trim();
  if (!wentWell && !didntGoWell && !learnings && !nextWeekFocus) {
    weeklyReviewFeedback.textContent =
      "Add at least one detail before saving.";
    weeklyReviewFeedback.className = "form-feedback is-error";
    return;
  }

  const existingReview = weeklyReviews.find(
    (review) =>
      review.userId === currentUserId && review.weekId === week.weekId,
  );
  const now = new Date().toISOString();
  const review: WeeklyReview = {
    id: `${currentUserId}-${week.weekId}`,
    userId: currentUserId,
    weekId: week.weekId,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    wentWell,
    didntGoWell,
    learnings,
    nextWeekFocus,
    createdAt: existingReview?.createdAt ?? now,
    updatedAt: now,
  };
  const updatedReviews = weeklyReviews.filter(
    (item) =>
      item.userId !== currentUserId || item.weekId !== week.weekId,
  );
  updatedReviews.push(review);

  try {
    localStorage.setItem(
      STORAGE_KEYS.weeklyReviews,
      JSON.stringify(updatedReviews),
    );
  } catch (error) {
    console.error("Unable to save the weekly review.", error);
    weeklyReviewFeedback.textContent =
      "Your review could not be saved in this browser. Please try again.";
    weeklyReviewFeedback.className = "form-feedback is-error";
    return;
  }

  weeklyReviews = updatedReviews;
  closeWeeklyReviewModal();
  showToast("Weekly review saved in this browser.");
}

function bindEvents(): void {
  taskList.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-task-id]",
    );
    if (button) toggleTask(button.dataset.taskId ?? "");
  });

  document
    .querySelector<HTMLButtonElement>("#add-task-button")
    ?.addEventListener("click", openAddTaskModal);
  document
    .querySelector<HTMLButtonElement>("#close-add-task")
    ?.addEventListener("click", closeAddTaskModal);
  document
    .querySelector<HTMLButtonElement>("#cancel-add-task")
    ?.addEventListener("click", closeAddTaskModal);
  addTaskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addTask(new FormData(addTaskForm));
  });

  document
    .querySelector<HTMLButtonElement>("#daily-update-button")
    ?.addEventListener("click", openDailyUpdateModal);
  document
    .querySelector<HTMLButtonElement>("#test-friend-button")
    ?.addEventListener("click", loadOrCreateTestFriend);
  document
    .querySelector<HTMLButtonElement>("#close-daily-update")
    ?.addEventListener("click", closeDailyUpdateModal);
  document
    .querySelector<HTMLButtonElement>("#cancel-daily-update")
    ?.addEventListener("click", closeDailyUpdateModal);
  dailyUpdateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveDailyUpdate(new FormData(dailyUpdateForm));
  });

  document
    .querySelector<HTMLButtonElement>("#weekly-review-button")
    ?.addEventListener("click", openWeeklyReviewModal);
  document
    .querySelector<HTMLButtonElement>("#close-weekly-review")
    ?.addEventListener("click", closeWeeklyReviewModal);
  document
    .querySelector<HTMLButtonElement>("#cancel-weekly-review")
    ?.addEventListener("click", closeWeeklyReviewModal);
  weeklyReviewForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveWeeklyReview(new FormData(weeklyReviewForm));
  });

  addTaskModal.addEventListener("click", (event) => {
    if (event.target === addTaskModal) closeAddTaskModal();
  });
  dailyUpdateModal.addEventListener("click", (event) => {
    if (event.target === dailyUpdateModal) closeDailyUpdateModal();
  });
  weeklyReviewModal.addEventListener("click", (event) => {
    if (event.target === weeklyReviewModal) closeWeeklyReviewModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!addTaskModal.hidden) closeAddTaskModal();
    if (!dailyUpdateModal.hidden) closeDailyUpdateModal();
    if (!weeklyReviewModal.hidden) closeWeeklyReviewModal();
  });
}

renderTasks();
renderActivity();
bindEvents();
