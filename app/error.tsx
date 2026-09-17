'use client';
import Link from 'next/link';

export default function WorkspaceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="content">
      <section className="panel stack">
        <h1>We couldn’t load this page.</h1>
        <p className="muted">
          Try again. If this continues, return to the dashboard and reopen the
          page.
        </p>
        <div className="tabs-row">
          <button className="primary-btn" onClick={reset}>
            Try again
          </button>
          <Link className="secondary-btn" href="/">
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
