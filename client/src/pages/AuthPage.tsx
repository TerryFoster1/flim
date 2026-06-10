import { useEffect, useState, type FormEvent } from "react";
import { signIn, signUp } from "../services/authService";
import { checkUsernameAvailability } from "../services/profileService";
import type { CurrentUser } from "../types";

interface AuthPageProps {
  mode: "signin" | "signup";
  onAuth: (user: CurrentUser) => void | Promise<void>;
  onNavigate: (path: string) => void;
}

export function AuthPage({ mode, onAuth, onNavigate }: AuthPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleStatus, setHandleStatus] = useState<"idle" | "checking" | "available" | "unavailable">("idle");
  const [handleMessage, setHandleMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState("");
  const isSignup = mode === "signup";

  function cleanHandle(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9_]/g, "");
  }

  useEffect(() => {
    if (!isSignup) return;
    const clean = cleanHandle(handle);
    if (!clean) {
      setHandleStatus("idle");
      setHandleMessage("Choose a username for your Flim URL.");
      return;
    }

    let cancelled = false;
    setHandleStatus("checking");
    setHandleMessage("Checking username...");
    const timer = window.setTimeout(() => {
      checkUsernameAvailability(clean)
        .then((result) => {
          if (cancelled) return;
          setHandleStatus(result.available ? "available" : "unavailable");
          setHandleMessage(result.message);
        })
        .catch(() => {
          if (cancelled) return;
          setHandleStatus("unavailable");
          setHandleMessage("Could not check that username right now.");
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [handle, isSignup]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError("");

    try {
      if (isSignup && handleStatus !== "available") {
        setError(handleMessage || "Choose an available username.");
        setStatus("idle");
        return;
      }
      const result = isSignup ? await signUp(email, password, cleanHandle(handle), displayName) : await signIn(email, password);
      await onAuth(result.user);
      onNavigate("/");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Could not sign in right now.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <section className="route-page auth-page">
      <div className="auth-card">
        <h1>{isSignup ? "Make these playlists yours." : "Welcome back to Flim."}</h1>
        <p>{isSignup ? "Create an account to save your playlists." : "Sign in to manage your playlists and profile."}</p>
        <form className="auth-form" onSubmit={submit}>
          {isSignup ? (
            <label>
              Display Name
              <input autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} placeholder="Terry Foster" value={displayName} />
            </label>
          ) : null}
          {isSignup ? (
            <label>
              Username
              <div className="handle-input-row">
                <span>flim.ca/@</span>
                <input
                  autoCapitalize="none"
                  autoComplete="username"
                  onChange={(event) => setHandle(cleanHandle(event.target.value))}
                  pattern="[a-z0-9_]+"
                  placeholder="moviebuff1984"
                  required
                  value={handle}
                />
              </div>
              <small className={handleStatus === "available" ? "success-inline" : handleStatus === "unavailable" ? "error-inline" : ""}>{handleMessage}</small>
            </label>
          ) : null}
          <label>
            Email
            <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label>
            Password
            <input autoComplete={isSignup ? "new-password" : "current-password"} minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {error ? <p className="error-message">{error}</p> : null}
          <button className="primary-button" disabled={status === "saving" || (isSignup && handleStatus !== "available")} type="submit">
            {status === "saving" ? "Please wait..." : isSignup ? "Create Account" : "Sign In"}
          </button>
        </form>
        <button className="secondary-button" onClick={() => onNavigate(isSignup ? "/signin" : "/signup")} type="button">
          {isSignup ? "Already have an account? Sign in" : "New to Flim? Create account"}
        </button>
      </div>
    </section>
  );
}
