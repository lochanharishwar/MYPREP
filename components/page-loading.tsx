export function PageLoading({ label = 'your workspace' }: { label?: string }) {
  return <section className="page-loading" role="status" aria-live="polite">
    <p>Opening {label}…</p>
    <div className="page-loading-grid" aria-hidden="true">
      {[0, 1, 2].map(index => <div key={index} className="page-loading-card"><span /><span /><span /></div>)}
    </div>
  </section>;
}
