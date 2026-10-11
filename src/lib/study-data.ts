import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase.ts";

type WorkType = "task" | "lecture" | "problems";
type UserLabel = "User 1" | "User 2";
type GoalPeriod = "weekly" | "monthly";
type ReviewPeriod = "daily" | "weekly" | "monthly";

interface QuestionRow {
  id: string;
  workspace_id: string;
  user_id: string;
  question_text: string;
  created_at: string;
}

interface AnswerRow {
  id: string;
  question_id: string;
  user_id: string;
  answer_text: string;
  created_at: string;
}

interface ReviewRow {
  id: string;
  workspace_id: string;
  reviewer_id: string;
  reviewee_id: string;
  review_period: ReviewPeriod;
  review_date: string;
  feedback: string;
  suggestions: string | null;
  created_at: string;
}

interface QuestionMetadata {
  questionId: string;
  hints: string;
  expectedAnswer: string;
  revealed: boolean;
}

interface CloudQuestionView {
  id: string;
  workspaceId: string;
  creator: UserLabel;
  assignee: UserLabel;
  question: string;
  hints: string;
  expectedAnswer: string;
  answer: string;
  answered: boolean;
  revealed: boolean;
  date: string;
}

interface CloudReviewView {
  id: string;
  workspaceId: string;
  author: UserLabel;
  recipient: UserLabel;
  period: ReviewPeriod;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  feedback: {
    wentWell: string;
    improve: string;
    advice: string;
    targets: string;
  };
  suggestions: string;
  timestamp: string;
}

interface WorkspaceRow {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

interface MembershipRow {
  workspace_id: string;
  user_id: string;
}

interface TaskRow {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
}

interface GoalRow {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  period: GoalPeriod;
  start_date: string;
  end_date: string;
  status: "active" | "completed";
}

interface LocalDailyEntry {
  id: string;
  type: WorkType;
  assignee: UserLabel;
  title: string;
  description: string;
  duration: number | null;
  minutes: number | null;
  topic: string;
  problems: number | null;
  date: string;
  completed: boolean;
}

interface WorkspaceContext {
  workspace: WorkspaceRow;
  members: MembershipRow[];
  userId: string;
  userEmail: string | null;
}

class WorkspaceSelectionRequiredError extends Error {
  readonly workspaces: WorkspaceRow[];

  constructor(workspaces: WorkspaceRow[]) {
    super("Choose a workspace to continue.");
    this.name = "WorkspaceSelectionRequiredError";
    this.workspaces = workspaces;
  }
}

const dailyForm = requireElement("daily-work-form", HTMLFormElement);
const workType = requireElement("work-type", HTMLSelectElement);
const taskAssignee = requireElement("work-assignee", HTMLSelectElement);
const dailyList = requireElement("daily-work-list", HTMLElement);
const dailyMessage = requireElement("daily-work-message", HTMLElement);
const weeklyForm = requireElement("weekly-goal-form", HTMLFormElement);
const weeklyAssignee = requireElement("weekly-goal-user", HTMLSelectElement);
const weeklyUsers = requireElement("weekly-goal-users", HTMLElement);
const weeklyMessage = requireElement("weekly-goal-message", HTMLElement);
const monthlyForm = requireElement("monthly-goal-form", HTMLFormElement);
const monthlyAssignee = requireElement("monthly-goal-user", HTMLSelectElement);
const monthlyUsers = requireElement("monthly-goal-users", HTMLElement);
const monthlyMessage = requireElement("monthly-goal-message", HTMLElement);
const workspaceSyncStatus = requireElement(
  "workspace-sync-status",
  HTMLElement,
);
const inviteForm = requireElement("workspace-invite-form", HTMLFormElement);
const inviteEmail = requireElement("workspace-invite-email", HTMLInputElement);
const inviteMessage = requireElement("workspace-invite-message", HTMLElement);
const invitePanel = requireElement("workspace-invite-panel", HTMLElement);
const replaceInvitationButton = requireElement(
  "workspace-replace-invitation",
  HTMLButtonElement,
);
const invitationStatus = requireElement(
  "workspace-invitation-status",
  HTMLElement,
);
const connectedMember = requireElement(
  "workspace-connected-member",
  HTMLElement,
);
const invitationLinkContainer = requireElement(
  "workspace-invitation-link-container",
  HTMLElement,
);
const invitationLink = requireElement(
  "workspace-invitation-link",
  HTMLInputElement,
);
const copyInvitationLinkButton = requireElement(
  "workspace-copy-invitation-link",
  HTMLButtonElement,
);
const friendQuestionForm = requireElement(
  "friend-question-form",
  HTMLFormElement,
);
const friendQuestionCountSelect = requireElement(
  "friend-question-count",
  HTMLSelectElement,
);
const friendQuestionCreateMessage = requireElement(
  "friend-question-create-message",
  HTMLElement,
);
const friendQuestionAnswerMessage = requireElement(
  "friend-question-answer-message",
  HTMLElement,
);
const reviewForm = requireElement("review-feedback-form", HTMLFormElement);
const reviewFeedbackMessage = requireElement(
  "review-feedback-message",
  HTMLElement,
);
const reviewPeriodSelect = requireElement("review-period", HTMLSelectElement);
const reviewUserSelect = requireElement("review-user", HTMLSelectElement);
const friendCreatorSelect = requireElement(
  "friend-question-creator",
  HTMLSelectElement,
);
const friendAssigneeSelect = requireElement(
  "friend-question-assignee",
  HTMLSelectElement,
);
const friendCurrentUserSelect = requireElement(
  "friend-current-user",
  HTMLSelectElement,
);

const dailyWorkStorageKey = "studysync-daily-work";
const legacyTaskStorageKey = "studysync-daily-tasks";
const weeklyStorageKey = "studysync-weekly-goals";
const monthlyStorageKey = "studysync-monthly-goals";

let context: WorkspaceContext | null = null;
let tasks: TaskRow[] = [];
let goals: GoalRow[] = [];
let requestSequence = 0;
let currentSessionUserId: string | null = null;
let initializingUserId: string | null = null;
let initializationPromise: Promise<void> | null = null;
let goalDescriptions: Record<string, string> = {};
let workspaceSyncChannel: RealtimeChannel | null = null;
let realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let cloudQuestions: QuestionRow[] = [];
let cloudAnswers: AnswerRow[] = [];
let cloudReviews: ReviewRow[] = [];
let collaborationLoadSequence = 0;
let collaborationRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function requireElement<T extends HTMLElement>(
  id: string,
  elementType: { new (): T },
): T {
  const element = document.getElementById(id);
  if (!(element instanceof elementType)) {
    throw new Error(`StudySync data element "${id}" was not found.`);
  }
  return element;
}

function setFeedback(
  element: HTMLElement,
  text: string,
  state: "loading" | "success" | "error" | "info",
): void {
  element.textContent = text;
  element.dataset.state = state;
}

function authErrorMessage(error: unknown): string {
  if (
    error instanceof TypeError ||
    (error instanceof Error && /network|fetch|timeout/i.test(error.message))
  ) {
    return "Could not reach Supabase. Check your internet connection and try again.";
  }
  return error instanceof Error
    ? error.message
    : "Could not load or save your study data. Please try again.";
}

function userLabel(userId: string): UserLabel | null {
  if (!context) return null;
  const orderedMembers = [...context.members].sort((first, second) => {
    if (first.user_id === context?.workspace.owner_id) return -1;
    if (second.user_id === context?.workspace.owner_id) return 1;
    return first.user_id.localeCompare(second.user_id);
  });
  const position = orderedMembers.findIndex(
    (member) => member.user_id === userId,
  );
  return position === 0 ? "User 1" : position === 1 ? "User 2" : null;
}

function currentUserLabel(): UserLabel | null {
  return context ? userLabel(context.userId) : null;
}

function syncAssigneeOptions(
  select: HTMLSelectElement,
  restrictToSelf: boolean,
) {
  const self = currentUserLabel();
  for (const option of Array.from(select.options)) {
    option.disabled = restrictToSelf && option.value !== self;
  }
  if (restrictToSelf && self) select.value = self;
}

function setTaskAssignmentRules(): void {
  syncAssigneeOptions(taskAssignee, workType.value === "task");
}

function readLocalEntries(): LocalDailyEntry[] {
  try {
    const stored = localStorage.getItem(dailyWorkStorageKey);
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (entry): entry is LocalDailyEntry =>
          !!entry &&
          (entry.type === "lecture" || entry.type === "problems") &&
          (entry.assignee === "User 1" || entry.assignee === "User 2") &&
          typeof entry.id === "string" &&
          typeof entry.title === "string" &&
          typeof entry.description === "string" &&
          typeof entry.date === "string" &&
          typeof entry.completed === "boolean",
      );
    }
    return [];
  } catch (error) {
    console.error("Could not read existing local StudySync work:", error);
    return [];
  }
}

function countLegacyRecords(storageKey: string): number {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return 0;
    const records: unknown = JSON.parse(stored);
    return Array.isArray(records) ? records.length : 0;
  } catch (error) {
    console.error(`Could not inspect legacy storage "${storageKey}":`, error);
    return 0;
  }
}

function countLegacyTasks(): number {
  const ids = new Set<string>();
  try {
    const stored = localStorage.getItem(dailyWorkStorageKey);
    if (stored !== null) {
      const records: unknown = JSON.parse(stored);
      if (Array.isArray(records)) {
        for (const record of records) {
          if (record?.type === "task" && typeof record.id === "string") {
            ids.add(record.id);
          }
        }
      }
    }
    const legacy = localStorage.getItem(legacyTaskStorageKey);
    if (legacy) {
      const records: unknown = JSON.parse(legacy);
      if (Array.isArray(records)) {
        for (const record of records) {
          if (typeof record?.id === "string") ids.add(record.id);
        }
      }
    }
  } catch (error) {
    console.error("Could not count existing local tasks:", error);
  }
  return ids.size;
}

function loadGoalDescriptions(): void {
  if (!context) {
    goalDescriptions = {};
    return;
  }
  const key = `studysync-goal-descriptions:${context.workspace.id}:${context.userId}`;
  try {
    const stored = localStorage.getItem(key);
    const parsed: unknown = stored ? JSON.parse(stored) : {};
    goalDescriptions =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : {};
  } catch (error) {
    goalDescriptions = {};
    console.error("Could not load local goal descriptions:", error);
  }
}

function saveGoalDescription(goalId: string, description: string): boolean {
  if (!context) return false;
  const key = `studysync-goal-descriptions:${context.workspace.id}:${context.userId}`;
  const nextDescriptions = { ...goalDescriptions };
  if (description) nextDescriptions[goalId] = description;
  else delete nextDescriptions[goalId];
  try {
    localStorage.setItem(key, JSON.stringify(nextDescriptions));
    goalDescriptions = nextDescriptions;
    return true;
  } catch (error) {
    console.error("Could not save local goal description:", error);
    return false;
  }
}

function appendText(parent: HTMLElement, text: string): void {
  const line = document.createElement("p");
  line.textContent = text;
  parent.append(line);
}

function renderDailyWork(): void {
  dailyList.replaceChildren();
  const cloudEntries = tasks.map(
    (task): LocalDailyEntry => ({
      id: task.id,
      type: "task",
      assignee: userLabel(task.user_id) ?? "User 1",
      title: task.title,
      description: task.description ?? "",
      duration: null,
      minutes: null,
      topic: "",
      problems: null,
      date: task.created_at,
      completed: task.status === "completed",
    }),
  );
  const entries = [...cloudEntries, ...readLocalEntries()];

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "daily-work-empty";
    empty.textContent = "No daily work saved yet.";
    dailyList.append(empty);
    return;
  }

  for (const entry of entries.reverse()) {
    const card = document.createElement("article");
    card.className = `daily-work-entry${
      entry.type === "task" && entry.completed ? " is-complete" : ""
    }`;
    const heading = document.createElement("h4");
    heading.textContent = `${entry.type === "task" ? "Task" : entry.type === "lecture" ? "Lecture" : "Problems Solved"}: ${
      entry.type === "problems" ? entry.topic : entry.title
    }`;
    card.append(heading);
    appendText(card, `Assigned to ${entry.assignee}`);

    if (entry.type === "task" && tasks.some((task) => task.id === entry.id)) {
      if (entry.description) appendText(card, entry.description);
      appendText(
        card,
        `Status: ${entry.completed ? "Complete" : "Incomplete"}`,
      );
    } else if (entry.type === "lecture") {
      appendText(card, `Minutes completed: ${entry.minutes ?? 0}`);
      if (entry.duration !== null) {
        appendText(card, `Total duration: ${entry.duration} minutes`);
      }
    } else {
      appendText(card, `Problems solved: ${entry.problems ?? 0}`);
    }

    const date = new Date(entry.date);
    appendText(
      card,
      `Date: ${
        Number.isNaN(date.getTime())
          ? "Unknown"
          : date.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
      }`,
    );

    if (entry.type === "task") {
      const actions = document.createElement("div");
      actions.className = "daily-work-entry-actions shared-record-actions";
      const button = document.createElement("button");
      button.className = "daily-work-status-button";
      button.type = "button";
      button.textContent = entry.completed
        ? "Mark incomplete"
        : "Mark complete";
      button.setAttribute("aria-pressed", String(entry.completed));
      button.addEventListener("click", () => {
        void updateTaskStatus(entry.id, !entry.completed);
      });
      const task = tasks.find((item) => item.id === entry.id);
      if (task) {
        const editButton = document.createElement("button");
        editButton.className = "shared-record-action";
        editButton.type = "button";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => {
          void editTask(task);
        });

        const deleteButton = document.createElement("button");
        deleteButton.className = "shared-record-action is-danger";
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => {
          void deleteTask(task);
        });

        actions.append(button, editButton, deleteButton);
      }
      card.append(actions);
    }
    dailyList.append(card);
  }
}

function goalDateRange(goal: GoalRow): { start: string; end: string } {
  if (goal.period === "weekly") {
    const end = new Date(`${goal.start_date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    return { start: goal.start_date, end: end.toISOString().slice(0, 10) };
  }
  const monthStart = new Date(`${goal.start_date.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  );
  return {
    start: monthStart.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function mapGoal(goal: GoalRow) {
  return {
    id: goal.id,
    assignee: userLabel(goal.user_id) ?? "User 1",
    title: goal.title,
    description: goalDescriptions[goal.id] ?? "",
    completed: goal.status === "completed",
    weekStart: goal.start_date,
    month: goal.start_date.slice(0, 7),
  };
}

function dispatchReviewProgress(): void {
  const dailyWorkEntries: LocalDailyEntry[] = [
    ...tasks.map((task) => ({
      id: task.id,
      type: "task" as const,
      assignee: userLabel(task.user_id) ?? "User 1",
      title: task.title,
      description: task.description ?? "",
      duration: null,
      minutes: null,
      topic: "",
      problems: null,
      date: task.created_at,
      completed: task.status === "completed",
    })),
    ...readLocalEntries(),
  ];
  const weeklyGoals = goals
    .filter((goal) => goal.period === "weekly")
    .map(mapGoal);
  const monthlyGoals = goals
    .filter((goal) => goal.period === "monthly")
    .map(mapGoal);
  document.dispatchEvent(
    new CustomEvent("studysync-cloud-progress", {
      detail: { dailyWorkEntries, weeklyGoals, monthlyGoals },
    }),
  );
}

function renderGoals(): void {
  const renderPeriod = (period: GoalPeriod, container: HTMLElement): void => {
    container.replaceChildren();
    for (const label of ["User 1", "User 2"] as const) {
      const userGoals = goals
        .filter(
          (goal) => goal.period === period && userLabel(goal.user_id) === label,
        )
        .sort((first, second) =>
          second.start_date.localeCompare(first.start_date),
        );
      const section = document.createElement("section");
      section.className = "weekly-goal-user";
      const heading = document.createElement("h4");
      heading.textContent = label;
      section.append(heading);

      if (period === "weekly") {
        const count = document.createElement("p");
        count.className = "weekly-goal-count";
        count.textContent = `${userGoals.filter((goal) => goal.status === "completed").length} of ${userGoals.length} goals complete`;
        section.append(count);
      }

      const list = document.createElement("div");
      list.className = "weekly-goal-list";
      if (!userGoals.length) {
        const empty = document.createElement("p");
        empty.className = "weekly-goal-empty";
        empty.textContent = "No goals added yet.";
        list.append(empty);
      }

      for (const goal of userGoals) {
        const card = document.createElement("article");
        card.className = `weekly-goal-entry${
          goal.status === "completed" ? " is-complete" : ""
        }`;
        const title = document.createElement("h5");
        title.textContent = goal.title;
        const range = goalDateRange(goal);
        const dateLine = document.createElement("p");
        if (period === "weekly") {
          dateLine.textContent = `Week starting: ${new Date(
            `${range.start}T00:00:00`,
          ).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}`;
        } else {
          dateLine.textContent = `Month: ${new Date(
            `${range.start.slice(0, 7)}-01T00:00:00`,
          ).toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric",
          })}`;
        }
        card.append(title, dateLine);
        const description = goalDescriptions[goal.id];
        if (description) appendText(card, description);
        appendText(
          card,
          `Status: ${goal.status === "completed" ? "Complete" : "Incomplete"}`,
        );
        const actions = document.createElement("div");
        actions.className = "shared-record-actions";

        const statusButton = document.createElement("button");
        statusButton.className = "weekly-goal-status-button";
        statusButton.type = "button";
        statusButton.textContent =
          goal.status === "completed" ? "Mark incomplete" : "Mark complete";
        statusButton.setAttribute(
          "aria-pressed",
          String(goal.status === "completed"),
        );
        statusButton.addEventListener("click", () => {
          void updateGoalStatus(goal, goal.status !== "completed");
        });

        const editButton = document.createElement("button");
        editButton.className = "shared-record-action";
        editButton.type = "button";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => {
          void editGoal(goal);
        });

        const deleteButton = document.createElement("button");
        deleteButton.className = "shared-record-action is-danger";
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => {
          void deleteGoal(goal);
        });

        actions.append(statusButton, editButton, deleteButton);
        card.append(actions);
        list.append(card);
      }
      section.append(list);
      container.append(section);
    }
  };

  renderPeriod("weekly", weeklyUsers);
  renderPeriod("monthly", monthlyUsers);
  dispatchReviewProgress();
}

function renderAll(): void {
  renderDailyWork();
  renderGoals();
}

function invitationErrorMessage(error: unknown, accepting = false): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (accepting) {
    if (message.includes("already has two members")) {
      return "This workspace already has two members and cannot accept another invitation.";
    }
    if (message.includes("workspace no longer exists")) {
      return "The invited workspace no longer exists.";
    }
    if (message.includes("invalid input syntax")) {
      return "This invitation link is invalid. Ask the workspace owner for a new link.";
    }
    if (message.includes("authentication is required")) {
      return "Sign in with the invited account to accept this invitation.";
    }
    if (
      message.includes("invalid, expired, already used") ||
      message.includes("belongs to another user")
    ) {
      return "This invitation is invalid, expired, already used, or was sent to a different account. Sign in with the invited email address, or ask the owner to send a new invitation.";
    }
  } else {
    if (
      message.includes("only the workspace owner") ||
      message.includes("owner must be a member")
    ) {
      return "Only the workspace owner can invite a friend.";
    }
    if (message.includes("no unique registered account")) {
      return "No registered account matches that email. Check the address and ask your friend to register first.";
    }
    if (message.includes("cannot invite yourself")) {
      return "Enter your friend's email address, not your own.";
    }
    if (message.includes("already a workspace member")) {
      return "That account is already a member of this workspace.";
    }
    if (message.includes("already has an active invitation")) {
      return "That account already has an active invitation. Use the link previously created in this browser or sent to your friend. Supabase does not expose a function to retrieve a lost active link.";
    }
    if (message.includes("sole member")) {
      return "An invitation can only be sent while you are the workspace's only member.";
    }
    if (message.includes("authentication is required")) {
      return "Sign in again before inviting a workspace member.";
    }
  }

  return authErrorMessage(error);
}

function invitationIdFromLocation(): string | null {
  const invitationId = new URLSearchParams(window.location.search).get(
    "invite",
  );
  if (!invitationId) return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      invitationId,
    )
  ) {
    throw new Error(
      "This invitation link is invalid. Ask the owner for a new link.",
    );
  }
  return invitationId;
}

async function acceptWorkspaceInvitation(
  invitationId: string,
): Promise<string> {
  setFeedback(
    workspaceSyncStatus,
    "Checking your workspace invitation...",
    "loading",
  );
  const { data, error } = await supabase.rpc("accept_workspace_invitation", {
    invitation_id: invitationId,
  });
  if (error) throw new Error(invitationErrorMessage(error, true));
  if (typeof data !== "string" || !/^[0-9a-f-]{36}$/i.test(data)) {
    throw new Error(
      "The invitation was accepted, but the workspace response was invalid. Contact the workspace owner before retrying.",
    );
  }

  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.delete("invite");
  window.history.replaceState({}, "", currentUrl);
  setFeedback(
    workspaceSyncStatus,
    "Invitation accepted. Loading your shared workspace...",
    "success",
  );
  return data;
}

interface StoredWorkspaceInvitation {
  id: string;
  email: string;
}

function invitationStorageKey(workspaceContext: WorkspaceContext): string {
  return `studysync-workspace-invitation:${workspaceContext.workspace.id}:${workspaceContext.userId}`;
}

function workspaceSelectionStorageKey(userId: string): string {
  return `studysync-active-workspace:${userId}`;
}

function readWorkspaceSelection(userId: string): string | null {
  try {
    const workspaceId = localStorage.getItem(
      workspaceSelectionStorageKey(userId),
    );
    return workspaceId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        workspaceId,
      )
      ? workspaceId
      : null;
  } catch (error) {
    console.error(
      "Could not read the saved StudySync workspace selection:",
      error,
    );
    return null;
  }
}

function saveWorkspaceSelection(userId: string, workspaceId: string): void {
  try {
    localStorage.setItem(workspaceSelectionStorageKey(userId), workspaceId);
  } catch (error) {
    console.error("Could not save the StudySync workspace selection:", error);
  }
}

function renderWorkspaceSelection(
  session: Session,
  workspaces: WorkspaceRow[],
): void {
  document.getElementById("workspace-selection")?.remove();

  const container = document.createElement("div");
  container.id = "workspace-selection";
  container.className = "workspace-invitation";

  const message = document.createElement("p");
  message.className = "placeholder";
  message.textContent =
    "This account belongs to multiple confirmed workspaces. Choose which workspace to open.";
  container.append(message);

  const form = document.createElement("form");
  form.className = "weekly-goal-form";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void confirmWorkspaceSelection(
      session,
      select.value,
      workspaces,
      form,
      feedback,
    );
  });

  const label = document.createElement("label");
  label.htmlFor = "workspace-selection-choice";
  label.textContent = "Workspace";

  const select = document.createElement("select");
  select.id = "workspace-selection-choice";
  select.required = true;
  select.setAttribute("aria-describedby", "workspace-selection-feedback");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a workspace";
  placeholder.disabled = true;
  placeholder.selected = true;
  select.append(placeholder);

  const savedWorkspaceId = readWorkspaceSelection(session.user.id);
  for (const workspace of workspaces) {
    const option = document.createElement("option");
    option.value = workspace.id;
    option.textContent = `${workspace.name} — ${
      workspace.owner_id === session.user.id
        ? "owned by you"
        : "shared with you"
    } (${workspace.id.slice(0, 8)})`;
    option.selected = workspace.id === savedWorkspaceId;
    select.append(option);
  }

  label.append(select);

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Open workspace";

  form.append(label, button);

  const feedback = document.createElement("p");
  feedback.id = "workspace-selection-feedback";
  feedback.className = "weekly-goal-message";
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");

  container.append(form, feedback);
  workspaceSyncStatus.insertAdjacentElement("afterend", container);
}

async function confirmWorkspaceSelection(
  session: Session,
  workspaceId: string,
  workspaces: WorkspaceRow[],
  form: HTMLFormElement,
  feedback: HTMLElement,
): Promise<void> {
  if (
    currentSessionUserId !== session.user.id ||
    !workspaces.some((workspace) => workspace.id === workspaceId)
  ) {
    setFeedback(
      feedback,
      "That workspace selection is no longer available. Refresh and try again.",
      "error",
    );
    return;
  }

  const submitButton = form.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  if (submitButton) submitButton.disabled = true;
  setFeedback(feedback, "Verifying workspace membership...", "loading");

  try {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data || currentSessionUserId !== session.user.id) {
      throw new Error(
        "Your membership in that workspace could not be confirmed. Select a workspace you belong to, or ask the project administrator to review access.",
      );
    }

    saveWorkspaceSelection(session.user.id, workspaceId);
    document.getElementById("workspace-selection")?.remove();
    void initializeForSession(session, workspaceId);
  } catch (error) {
    console.error("Could not verify the selected StudySync workspace:", error);
    setFeedback(
      feedback,
      `Could not verify workspace membership. ${authErrorMessage(error)}`,
      "error",
    );
    if (submitButton) submitButton.disabled = false;
  }
}

function readStoredInvitation(
  workspaceContext: WorkspaceContext,
): StoredWorkspaceInvitation | null {
  try {
    const stored = localStorage.getItem(invitationStorageKey(workspaceContext));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "id" in parsed &&
      typeof parsed.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        parsed.id,
      ) &&
      "email" in parsed &&
      typeof parsed.email === "string"
    ) {
      return { id: parsed.id, email: parsed.email };
    }
    throw new Error("Stored workspace invitation details are invalid.");
  } catch (error) {
    console.error("Could not restore the saved workspace invitation:", error);
    return null;
  }
}

function invitationUrl(invitationId: string): string {
  const linkUrl = new URL(window.location.href);
  linkUrl.searchParams.set("invite", invitationId);
  return linkUrl.toString();
}

function updateInvitationControls(workspaceContext: WorkspaceContext): void {
  const isOwner =
    workspaceContext.workspace.owner_id === workspaceContext.userId;
  invitePanel.hidden = false;
  replaceInvitationButton.hidden = true;
  inviteForm.hidden = false;
  invitationLinkContainer.hidden = true;
  connectedMember.textContent = "";
  invitationStatus.textContent = "";
  invitationStatus.dataset.state = "info";
  invitationLink.value = "";

  if (workspaceContext.members.length >= 2) {
    inviteForm.hidden = true;
    replaceInvitationButton.hidden = true;
    invitationStatus.textContent = "Connected · 2 of 2 members";
    invitationStatus.dataset.state = "success";
    connectedMember.textContent = isOwner
      ? "Supabase confirms a second member. Their email is not available under the current access policies."
      : `Supabase confirms your membership. Signed in as ${workspaceContext.userEmail ?? "your account"}.`;
    setFeedback(
      inviteMessage,
      "This workspace already has two members. No further invitations can be sent.",
      "info",
    );
    clearStoredInvitation(workspaceContext);
    return;
  }

  if (!isOwner) {
    inviteForm.hidden = true;
    invitationStatus.textContent = "Membership verified · 1 of 2 visible";
    invitationStatus.dataset.state = "success";
    connectedMember.textContent = workspaceContext.userEmail
      ? `Supabase confirms your membership. Signed in as ${workspaceContext.userEmail}.`
      : "Supabase confirms your membership. Invite controls are available to the workspace owner.";
    inviteMessage.textContent = "";
    return;
  }

  if (workspaceContext.members.length !== 1) {
    inviteForm.hidden = true;
    invitationStatus.textContent = "Membership status unavailable";
    invitationStatus.dataset.state = "error";
    setFeedback(
      inviteMessage,
      "Invitations are available only when you are the workspace's sole member.",
      "error",
    );
    return;
  }

  inviteForm.hidden = false;
  const storedInvitation = readStoredInvitation(workspaceContext);
  if (storedInvitation) {
    inviteEmail.value = storedInvitation.email;
    invitationLink.value = invitationUrl(storedInvitation.id);
    invitationLinkContainer.hidden = false;
    inviteForm.hidden = true;
    replaceInvitationButton.hidden = false;
    invitationStatus.textContent = "Invitation issued · acceptance unconfirmed";
    invitationStatus.dataset.state = "info";
    connectedMember.textContent =
      "Supabase currently confirms only your membership (1 of 2). The available functions cannot verify whether this invitation has expired or been accepted.";
    setFeedback(
      inviteMessage,
      "The saved link is ready to share. A second member will be confirmed from Supabase membership.",
      "info",
    );
    return;
  }
  invitationStatus.textContent = "No second member confirmed · 1 of 2";
  invitationStatus.dataset.state = "info";
  connectedMember.textContent =
    "No invitation link is saved in this browser. This does not confirm whether an invitation was previously created; the available functions cannot retrieve its ID or link.";
  setFeedback(
    inviteMessage,
    "If you still have a previously copied link, send that to your friend. Otherwise, you can try creating an invitation; Supabase will reject a duplicate active invitation, but this page cannot recover that invitation's link.",
    "info",
  );
}

function clearStoredInvitation(workspaceContext: WorkspaceContext): void {
  try {
    localStorage.removeItem(invitationStorageKey(workspaceContext));
  } catch (error) {
    console.error("Could not clear the saved workspace invitation:", error);
  }
}

async function createWorkspaceInvitation(): Promise<void> {
  if (!context || context.workspace.owner_id !== context.userId) {
    setFeedback(
      inviteMessage,
      "Only the workspace owner can invite a friend.",
      "error",
    );
    return;
  }
  if (context.members.length !== 1) {
    setFeedback(
      inviteMessage,
      "Invitations are available only when you are the workspace's sole member.",
      "error",
    );
    return;
  }

  const email = inviteEmail.value.trim();
  if (!email) {
    setFeedback(
      inviteMessage,
      "Enter your friend's registered email address.",
      "error",
    );
    return;
  }

  const submitButton = inviteForm.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  if (submitButton) submitButton.disabled = true;
  setFeedback(
    inviteMessage,
    "Creating a secure workspace invitation...",
    "loading",
  );
  invitationLinkContainer.hidden = true;

  try {
    const { data, error } = await supabase.rpc("invite_workspace_member", {
      target_workspace: context.workspace.id,
      invited_email: email,
    });
    if (error) throw error;
    if (
      typeof data !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        data,
      )
    ) {
      throw new Error(
        "Supabase returned an invalid invitation ID. The invitation status cannot be confirmed; contact the project administrator before retrying.",
      );
    }

    invitationLink.value = invitationUrl(data);
    invitationLinkContainer.hidden = false;
    invitationStatus.textContent = "Invitation issued · acceptance unconfirmed";
    invitationStatus.dataset.state = "info";
    connectedMember.textContent = `Supabase confirms 1 of 2 members. The invitation was created for ${email}; acceptance and expiry cannot be checked with the available functions.`;
    inviteEmail.value = "";
    inviteForm.hidden = true;
    replaceInvitationButton.hidden = false;
    try {
      localStorage.setItem(
        invitationStorageKey(context),
        JSON.stringify({ id: data, email }),
      );
    } catch (storageError) {
      console.error(
        "Could not save the workspace invitation link locally:",
        storageError,
      );
      replaceInvitationButton.hidden = false;
      setFeedback(
        inviteMessage,
        "Invitation created, but this browser could not retain the link. Copy it now and send it to your friend.",
        "success",
      );
      return;
    }
    setFeedback(
      inviteMessage,
      "Invitation created. Copy and send the link to your friend. They must sign in with the invited email address. Membership will show as connected only after Supabase confirms the second member.",
      "success",
    );
  } catch (error) {
    console.error(
      "Could not create the StudySync workspace invitation:",
      error,
    );
    const storedInvitation = readStoredInvitation(context);
    const hasActiveInvitation =
      error instanceof Error &&
      error.message.toLowerCase().includes("already has an active invitation");
    if (hasActiveInvitation) {
      inviteForm.hidden = true;
      replaceInvitationButton.hidden = true;
      invitationStatus.textContent =
        "Active invitation exists · acceptance unconfirmed";
      invitationStatus.dataset.state = "info";
      if (storedInvitation) {
        invitationLink.value = invitationUrl(storedInvitation.id);
        invitationLinkContainer.hidden = false;
      } else {
        invitationLinkContainer.hidden = true;
      }
    }
    setFeedback(
      inviteMessage,
      hasActiveInvitation && !storedInvitation
        ? "Supabase reports an active invitation, but this browser has no saved link. Check any previously copied link or the browser where it was created; this page cannot retrieve it, so no further creation attempt is available."
        : invitationErrorMessage(error),
      "error",
    );
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function stopWorkspaceSync(): void {
  const channel = workspaceSyncChannel;
  workspaceSyncChannel = null;
  if (channel) void supabase.removeChannel(channel);
  if (realtimeRefreshTimer !== null) {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = null;
  }
  if (collaborationRefreshTimer !== null) {
    clearTimeout(collaborationRefreshTimer);
    collaborationRefreshTimer = null;
  }
}

function refreshFromRealtime(): void {
  if (realtimeRefreshTimer !== null) return;
  realtimeRefreshTimer = setTimeout(() => {
    realtimeRefreshTimer = null;
    void loadRecords().catch((error: unknown) => {
      console.error("Could not sync shared StudySync changes:", error);
      setFeedback(
        workspaceSyncStatus,
        `Live updates could not be loaded. ${authErrorMessage(error)}`,
        "error",
      );
    });
  }, 150);
}

function refreshCollaborationFromRealtime(): void {
  if (collaborationRefreshTimer !== null) return;
  collaborationRefreshTimer = setTimeout(() => {
    collaborationRefreshTimer = null;
    const activeContext = context;
    if (!activeContext) return;
    void loadCollaborativeRecords(activeContext).catch((error: unknown) => {
      console.error(
        "Could not sync shared StudySync questions and reviews:",
        error,
      );
      setFeedback(
        friendQuestionCreateMessage,
        authErrorMessage(error),
        "error",
      );
      setFeedback(
        friendQuestionAnswerMessage,
        authErrorMessage(error),
        "error",
      );
      setFeedback(reviewFeedbackMessage, authErrorMessage(error), "error");
    });
  }, 150);
}

function questionMetadataKey(workspaceId: string, userId: string): string {
  return `studysync-question-metadata:${workspaceId}:${userId}`;
}

function readQuestionMetadata(
  workspaceId: string,
  userId: string,
): Map<string, QuestionMetadata> {
  try {
    const serialized = localStorage.getItem(
      questionMetadataKey(workspaceId, userId),
    );
    if (!serialized) return new Map();
    const parsed: unknown = JSON.parse(serialized);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("Saved question details have an invalid format.");
    }
    const metadata = new Map<string, QuestionMetadata>();
    for (const [questionId, value] of Object.entries(parsed)) {
      if (
        typeof value === "object" &&
        value !== null &&
        "hints" in value &&
        typeof value.hints === "string" &&
        "expectedAnswer" in value &&
        typeof value.expectedAnswer === "string" &&
        "revealed" in value &&
        typeof value.revealed === "boolean"
      ) {
        metadata.set(questionId, {
          questionId,
          hints: value.hints,
          expectedAnswer: value.expectedAnswer,
          revealed: value.revealed,
        });
      } else {
        throw new Error("Saved question details contain an invalid entry.");
      }
    }
    return metadata;
  } catch (error) {
    console.error("Could not load local StudySync question details:", error);
    setFeedback(
      friendQuestionCreateMessage,
      "Cloud questions loaded, but locally saved hints and expected answers could not be read.",
      "error",
    );
    throw error;
  }
}

function saveQuestionMetadata(
  workspaceId: string,
  userId: string,
  metadata: QuestionMetadata[],
): void {
  const existing = readQuestionMetadata(workspaceId, userId);
  for (const item of metadata) existing.set(item.questionId, item);
  const serialized = Object.fromEntries(existing);
  localStorage.setItem(
    questionMetadataKey(workspaceId, userId),
    JSON.stringify(serialized),
  );
}

function dispatchCloudQuestions(
  workspaceContext: WorkspaceContext,
  questions: QuestionRow[],
  answers: AnswerRow[],
): void {
  let metadata: Map<string, QuestionMetadata>;
  try {
    metadata = readQuestionMetadata(
      workspaceContext.workspace.id,
      workspaceContext.userId,
    );
  } catch {
    metadata = new Map();
  }
  const latestAnswers = new Map<string, AnswerRow>();
  for (const answer of [...answers].sort((first, second) =>
    first.created_at.localeCompare(second.created_at),
  )) {
    latestAnswers.set(answer.question_id, answer);
  }
  const view: CloudQuestionView[] = questions.flatMap((question) => {
    const creator = userLabel(question.user_id);
    if (!creator) return [];
    const answer = latestAnswers.get(question.id);
    const details = metadata.get(question.id);
    return [
      {
        id: question.id,
        workspaceId: question.workspace_id,
        creator,
        assignee: creator === "User 1" ? "User 2" : "User 1",
        question: question.question_text,
        hints: details?.hints ?? "",
        expectedAnswer: details?.expectedAnswer ?? "",
        answer: answer?.answer_text ?? "",
        answered: Boolean(answer),
        revealed: details?.revealed ?? false,
        date: question.created_at,
      },
    ];
  });
  window.dispatchEvent(
    new CustomEvent<CloudQuestionView[]>("studysync-cloud-questions", {
      detail: view,
    }),
  );
  if (workspaceContext.members.length < 2) {
    setFeedback(
      friendQuestionCreateMessage,
      "Questions are available after a second workspace member joins.",
      "info",
    );
    setFeedback(
      friendQuestionAnswerMessage,
      "Questions are available after a second workspace member joins.",
      "info",
    );
  }
}

function periodDateRange(
  period: ReviewPeriod,
  today: Date,
): { start: Date; end: Date } {
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  let end: Date;
  if (period === "weekly") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end = new Date(start);
    end.setDate(end.getDate() + 7);
  } else if (period === "monthly") {
    start.setDate(1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  } else {
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  }
  return { start, end };
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseReviewFeedback(feedback: string): CloudReviewView["feedback"] {
  const sections: CloudReviewView["feedback"] = {
    wentWell: "",
    improve: "",
    advice: "",
    targets: "",
  };
  const labels = new Map<string, keyof CloudReviewView["feedback"]>([
    ["What Went Well", "wentWell"],
    ["Areas to Improve", "improve"],
    ["Next Period's Targets", "targets"],
  ]);
  const sectionPattern =
    /(?:^|\n\n)(What Went Well|Areas to Improve|Next Period's Targets):\n/g;
  const matches = [...feedback.matchAll(sectionPattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = match[1];
    const start = (match.index ?? 0) + match[0].length;
    const end =
      index + 1 < matches.length
        ? (matches[index + 1].index ?? feedback.length)
        : feedback.length;
    const key = labels.get(label);
    if (key) sections[key] = feedback.slice(start, end).trim();
  }
  if (!matches.length && feedback) sections.wentWell = feedback;
  return sections;
}

function dispatchCloudReviews(workspaceContext: WorkspaceContext): void {
  const view: CloudReviewView[] = cloudReviews.flatMap((review) => {
    const author = userLabel(review.reviewer_id);
    const recipient = userLabel(review.reviewee_id);
    if (!author || !recipient) return [];
    const [year, month, day] = review.review_date.split("-").map(Number);
    const start = new Date(year, month - 1, day);
    const range = periodDateRange(review.review_period, start);
    const end = new Date(range.end);
    end.setDate(end.getDate() - 1);
    const periodLabel =
      review.review_period === "daily"
        ? `Day of ${start.toLocaleDateString("en-IN")}`
        : review.review_period === "weekly"
          ? `Week of ${start.toLocaleDateString("en-IN")} – ${end.toLocaleDateString("en-IN")}`
          : start.toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric",
            });
    return [
      {
        id: review.id,
        workspaceId: review.workspace_id,
        author,
        recipient,
        period: review.review_period,
        periodLabel,
        periodStart: review.review_date,
        periodEnd: localDateString(end),
        feedback: parseReviewFeedback(review.feedback),
        suggestions: (review.suggestions ?? "").replace(
          /^Suggestions or Advice:\n/,
          "",
        ),
        timestamp: review.created_at,
      },
    ];
  });
  window.dispatchEvent(
    new CustomEvent<CloudReviewView[]>("studysync-cloud-reviews", {
      detail: view,
    }),
  );
  if (workspaceContext.members.length < 2) {
    setFeedback(
      reviewFeedbackMessage,
      "Shared reviews are available after a second workspace member joins.",
      "info",
    );
  }
}

async function loadCollaborativeRecords(
  workspaceContext: WorkspaceContext,
): Promise<void> {
  const sequence = ++collaborationLoadSequence;
  const workspaceId = workspaceContext.workspace.id;
  setFeedback(
    friendQuestionCreateMessage,
    "Loading shared questions...",
    "loading",
  );
  setFeedback(friendQuestionAnswerMessage, "Loading answers...", "loading");
  setFeedback(reviewFeedbackMessage, "Loading shared reviews...", "loading");

  const [
    { data: questionRows, error: questionError },
    { data: reviewRows, error: reviewError },
  ] = await Promise.all([
    supabase
      .from("questions")
      .select("id,workspace_id,user_id,question_text,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("reviews")
      .select(
        "id,workspace_id,reviewer_id,reviewee_id,review_period,review_date,feedback,suggestions,created_at",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
  ]);
  if (questionError) throw questionError;
  if (reviewError) throw reviewError;
  const loadedQuestions = (questionRows ?? []) as QuestionRow[];
  let loadedAnswers: AnswerRow[] = [];
  if (loadedQuestions.length) {
    const { data: answerRows, error: answerError } = await supabase
      .from("answers")
      .select("id,question_id,user_id,answer_text,created_at")
      .in(
        "question_id",
        loadedQuestions.map((question) => question.id),
      )
      .order("created_at", { ascending: true });
    if (answerError) throw answerError;
    loadedAnswers = (answerRows ?? []) as AnswerRow[];
  }
  if (sequence !== collaborationLoadSequence || context !== workspaceContext) {
    return;
  }
  const loadedReviews = (reviewRows ?? []) as ReviewRow[];
  const unsupportedReview = loadedReviews.find(
    (review) =>
      review.review_period !== "daily" &&
      review.review_period !== "weekly" &&
      review.review_period !== "monthly",
  );
  if (unsupportedReview) {
    throw new Error(
      `Review ${unsupportedReview.id} uses an unsupported review period and was not displayed.`,
    );
  }
  cloudQuestions = loadedQuestions;
  cloudAnswers = loadedAnswers;
  cloudReviews = loadedReviews;
  dispatchCloudQuestions(workspaceContext, cloudQuestions, cloudAnswers);
  dispatchCloudReviews(workspaceContext);
  setFeedback(
    friendQuestionCreateMessage,
    cloudQuestions.length
      ? `${cloudQuestions.length} shared question${cloudQuestions.length === 1 ? "" : "s"} loaded.${legacyLocalCount("studysync-friend-questions", "question")}`
      : `No questions yet. Create one above.${legacyLocalCount("studysync-friend-questions", "question")}`,
    "info",
  );
  setFeedback(
    friendQuestionAnswerMessage,
    cloudAnswers.length
      ? `${cloudAnswers.length} shared answer${cloudAnswers.length === 1 ? "" : "s"} loaded.`
      : "No answers submitted yet.",
    "info",
  );
  setFeedback(
    reviewFeedbackMessage,
    cloudReviews.length
      ? `${cloudReviews.length} shared review${cloudReviews.length === 1 ? "" : "s"} loaded.${legacyLocalCount("studysync-submitted-reviews", "review")}`
      : `No submitted reviews for this workspace yet.${legacyLocalCount("studysync-submitted-reviews", "review")}`,
    "info",
  );
}

function legacyLocalCount(storageKey: string, label: string): string {
  try {
    const serialized = localStorage.getItem(storageKey);
    if (!serialized) return "";
    const records: unknown = JSON.parse(serialized);
    if (!Array.isArray(records) || records.length === 0) return "";
    return ` ${records.length} previous local ${label}${records.length === 1 ? "" : "s"} remain saved in this browser and were not imported.`;
  } catch (error) {
    console.error(`Could not inspect preserved local ${label} records:`, error);
    return ` Previous local ${label} data remains untouched but could not be counted.`;
  }
}

async function createCloudQuestions(): Promise<void> {
  const workspaceContext = context;
  if (!workspaceContext) {
    setFeedback(
      friendQuestionCreateMessage,
      "Sign in to create shared questions.",
      "error",
    );
    return;
  }
  if (workspaceContext.members.length !== 2) {
    setFeedback(
      friendQuestionCreateMessage,
      "A second workspace member must join before creating questions for a friend.",
      "error",
    );
    return;
  }
  const self = currentUserLabel();
  const form = new FormData(friendQuestionForm);
  const creator = form.get("creator");
  const assignee = form.get("assignee");
  const count = Number(form.get("questionCount"));
  if (
    creator !== self ||
    (assignee !== "User 1" && assignee !== "User 2") ||
    assignee === self
  ) {
    setFeedback(
      friendQuestionCreateMessage,
      "Questions must be created by your signed-in account and assigned to the other workspace member.",
      "error",
    );
    return;
  }
  if (!Number.isInteger(count) || count < 1 || count > 4) {
    setFeedback(
      friendQuestionCreateMessage,
      "Select between 1 and 4 questions.",
      "error",
    );
    return;
  }
  const storageProbe = `${questionMetadataKey(workspaceContext.workspace.id, workspaceContext.userId)}:probe`;
  try {
    localStorage.setItem(storageProbe, "1");
    localStorage.removeItem(storageProbe);
  } catch (error) {
    console.error(
      "Cannot preserve expected answers in browser storage:",
      error,
    );
    setFeedback(
      friendQuestionCreateMessage,
      "Questions were not created because this browser cannot save their hints and expected answers. Enable browser storage and try again.",
      "error",
    );
    return;
  }
  const drafts: { question: string; hints: string; expectedAnswer: string }[] =
    [];
  for (let index = 0; index < count; index += 1) {
    const question = String(form.get(`question-${index}`) ?? "").trim();
    const hints = String(form.get(`hints-${index}`) ?? "").trim();
    const expectedAnswer = String(
      form.get(`expectedAnswer-${index}`) ?? "",
    ).trim();
    if (!question || !expectedAnswer) {
      setFeedback(
        friendQuestionCreateMessage,
        `Enter both the question and expected answer for Question ${index + 1}.`,
        "error",
      );
      return;
    }
    drafts.push({ question, hints, expectedAnswer });
  }

  const submit = friendQuestionForm.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  if (submit) submit.disabled = true;
  setFeedback(
    friendQuestionCreateMessage,
    "Saving questions to the shared workspace...",
    "loading",
  );
  const metadata: QuestionMetadata[] = [];
  let created = 0;
  let metadataSaved = true;
  try {
    for (const draft of drafts) {
      const { data, error } = await supabase
        .from("questions")
        .insert({
          workspace_id: workspaceContext.workspace.id,
          user_id: workspaceContext.userId,
          question_text: draft.question,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (!data?.id)
        throw new Error(
          "Supabase saved a question but returned no question ID.",
        );
      metadata.push({
        questionId: data.id,
        hints: draft.hints,
        expectedAnswer: draft.expectedAnswer,
        revealed: false,
      });
      created += 1;
    }
    try {
      saveQuestionMetadata(
        workspaceContext.workspace.id,
        workspaceContext.userId,
        metadata,
      );
    } catch (error) {
      metadataSaved = false;
      console.error(
        "Cloud questions were saved, but their local expected-answer details could not be saved:",
        error,
      );
    }
    friendQuestionForm.reset();
    syncCollaborationControls(workspaceContext);
    friendQuestionCountSelect.dispatchEvent(new Event("change"));
    try {
      await loadCollaborativeRecords(workspaceContext);
    } catch (error) {
      console.error("Questions were saved but could not be reloaded:", error);
      setFeedback(
        friendQuestionCreateMessage,
        `Questions were saved, but the list could not refresh. ${authErrorMessage(error)}`,
        "error",
      );
      return;
    }
    setFeedback(
      friendQuestionCreateMessage,
      metadataSaved
        ? `${created} question${created === 1 ? "" : "s"} created for ${assignee}.`
        : "Questions were saved in Supabase, but hints and expected answers could not be saved in this browser. The questions remain available; restore browser storage before entering those details again.",
      metadataSaved ? "success" : "error",
    );
    if (created)
      friendQuestionForm.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
  } catch (error) {
    console.error("Could not save StudySync questions:", error);
    if (metadata.length) {
      try {
        saveQuestionMetadata(
          workspaceContext.workspace.id,
          workspaceContext.userId,
          metadata,
        );
      } catch (metadataError) {
        metadataSaved = false;
        console.error(
          "Could not preserve details for partially saved questions:",
          metadataError,
        );
      }
    }
    await loadCollaborativeRecords(workspaceContext).catch(
      (loadError: unknown) => {
        console.error(
          "Could not refresh questions after a save failure:",
          loadError,
        );
      },
    );
    setFeedback(
      friendQuestionCreateMessage,
      created
        ? `${created} question${created === 1 ? "" : "s"} were saved${metadataSaved ? "" : ", but some hints and expected answers could not be preserved locally"}; a later question failed. ${authErrorMessage(error)}`
        : authErrorMessage(error),
      "error",
    );
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function submitCloudAnswer(form: HTMLFormElement): Promise<void> {
  const workspaceContext = context;
  const message = friendQuestionAnswerMessage;
  const questionId = form.dataset.questionId;
  const answerText = String(new FormData(form).get("answer") ?? "").trim();
  if (!workspaceContext || !questionId) {
    setFeedback(
      message,
      "This question is not available in the current workspace.",
      "error",
    );
    return;
  }
  if (workspaceContext.members.length !== 2) {
    setFeedback(
      message,
      "A second workspace member must join before answering shared questions.",
      "error",
    );
    return;
  }
  if (!answerText) {
    setFeedback(message, "Please enter an answer.", "error");
    return;
  }
  const question = cloudQuestions.find((row) => row.id === questionId);
  if (!question || question.user_id === workspaceContext.userId) {
    setFeedback(
      message,
      "Only the other workspace member can answer this question.",
      "error",
    );
    return;
  }
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  setFeedback(message, "Saving your answer...", "loading");
  try {
    const { error } = await supabase.from("answers").insert({
      question_id: questionId,
      user_id: workspaceContext.userId,
      answer_text: answerText,
    });
    if (error) throw error;
  } catch (error) {
    console.error("Could not save StudySync answer:", error);
    setFeedback(message, authErrorMessage(error), "error");
    if (submit) submit.disabled = false;
    return;
  }
  setFeedback(message, "Answer saved to the shared workspace.", "success");
  try {
    await loadCollaborativeRecords(workspaceContext);
  } catch (error) {
    console.error(
      "Answer was saved but the shared answer list could not be refreshed:",
      error,
    );
    setFeedback(
      message,
      `Answer was saved, but the list could not refresh. ${authErrorMessage(error)}`,
      "error",
    );
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function submitCloudReview(): Promise<void> {
  const workspaceContext = context;
  if (!workspaceContext) {
    setFeedback(
      reviewFeedbackMessage,
      "Sign in to submit a shared review.",
      "error",
    );
    return;
  }
  if (workspaceContext.members.length !== 2) {
    setFeedback(
      reviewFeedbackMessage,
      "A second workspace member must join before submitting a shared review.",
      "error",
    );
    return;
  }
  const reviewer = currentUserLabel();
  const revieweeLabel: UserLabel | null =
    reviewer === "User 1" ? "User 2" : reviewer === "User 2" ? "User 1" : null;
  if (reviewUserSelect.value !== reviewer || !revieweeLabel) {
    setFeedback(
      reviewFeedbackMessage,
      "Reviews must be submitted by your signed-in account to the other workspace member.",
      "error",
    );
    return;
  }
  const reviewee = workspaceContext.members.find(
    (member) => userLabel(member.user_id) === revieweeLabel,
  );
  if (!reviewee) {
    setFeedback(
      reviewFeedbackMessage,
      "The other workspace member could not be verified.",
      "error",
    );
    return;
  }
  const period = reviewPeriodSelect.value;
  if (period !== "daily" && period !== "weekly" && period !== "monthly") {
    setFeedback(
      reviewFeedbackMessage,
      "Choose a valid review period.",
      "error",
    );
    return;
  }
  const values = new FormData(reviewForm);
  const wentWell = String(values.get("wentWell") ?? "").trim();
  const improve = String(values.get("improve") ?? "").trim();
  const advice = String(values.get("advice") ?? "").trim();
  const targets = String(values.get("targets") ?? "").trim();
  if (![wentWell, improve, advice, targets].some(Boolean)) {
    setFeedback(
      reviewFeedbackMessage,
      "Enter feedback in at least one field before submitting.",
      "error",
    );
    return;
  }
  const feedback = [
    wentWell ? `What Went Well:\n${wentWell}` : "",
    improve ? `Areas to Improve:\n${improve}` : "",
    targets ? `Next Period's Targets:\n${targets}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const generatedSuggestions = Array.from(
    document.querySelectorAll("#review-results .review-suggestions li"),
  )
    .map((item) => item.textContent?.trim() ?? "")
    .filter(Boolean);
  const suggestions = [
    advice ? `Suggestions or Advice:\n${advice}` : "",
    ...generatedSuggestions,
  ]
    .filter(Boolean)
    .join("\n\n");
  const { start } = periodDateRange(period, new Date());
  const submit = reviewForm.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  if (submit) submit.disabled = true;
  setFeedback(
    reviewFeedbackMessage,
    "Submitting review to the shared workspace...",
    "loading",
  );
  try {
    const { error } = await supabase.from("reviews").insert({
      workspace_id: workspaceContext.workspace.id,
      reviewer_id: workspaceContext.userId,
      reviewee_id: reviewee.user_id,
      review_period: period,
      review_date: localDateString(start),
      feedback,
      suggestions: suggestions || null,
    });
    if (error) throw error;
  } catch (error) {
    console.error("Could not submit StudySync review:", error);
    setFeedback(reviewFeedbackMessage, authErrorMessage(error), "error");
    if (submit) submit.disabled = false;
    return;
  }
  reviewForm.reset();
  setFeedback(
    reviewFeedbackMessage,
    `Review submitted to ${revieweeLabel}.`,
    "success",
  );
  try {
    await loadCollaborativeRecords(workspaceContext);
  } catch (error) {
    console.error(
      "Review was submitted but the review list could not be refreshed:",
      error,
    );
    setFeedback(
      reviewFeedbackMessage,
      `Review was submitted, but the list could not refresh. ${authErrorMessage(error)}`,
      "error",
    );
  } finally {
    if (submit) submit.disabled = false;
  }
}

function persistExpectedAnswerReveal(question: CloudQuestionView): void {
  if (!context) return;
  try {
    saveQuestionMetadata(context.workspace.id, context.userId, [
      {
        questionId: question.id,
        hints: question.hints,
        expectedAnswer: question.expectedAnswer,
        revealed: true,
      },
    ]);
  } catch (error) {
    console.error("Could not save expected-answer reveal state:", error);
    setFeedback(
      friendQuestionCreateMessage,
      "Expected answer reveal state could not be saved in this browser.",
      "error",
    );
  }
}

function syncCollaborationControls(workspaceContext: WorkspaceContext): void {
  const self = currentUserLabel();
  const peer: UserLabel | null =
    self === "User 1" ? "User 2" : self === "User 2" ? "User 1" : null;
  for (const [select, selected] of [
    [friendCreatorSelect, self],
    [friendAssigneeSelect, peer],
    [friendCurrentUserSelect, self],
    [reviewUserSelect, self],
  ] as const) {
    for (const option of Array.from(select.options)) {
      option.disabled = Boolean(selected && option.value !== selected);
    }
    if (selected) select.value = selected;
  }
  if (workspaceContext.members.length < 2) {
    friendQuestionForm
      .querySelector<HTMLButtonElement>('button[type="submit"]')
      ?.setAttribute("disabled", "true");
  } else {
    friendQuestionForm
      .querySelector<HTMLButtonElement>('button[type="submit"]')
      ?.removeAttribute("disabled");
  }
}

async function refreshMembershipFromRealtime(
  workspaceId: string,
): Promise<void> {
  const activeContext = context;
  if (!activeContext) return;
  let refreshedContext: WorkspaceContext;
  try {
    refreshedContext = await fetchWorkspaceContext(
      activeContext.userId,
      activeContext.userEmail,
    );
  } catch (error) {
    console.error("Could not refresh StudySync workspace membership:", error);
    setFeedback(
      inviteMessage,
      `Could not refresh workspace member status. ${authErrorMessage(error)}`,
      "error",
    );
    return;
  }
  if (
    context !== activeContext ||
    refreshedContext.workspace.id !== workspaceId
  ) {
    return;
  }
  context = refreshedContext;
  updateInvitationControls(refreshedContext);
  syncCollaborationControls(refreshedContext);
  try {
    await loadRecords();
  } catch (error) {
    console.error("Could not refresh shared StudySync tasks and goals:", error);
    const message = `Could not refresh shared tasks and goals. ${authErrorMessage(error)}`;
    setFeedback(dailyMessage, message, "error");
    setFeedback(weeklyMessage, message, "error");
    setFeedback(monthlyMessage, message, "error");
  }
  try {
    await loadCollaborativeRecords(refreshedContext);
  } catch (error) {
    console.error(
      "Could not refresh shared StudySync questions and reviews:",
      error,
    );
    const message = `Could not refresh shared questions and reviews. ${authErrorMessage(error)}`;
    setFeedback(friendQuestionCreateMessage, message, "error");
    setFeedback(friendQuestionAnswerMessage, message, "error");
    setFeedback(reviewFeedbackMessage, message, "error");
  }
}

function startWorkspaceSync(workspaceId: string): void {
  if (workspaceSyncChannel) stopWorkspaceSync();

  const channel = supabase
    .channel(`studysync-workspace-${workspaceId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tasks",
        filter: `workspace_id=eq.${workspaceId}`,
      },
      refreshFromRealtime,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "workspace_members",
        filter: `workspace_id=eq.${workspaceId}`,
      },
      () => {
        void refreshMembershipFromRealtime(workspaceId);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "goals",
        filter: `workspace_id=eq.${workspaceId}`,
      },
      refreshFromRealtime,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "questions",
        filter: `workspace_id=eq.${workspaceId}`,
      },
      refreshCollaborationFromRealtime,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "answers",
      },
      refreshCollaborationFromRealtime,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "reviews",
        filter: `workspace_id=eq.${workspaceId}`,
      },
      refreshCollaborationFromRealtime,
    )
    .subscribe((status, error) => {
      if (workspaceSyncChannel !== channel) return;
      if (status === "SUBSCRIBED") {
        setFeedback(
          workspaceSyncStatus,
          "Live sync is connected for this workspace.",
          "success",
        );
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        if (error) {
          console.error("StudySync live sync failed:", error);
        }
        setFeedback(
          workspaceSyncStatus,
          "Live sync is unavailable. Enable Realtime for tasks, goals, workspace_members, questions, answers, and reviews in Supabase to receive study changes and member updates as they happen.",
          "error",
        );
      }
    });
  workspaceSyncChannel = channel;
  setFeedback(
    workspaceSyncStatus,
    "Connecting to live workspace sync...",
    "loading",
  );
}

async function fetchWorkspaceContext(
  userId: string,
  userEmail: string | null,
  acceptedWorkspaceId: string | null = null,
  requireExplicitSelection = false,
): Promise<WorkspaceContext> {
  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id,user_id")
    .eq("user_id", userId);
  if (membershipError) throw membershipError;

  const workspaceIds = [
    ...new Set(
      (memberships ?? []).map(
        (membership) => membership.workspace_id as string,
      ),
    ),
  ];
  const preferredWorkspaceId =
    acceptedWorkspaceId ?? readWorkspaceSelection(userId);

  if (acceptedWorkspaceId && !workspaceIds.includes(acceptedWorkspaceId)) {
    throw new Error(
      "The accepted invitation workspace is not present in the current membership list. Ask the project administrator to verify workspace membership before continuing.",
    );
  }

  let workspace: WorkspaceRow | null = null;
  let visibleMemberships = memberships ?? [];

  if (workspaceIds.length) {
    const { data: workspaces, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id,owner_id,name,created_at")
      .in("id", workspaceIds)
      .order("created_at", { ascending: true });
    if (workspaceError) throw workspaceError;
    const workspaceRows = (workspaces ?? []) as WorkspaceRow[];
    if (workspaceRows.length !== workspaceIds.length) {
      throw new Error(
        "Not all confirmed workspace memberships are visible to this account. Check workspace access and RLS before selecting a workspace.",
      );
    }
    if (
      acceptedWorkspaceId &&
      !workspaceRows.some((row) => row.id === acceptedWorkspaceId)
    ) {
      throw new Error(
        "The accepted invitation workspace is not visible to this account. Ask the project administrator to verify workspace access.",
      );
    }
    if (
      workspaceIds.length > 1 &&
      (requireExplicitSelection ||
        !workspaceRows.some((row) => row.id === preferredWorkspaceId))
    ) {
      throw new WorkspaceSelectionRequiredError(workspaceRows);
    }
    const selectedWorkspaceId =
      workspaceIds.length === 1 ? workspaceIds[0] : preferredWorkspaceId;
    workspace =
      workspaceRows.find((row) => row.id === selectedWorkspaceId) ?? null;
  } else {
    const { data: ownedWorkspaces, error: ownedError } = await supabase
      .from("workspaces")
      .select("id,owner_id,name,created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });
    if (ownedError) throw ownedError;
    if (ownedWorkspaces?.length) {
      throw new Error(
        "A workspace already exists for this account but its membership is missing. No duplicate workspace was created; ask the project administrator to review workspace membership.",
      );
    }

    const { data: createdWorkspace, error: createError } = await supabase
      .from("workspaces")
      .insert({ name: "StudySync", owner_id: userId })
      .select("id,owner_id,name,created_at")
      .single();
    if (createError) throw createError;
    workspace = createdWorkspace as WorkspaceRow;

    const { data: createdMemberships, error: createdMembershipError } =
      await supabase
        .from("workspace_members")
        .select("workspace_id,user_id")
        .eq("workspace_id", workspace.id);
    if (createdMembershipError) throw createdMembershipError;
    visibleMemberships = createdMemberships ?? [];
    if (!visibleMemberships.some((row) => row.user_id === userId)) {
      throw new Error(
        "Workspace was created, but its owner membership was not visible. Check the workspace membership trigger and RLS setup.",
      );
    }
  }

  if (!workspace) {
    throw new Error(
      "No workspace is visible to this account. Check workspace membership and RLS permissions.",
    );
  }

  const { data: members, error: membersError } = await supabase
    .from("workspace_members")
    .select("workspace_id,user_id")
    .eq("workspace_id", workspace.id);
  if (membersError) throw membersError;
  const workspaceMembers = (members ?? []) as MembershipRow[];
  if (!workspaceMembers.some((member) => member.user_id === userId)) {
    throw new Error(
      "You are not a member of the selected workspace, so its study records cannot be loaded.",
    );
  }
  if (workspaceMembers.length > 2) {
    throw new Error(
      "This workspace has more than two members. StudySync did not load its data; ask the project administrator to review membership and RLS.",
    );
  }
  return { workspace, members: workspaceMembers, userId, userEmail };
}

function legacyNotice(
  storageKey: string,
  label: string,
  count = countLegacyRecords(storageKey),
): string {
  return count
    ? ` ${count} existing local ${label}${count === 1 ? "" : "s"} were preserved and not imported because their User 1/User 2 ownership cannot be verified.`
    : "";
}

async function loadRecords(): Promise<void> {
  const activeContext = context;
  if (!activeContext) return;
  setFeedback(dailyMessage, "Loading tasks from Supabase...", "loading");
  setFeedback(
    weeklyMessage,
    "Loading weekly goals from Supabase...",
    "loading",
  );
  setFeedback(
    monthlyMessage,
    "Loading monthly goals from Supabase...",
    "loading",
  );

  const [
    { data: taskRows, error: tasksError },
    { data: goalRows, error: goalsError },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id,workspace_id,user_id,title,description,due_date,status,created_at",
      )
      .eq("workspace_id", activeContext.workspace.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("goals")
      .select("id,workspace_id,user_id,title,period,start_date,end_date,status")
      .eq("workspace_id", activeContext.workspace.id)
      .order("start_date", { ascending: false }),
  ]);
  if (tasksError) throw tasksError;
  if (goalsError) throw goalsError;
  if (context !== activeContext) return;

  tasks = (taskRows ?? []) as TaskRow[];
  goals = (goalRows ?? []) as GoalRow[];
  loadGoalDescriptions();
  renderAll();

  const legacyTaskNotice = legacyNotice(
    legacyTaskStorageKey,
    "task",
    countLegacyTasks(),
  );
  setFeedback(
    dailyMessage,
    `${tasks.length ? "" : "No cloud tasks yet."}${legacyTaskNotice}`.trim(),
    "info",
  );
  setFeedback(
    weeklyMessage,
    `${goals.some((goal) => goal.period === "weekly") ? "" : "No weekly goals yet."}${legacyNotice(weeklyStorageKey, "weekly goal")}`,
    "info",
  );
  setFeedback(
    monthlyMessage,
    `${goals.some((goal) => goal.period === "monthly") ? "" : "No monthly goals yet."}${legacyNotice(monthlyStorageKey, "monthly goal")}`,
    "info",
  );
}

async function updateTaskStatus(
  taskId: string,
  completed: boolean,
): Promise<void> {
  if (!context) return;
  setFeedback(dailyMessage, "Updating task...", "loading");
  const { error } = await supabase
    .from("tasks")
    .update({ status: completed ? "completed" : "incomplete" })
    .eq("id", taskId)
    .eq("workspace_id", context.workspace.id)
    .select("id")
    .single();
  if (error) {
    setFeedback(dailyMessage, authErrorMessage(error), "error");
    return;
  }
  try {
    await loadRecords();
    setFeedback(dailyMessage, "Task status updated.", "success");
  } catch (loadError) {
    setFeedback(dailyMessage, authErrorMessage(loadError), "error");
  }
}

async function editTask(task: TaskRow): Promise<void> {
  if (!context) return;
  const title = window.prompt("Edit task title", task.title);
  if (title === null) return;
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    setFeedback(dailyMessage, "A task title cannot be empty.", "error");
    return;
  }
  const description = window.prompt(
    "Edit task description",
    task.description ?? "",
  );
  if (description === null) return;

  setFeedback(dailyMessage, "Saving task changes...", "loading");
  const { error } = await supabase
    .from("tasks")
    .update({
      title: trimmedTitle,
      description: description.trim() || null,
    })
    .eq("id", task.id)
    .eq("workspace_id", context.workspace.id)
    .select("id")
    .single();
  if (error) {
    setFeedback(dailyMessage, authErrorMessage(error), "error");
    return;
  }
  try {
    await loadRecords();
    setFeedback(
      dailyMessage,
      "Task updated in the shared workspace.",
      "success",
    );
  } catch (loadError) {
    setFeedback(dailyMessage, authErrorMessage(loadError), "error");
  }
}

async function deleteTask(task: TaskRow): Promise<void> {
  if (!context) return;
  if (!window.confirm(`Delete the task "${task.title}"?`)) return;

  setFeedback(dailyMessage, "Deleting task...", "loading");
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", task.id)
    .eq("workspace_id", context.workspace.id)
    .select("id")
    .single();
  if (error) {
    setFeedback(dailyMessage, authErrorMessage(error), "error");
    return;
  }
  try {
    await loadRecords();
    setFeedback(
      dailyMessage,
      "Task deleted from the shared workspace.",
      "success",
    );
  } catch (loadError) {
    setFeedback(dailyMessage, authErrorMessage(loadError), "error");
  }
}

function readFormText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function handleTaskSubmit(event: SubmitEvent): void {
  if (workType.value !== "task") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void createTask(new FormData(dailyForm));
}

async function createTask(formData: FormData): Promise<void> {
  if (!context) {
    setFeedback(dailyMessage, "Your workspace is not ready yet.", "error");
    return;
  }
  const title = readFormText(formData, "title");
  const description = readFormText(formData, "description");
  if (!title) {
    setFeedback(dailyMessage, "Please enter a task title.", "error");
    return;
  }

  setFeedback(dailyMessage, "Saving task to Supabase...", "loading");
  const { error } = await supabase.from("tasks").insert({
    workspace_id: context.workspace.id,
    user_id: context.userId,
    title,
    description: description || null,
    status: "incomplete",
  });
  if (error) {
    setFeedback(dailyMessage, authErrorMessage(error), "error");
    return;
  }
  dailyForm.reset();
  setTaskAssignmentRules();
  try {
    await loadRecords();
    setFeedback(dailyMessage, "Task saved to the shared workspace.", "success");
  } catch (loadError) {
    setFeedback(dailyMessage, authErrorMessage(loadError), "error");
  }
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function readDateInput(formData: FormData, key: string): string | null {
  const value = readFormText(formData, key);
  return isValidCalendarDate(value) ? value : null;
}

async function createGoal(
  period: GoalPeriod,
  form: HTMLFormElement,
  message: HTMLElement,
): Promise<void> {
  if (!context) {
    setFeedback(message, "Your workspace is not ready yet.", "error");
    return;
  }
  const formData = new FormData(form);
  const title = readFormText(formData, "title");
  const description = readFormText(formData, "description");
  let startDate: string | null;

  if (period === "weekly") {
    startDate = readDateInput(formData, "weekStart");
  } else {
    const month = readFormText(formData, "month");
    startDate =
      /^\d{4}-\d{2}$/.test(month) &&
      !Number.isNaN(Date.parse(`${month}-01T00:00:00Z`))
        ? `${month}-01`
        : null;
  }

  if (!title) {
    setFeedback(message, "Please enter a goal title.", "error");
    return;
  }
  if (!startDate) {
    setFeedback(
      message,
      period === "weekly"
        ? "Please select a valid week-start date."
        : "Please select a valid month.",
      "error",
    );
    return;
  }

  const rangeGoal: GoalRow = {
    id: "",
    workspace_id: context.workspace.id,
    user_id: context.userId,
    title,
    period,
    start_date: startDate,
    end_date: startDate,
    status: "active",
  };
  const { start, end } = goalDateRange(rangeGoal);
  setFeedback(message, `Saving ${period} goal to Supabase...`, "loading");
  const { data, error } = await supabase
    .from("goals")
    .insert({
      workspace_id: context.workspace.id,
      user_id: context.userId,
      title,
      period,
      start_date: start,
      end_date: end,
      status: "active",
    })
    .select("id")
    .single();
  if (error) {
    setFeedback(message, authErrorMessage(error), "error");
    return;
  }

  const descriptionSaved = saveGoalDescription(data.id, description);
  form.reset();
  if (period === "weekly") {
    syncAssigneeOptions(weeklyAssignee, true);
    const input = document.getElementById("weekly-goal-week");
    if (input instanceof HTMLInputElement) input.value = getCurrentWeekStart();
  } else {
    syncAssigneeOptions(monthlyAssignee, true);
    const input = document.getElementById("monthly-goal-month");
    if (input instanceof HTMLInputElement) {
      const now = new Date();
      input.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
  }
  try {
    await loadRecords();
    const descriptionNote = description
      ? descriptionSaved
        ? " Goal saved; its description is stored only in this browser because the database schema has no description column."
        : " Goal saved, but its description could not be saved in this browser."
      : "";
    setFeedback(
      message,
      `${period === "weekly" ? "Weekly" : "Monthly"} goal saved to the shared workspace.${descriptionNote}`,
      description && !descriptionSaved ? "error" : "success",
    );
  } catch (loadError) {
    setFeedback(message, authErrorMessage(loadError), "error");
  }
}

async function updateGoalStatus(
  goal: GoalRow,
  completed: boolean,
): Promise<void> {
  if (!context) return;
  const message = goal.period === "weekly" ? weeklyMessage : monthlyMessage;
  setFeedback(message, "Updating goal...", "loading");
  const { error } = await supabase
    .from("goals")
    .update({ status: completed ? "completed" : "active" })
    .eq("id", goal.id)
    .eq("workspace_id", context.workspace.id)
    .select("id")
    .single();
  if (error) {
    setFeedback(message, authErrorMessage(error), "error");
    return;
  }
  try {
    await loadRecords();
    setFeedback(message, "Goal status updated.", "success");
  } catch (loadError) {
    setFeedback(message, authErrorMessage(loadError), "error");
  }
}

async function editGoal(goal: GoalRow): Promise<void> {
  if (!context) return;
  const title = window.prompt("Edit goal title", goal.title);
  if (title === null) return;
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    const message = goal.period === "weekly" ? weeklyMessage : monthlyMessage;
    setFeedback(message, "A goal title cannot be empty.", "error");
    return;
  }

  const datePrompt =
    goal.period === "weekly"
      ? "Edit week start date (YYYY-MM-DD)"
      : "Edit goal month (YYYY-MM)";
  const currentDate =
    goal.period === "weekly" ? goal.start_date : goal.start_date.slice(0, 7);
  const dateValue = window.prompt(datePrompt, currentDate);
  if (dateValue === null) return;
  const startDate =
    goal.period === "weekly"
      ? isValidCalendarDate(dateValue)
        ? dateValue
        : null
      : /^\d{4}-\d{2}$/.test(dateValue) &&
          !Number.isNaN(Date.parse(`${dateValue}-01T00:00:00Z`))
        ? `${dateValue}-01`
        : null;
  const message = goal.period === "weekly" ? weeklyMessage : monthlyMessage;
  if (!startDate) {
    setFeedback(
      message,
      goal.period === "weekly"
        ? "Enter a valid date in YYYY-MM-DD format."
        : "Enter a valid month in YYYY-MM format.",
      "error",
    );
    return;
  }

  const updatedRange = goalDateRange({ ...goal, start_date: startDate });
  setFeedback(message, "Saving goal changes...", "loading");
  const { error } = await supabase
    .from("goals")
    .update({
      title: trimmedTitle,
      start_date: updatedRange.start,
      end_date: updatedRange.end,
    })
    .eq("id", goal.id)
    .eq("workspace_id", context.workspace.id)
    .select("id")
    .single();
  if (error) {
    setFeedback(message, authErrorMessage(error), "error");
    return;
  }
  try {
    await loadRecords();
    setFeedback(message, "Goal updated in the shared workspace.", "success");
  } catch (loadError) {
    setFeedback(message, authErrorMessage(loadError), "error");
  }
}

async function deleteGoal(goal: GoalRow): Promise<void> {
  if (!context) return;
  if (!window.confirm(`Delete the goal "${goal.title}"?`)) return;
  const message = goal.period === "weekly" ? weeklyMessage : monthlyMessage;

  setFeedback(message, "Deleting goal...", "loading");
  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", goal.id)
    .eq("workspace_id", context.workspace.id)
    .select("id")
    .single();
  if (error) {
    setFeedback(message, authErrorMessage(error), "error");
    return;
  }
  saveGoalDescription(goal.id, "");
  try {
    await loadRecords();
    setFeedback(message, "Goal deleted from the shared workspace.", "success");
  } catch (loadError) {
    setFeedback(message, authErrorMessage(loadError), "error");
  }
}

function getCurrentWeekStart(): string {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function clearSignedInData(): void {
  stopWorkspaceSync();
  collaborationLoadSequence += 1;
  context = null;
  tasks = [];
  goals = [];
  cloudQuestions = [];
  cloudAnswers = [];
  cloudReviews = [];
  window.dispatchEvent(
    new CustomEvent<CloudQuestionView[]>("studysync-cloud-questions", {
      detail: [],
    }),
  );
  window.dispatchEvent(
    new CustomEvent<CloudReviewView[]>("studysync-cloud-reviews", {
      detail: [],
    }),
  );
  goalDescriptions = {};
  dailyList.replaceChildren();
  weeklyUsers.replaceChildren();
  monthlyUsers.replaceChildren();
  setFeedback(dailyMessage, "", "info");
  setFeedback(weeklyMessage, "", "info");
  setFeedback(monthlyMessage, "", "info");
  setFeedback(workspaceSyncStatus, "", "info");
  setFeedback(friendQuestionCreateMessage, "", "info");
  setFeedback(friendQuestionAnswerMessage, "", "info");
  setFeedback(reviewFeedbackMessage, "", "info");
  dispatchReviewProgress();
}

async function initializeForSession(
  session: Session | null,
  selectedWorkspaceId: string | null = null,
): Promise<void> {
  if (!session) {
    requestSequence += 1;
    currentSessionUserId = null;
    initializingUserId = null;
    initializationPromise = null;
    clearSignedInData();
    return;
  }
  if (currentSessionUserId === session.user.id && context) return;
  if (initializingUserId === session.user.id && initializationPromise) {
    return initializationPromise;
  }

  const sequence = ++requestSequence;
  stopWorkspaceSync();
  currentSessionUserId = session.user.id;
  initializingUserId = session.user.id;
  context = null;
  tasks = [];
  goals = [];
  cloudQuestions = [];
  cloudAnswers = [];
  cloudReviews = [];
  collaborationLoadSequence += 1;
  window.dispatchEvent(
    new CustomEvent<CloudQuestionView[]>("studysync-cloud-questions", {
      detail: [],
    }),
  );
  window.dispatchEvent(
    new CustomEvent<CloudReviewView[]>("studysync-cloud-reviews", {
      detail: [],
    }),
  );
  const busyText = "Preparing your StudySync workspace...";
  setFeedback(dailyMessage, busyText, "loading");
  setFeedback(weeklyMessage, busyText, "loading");
  setFeedback(monthlyMessage, busyText, "loading");
  setFeedback(
    friendQuestionCreateMessage,
    "Preparing shared questions...",
    "loading",
  );
  setFeedback(
    friendQuestionAnswerMessage,
    "Preparing shared answers...",
    "loading",
  );
  setFeedback(reviewFeedbackMessage, "Preparing shared reviews...", "loading");

  initializationPromise = (async () => {
    try {
      const invitationId = invitationIdFromLocation();
      const acceptedWorkspaceId = invitationId
        ? await acceptWorkspaceInvitation(invitationId)
        : null;
      if (acceptedWorkspaceId) {
        saveWorkspaceSelection(session.user.id, acceptedWorkspaceId);
      }
      if (sequence !== requestSequence) return;
      const workspaceContext = await fetchWorkspaceContext(
        session.user.id,
        session.user.email ?? null,
        acceptedWorkspaceId ?? selectedWorkspaceId,
        !acceptedWorkspaceId && !selectedWorkspaceId,
      );
      if (sequence !== requestSequence) return;
      document.getElementById("workspace-selection")?.remove();
      context = workspaceContext;
      updateInvitationControls(workspaceContext);
      syncCollaborationControls(workspaceContext);
      setTaskAssignmentRules();
      syncAssigneeOptions(weeklyAssignee, true);
      syncAssigneeOptions(monthlyAssignee, true);
      startWorkspaceSync(workspaceContext.workspace.id);
      await loadRecords();
      try {
        await loadCollaborativeRecords(workspaceContext);
      } catch (collaborationError) {
        console.error(
          "Could not load shared StudySync questions and reviews:",
          collaborationError,
        );
        setFeedback(
          friendQuestionCreateMessage,
          `Could not load shared questions. ${authErrorMessage(collaborationError)}`,
          "error",
        );
        setFeedback(
          friendQuestionAnswerMessage,
          `Could not load shared answers. ${authErrorMessage(collaborationError)}`,
          "error",
        );
        setFeedback(
          reviewFeedbackMessage,
          `Could not load shared reviews. ${authErrorMessage(collaborationError)}`,
          "error",
        );
      }
    } catch (error) {
      if (sequence !== requestSequence) return;
      if (error instanceof WorkspaceSelectionRequiredError) {
        const message = "Select a confirmed workspace to load your study data.";
        setFeedback(dailyMessage, message, "info");
        setFeedback(weeklyMessage, message, "info");
        setFeedback(monthlyMessage, message, "info");
        setFeedback(workspaceSyncStatus, message, "info");
        renderWorkspaceSelection(session, error.workspaces);
        return;
      }
      console.error("Could not initialize StudySync workspace data:", error);
      const message = authErrorMessage(error);
      setFeedback(dailyMessage, message, "error");
      setFeedback(weeklyMessage, message, "error");
      setFeedback(monthlyMessage, message, "error");
      setFeedback(workspaceSyncStatus, message, "error");
      if (invitationIdFromLocationSafe()) {
        setFeedback(inviteMessage, message, "error");
      }
    } finally {
      if (sequence === requestSequence) {
        initializingUserId = null;
        initializationPromise = null;
      }
    }
  })();
  return initializationPromise;
}

function invitationIdFromLocationSafe(): boolean {
  return new URLSearchParams(window.location.search).has("invite");
}

dailyForm.addEventListener(
  "submit",
  (event) => handleTaskSubmit(event as SubmitEvent),
  true,
);
inviteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void createWorkspaceInvitation();
});
replaceInvitationButton.addEventListener("click", () => {
  if (context) {
    const storedInvitation = readStoredInvitation(context);
    if (storedInvitation) inviteEmail.value = storedInvitation.email;
  }
  inviteForm.hidden = false;
  replaceInvitationButton.hidden = true;
  setFeedback(
    inviteMessage,
    "Enter the same registered email to try again. Supabase will allow a replacement only when no active invitation exists; the client cannot check expiry.",
    "info",
  );
});
copyInvitationLinkButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(invitationLink.value);
    setFeedback(
      inviteMessage,
      "Invitation link copied. Send it to your friend.",
      "success",
    );
  } catch (error) {
    console.error("Could not copy the StudySync invitation link:", error);
    setFeedback(
      inviteMessage,
      "Could not copy automatically. Select the invitation link and copy it manually.",
      "error",
    );
  }
});
dailyForm.addEventListener("submit", () => {
  if (workType.value !== "task") queueMicrotask(renderDailyWork);
});
workType.addEventListener("change", setTaskAssignmentRules);
weeklyForm.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    void createGoal("weekly", weeklyForm, weeklyMessage);
  },
  true,
);
monthlyForm.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    void createGoal("monthly", monthlyForm, monthlyMessage);
  },
  true,
);
friendQuestionForm.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    void createCloudQuestions();
  },
  true,
);
reviewForm.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    void submitCloudReview();
  },
  true,
);
document.addEventListener(
  "submit",
  (event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLFormElement) ||
      !target.classList.contains("friend-answer-form")
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    void submitCloudAnswer(target);
  },
  true,
);
window.addEventListener("studysync-reveal-cloud-answer", (event) => {
  const question = (event as CustomEvent<CloudQuestionView>).detail;
  const storedQuestion = cloudQuestions.find(
    (item) => item.id === question?.id,
  );
  if (
    !context ||
    !storedQuestion ||
    storedQuestion.user_id !== context.userId
  ) {
    setFeedback(
      friendQuestionCreateMessage,
      "Only the question creator can reveal its expected answer.",
      "error",
    );
    return;
  }
  persistExpectedAnswerReveal(question);
  dispatchCloudQuestions(context, cloudQuestions, cloudAnswers);
});

supabase.auth.onAuthStateChange((_event, session) => {
  void initializeForSession(session);
});
