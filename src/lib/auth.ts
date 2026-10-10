import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase.ts";

function requireElement<T extends HTMLElement>(
  id: string,
  elementType: { new (): T },
): T {
  const element = document.getElementById(id);
  if (!(element instanceof elementType)) {
    throw new Error(`StudySync authentication element "${id}" was not found.`);
  }
  return element;
}

const authView = requireElement("auth-view", HTMLElement);
const studyApp = requireElement("study-app", HTMLElement);
const authForm = requireElement("auth-form", HTMLFormElement);
const emailInput = requireElement("auth-email", HTMLInputElement);
const passwordInput = requireElement("auth-password", HTMLInputElement);
const submitButton = requireElement("auth-submit", HTMLButtonElement);
const googleButton = requireElement("auth-google", HTMLButtonElement);
const modeToggle = requireElement("auth-mode-toggle", HTMLButtonElement);
const heading = requireElement("auth-heading", HTMLHeadingElement);
const description = requireElement("auth-description", HTMLElement);
const formStatus = requireElement("auth-form-status", HTMLElement);
const sessionPanel = requireElement("auth-session", HTMLElement);
const sessionEmail = requireElement("auth-session-email", HTMLElement);
const sessionStatus = requireElement("auth-session-status", HTMLElement);
const logoutButton = requireElement("auth-logout", HTMLButtonElement);

let mode: "login" | "signup" = "login";
const hasWorkspaceInvitation = new URLSearchParams(
  window.location.search,
).has("invite");

function setMessage(
  element: HTMLElement,
  message: string,
  state: "error" | "success" | "info",
): void {
  element.textContent = message;
  element.dataset.state = state;
}

function setMode(nextMode: "login" | "signup"): void {
  mode = nextMode;
  const signingUp = mode === "signup";

  heading.textContent = signingUp
    ? "Create your StudySync account"
    : "Sign in to StudySync";
  description.textContent = signingUp
    ? "Create an account with your email address and a password."
    : hasWorkspaceInvitation
      ? "Sign in using the email address the workspace owner invited."
      : "Sign in to continue to your StudySync workspace.";
  submitButton.textContent = signingUp ? "Create account" : "Sign in";
  modeToggle.textContent = signingUp
    ? "Already have an account? Sign in"
    : "Create an account";
  passwordInput.autocomplete = signingUp
    ? "new-password"
    : "current-password";
  formStatus.textContent = "";
  delete formStatus.dataset.state;
}

function showSession(session: Session | null): void {
  const signedIn = session !== null;
  authView.hidden = signedIn;
  studyApp.hidden = !signedIn;
  sessionPanel.hidden = !signedIn;
  sessionEmail.textContent = session?.user.email ?? "";
  if (signedIn) passwordInput.value = "";
  sessionStatus.textContent = "";
  delete sessionStatus.dataset.state;
}

function readableAuthError(error: unknown): string {
  if (error instanceof TypeError) {
    return "Could not reach Supabase. Check your internet connection and try again.";
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : "";

  if (
    message.includes("user already registered") ||
    message.includes("email_exists")
  ) {
    return "An account with this email already exists. Sign in instead.";
  }

  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid_credentials")
  ) {
    return "Email or password is incorrect. Check your details and try again.";
  }

  if (message.includes("email not confirmed")) {
    return "Confirm your email using the link we sent before signing in.";
  }

  if (
    message.includes("provider is not enabled") ||
    message.includes("unsupported provider")
  ) {
    return "Google sign-in is not enabled for this Supabase project. Check its Auth provider settings.";
  }

  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch")
  ) {
    return "Could not reach Supabase. Check your internet connection and try again.";
  }

  return error instanceof Error
    ? error.message
    : "Authentication failed. Please try again.";
}

modeToggle.addEventListener("click", () => {
  setMode(mode === "login" ? "signup" : "login");
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  modeToggle.disabled = true;
  googleButton.disabled = true;
  setMessage(
    formStatus,
    mode === "signup" ? "Creating your account..." : "Signing in...",
    "info",
  );

  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;

      if (data.user?.identities?.length === 0) {
        setMessage(
          formStatus,
          "An account with this email already exists. Sign in instead.",
          "error",
        );
      } else if (data.session) {
        showSession(data.session);
      } else {
        setMessage(
          formStatus,
          "Account created. Check your email for a confirmation link, then sign in.",
          "success",
        );
        setMode("login");
        setMessage(
          formStatus,
          "Account created. Check your email for a confirmation link, then sign in.",
          "success",
        );
        passwordInput.value = "";
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      showSession(data.session);
    }
  } catch (error) {
    console.error("StudySync authentication failed:", error);
    setMessage(formStatus, readableAuthError(error), "error");
  } finally {
    submitButton.disabled = false;
    modeToggle.disabled = false;
    googleButton.disabled = false;
  }
});

googleButton.addEventListener("click", async () => {
  submitButton.disabled = true;
  modeToggle.disabled = true;
  googleButton.disabled = true;
  setMessage(formStatus, "Redirecting to Google...", "info");

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}${window.location.search}`,
      },
    });
    if (error) throw error;
  } catch (error) {
    console.error("StudySync Google sign-in failed:", error);
    setMessage(
      formStatus,
      `Google sign-in could not be started. ${readableAuthError(error)}`,
      "error",
    );
    submitButton.disabled = false;
    modeToggle.disabled = false;
    googleButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  setMessage(sessionStatus, "Signing out...", "info");

  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    showSession(null);
  } catch (error) {
    console.error("StudySync sign-out failed:", error);
    setMessage(sessionStatus, readableAuthError(error), "error");
  } finally {
    logoutButton.disabled = false;
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  showSession(session);
});

async function restoreSession(): Promise<void> {
  submitButton.disabled = true;
  modeToggle.disabled = true;
  googleButton.disabled = true;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    showSession(data.session);
    if (!data.session) {
      setMessage(
        formStatus,
        hasWorkspaceInvitation
          ? "You have a workspace invitation. Sign in with the invited account to accept it."
          : "Sign in or create an account to continue.",
        "info",
      );
    }
  } catch (error) {
    console.error("Could not restore the StudySync session:", error);
    showSession(null);
    setMessage(formStatus, readableAuthError(error), "error");
  } finally {
    submitButton.disabled = false;
    modeToggle.disabled = false;
    googleButton.disabled = false;
  }
}

void restoreSession();
