import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="content">
      <section className="panel stack">
        <span className="eyebrow">BRANDCURRENT · 404</span>
        <h1>This page could not be found.</h1>
        <p className="muted">
          The address may have changed. Return to your workspace to continue.
        </p>
        <Link className="primary-btn" href="/">
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
