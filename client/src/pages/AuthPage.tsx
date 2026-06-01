import { useState, type FormEvent } from "react";
import { signIn, signUp } from "../services/authService";
import type { CurrentUser } from "../types";

interface AuthPageProps {
  mode: "signin" | "signup";
  onAuth: (user: CurrentUser) => void | Promise<void>;
  onNavigate: (path: string) => void;
}

export function AuthPage({ mode, onAuth, onNavigate }: AuthPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState("");
  const isSignup = mode === "signup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError("");

    try {
      const result = isSignup ? await signUp(email, password) : await signIn(email, password);
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
        <span className="eyebrow">{isSignup ? "Create Account" : "Sign In"}</span>
        <h1>{isSignup ? "Make these playlists yours." : "Welcome back to Flim."}</h1>
        <p>{isSignup ? "Create an account so your playlists belong to you." : "Sign in to manage your playlists and profile."}</p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Email
            <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label>
            Password
            <input autoComplete={isSignup ? "new-password" : "current-password"} minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {error ? <p className="error-message">{error}</p> : null}
          <button className="primary-button" disabled={status === "saving"} type="submit">
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
