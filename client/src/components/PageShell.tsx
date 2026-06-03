import type { ReactNode } from "react";

interface PageShellProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
}

export function PageShell({ title, description, action, children }: PageShellProps) {
  return (
    <section className="route-page">
      <div className={`page-heading ${action ? "split-heading" : ""}`}>
        <div>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
