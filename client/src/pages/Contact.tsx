import { useState, type FormEvent } from "react";
import { PageShell } from "../components/PageShell";

export function Contact() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Contact request failed.");
      event.currentTarget.reset();
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <PageShell eyebrow="Contact" title="Contact Us" description="Send a note about Flim, playlists, sharing, Plex, or provider discovery.">
      <form className="contact-form" onSubmit={submit}>
        <label>
          <span>Name</span>
          <input name="name" required />
        </label>
        <label>
          <span>Email</span>
          <input name="email" required type="email" />
        </label>
        <label>
          <span>Subject</span>
          <input name="subject" required />
        </label>
        <label>
          <span>Message</span>
          <textarea name="message" required rows={6} />
        </label>
        <button className="primary-button" disabled={status === "sending"} type="submit">
          {status === "sending" ? "Sending..." : "Send Message"}
        </button>
      </form>
      {status === "sent" ? <p className="success-message">Message received. Email delivery will be wired to the backend notification provider next.</p> : null}
      {status === "error" ? <p className="error-message">Could not send your message right now. Please try again shortly.</p> : null}
    </PageShell>
  );
}
