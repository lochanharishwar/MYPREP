'use client';
import { useRef, useState } from 'react';
import Image from 'next/image';
import {
  ArrowUpRight,
  CheckCircle2,
  LockKeyhole,
  Plug,
  RefreshCw,
} from 'lucide-react';
import { useWorkspace } from './workspace-provider';
import { SectionHeading } from './section-heading';
import { ConfirmAction } from './confirm-action';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { socialCatalog, socialOrder, socialSetup } from '@/lib/social-catalog';
import type { Platform } from '@/lib/contracts';

export function SocialConnections() {
  const w = useWorkspace();
  const [selected, setSelected] = useState<Platform | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const accounts = w.records<{
    platform: Platform;
    name: string;
    status: string;
    expiresAt?: string;
    destination?: string;
  }>('connection');
  const setup = selected
    ? socialSetup(selected, w.state.services, w.localMode)
    : null;
  const start = async (platform: Platform) => {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError('');
    try {
      const r = await w.mutate<{ url: string }>('connect', {
        brandId: w.brandId,
        platform,
        returnTo: '/schedule',
      });
      window.location.assign(r.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setPending(false);
    }
  };
  return (
    <section
      className="panel social-hub"
      aria-label="Social account connections"
    >
      <div className="section-title">
        <div>
          <SectionHeading character="connections">
            Your channels, together.
          </SectionHeading>
          <p className="muted small">
            Choose a channel → allow access on its website → return here. Each
            platform asks for its own permission.
          </p>
        </div>
        <span className="pill">
          {accounts.filter((a) => a.payload.status === 'connected').length}{' '}
          connected
        </span>
      </div>
      <div className="social-channel-grid">
        {socialOrder.map((platform) => {
          const item = socialCatalog[platform];
          const config = socialSetup(platform, w.state.services, w.localMode);
          const linked = accounts.filter(
            (a) => a.payload.platform === platform,
          );
          return (
            <article className="social-channel" key={platform}>
              <div className="row">
                <span className="social-mark" aria-hidden="true">
                  <Image
                    src={item.logo}
                    alt=""
                    width={32}
                    height={32}
                    unoptimized
                  />
                </span>
                <div>
                  <h3>{item.name}</h3>
                  <p className="small muted">{item.formats}</p>
                </div>
              </div>
              {!config.backgroundReady && <p className="small amber">Automatic posting needs the background service.</p>}
              <p className="small muted social-channel-detail">
                {item.analytics}
              </p>
              {linked.map((a) => {
                const expired = a.payload.status !== 'connected';
                return (
                  <div className="social-account" key={a.id}>
                    <strong>{a.payload.name}</strong>
                    <span className={`small ${expired ? 'amber' : 'green'}`}>
                      {expired ? 'Needs permission — reconnect' : 'Connected'}
                    </span>
                    {a.payload.expiresAt && <p className="small muted">Access token expiry: {new Date(a.payload.expiresAt).toLocaleString()}. The server refreshes supported tokens; reconnect if access is rejected.</p>}
                    {a.payload.destination && (
                      <span className="small muted">
                        {a.payload.destination}
                      </span>
                    )}
                    {['reddit', 'linkedin'].includes(platform) && (
                      <form
                        className="field"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void w
                            .mutate('connection', {
                              id: a.id,
                              destination: f.get('destination'),
                            })
                            .catch(() => {});
                        }}
                      >
                        <label className="small">
                          {platform === 'reddit'
                            ? 'Subreddit'
                            : 'Publishing destination'}
                          <input
                            name="destination"
                            defaultValue={a.payload.destination}
                            placeholder={
                              platform === 'reddit'
                                ? 'Subreddit without r/'
                                : 'urn:li:organization:…'
                            }
                            required
                          />
                        </label>
                        <button
                          className="secondary-btn"
                          disabled={
                            w.busy || w.state.workspace?.role !== 'owner'
                          }
                        >
                          Save destination
                        </button>
                      </form>
                    )}
                    <ConfirmAction
                      label="Disconnect"
                      title={`Disconnect ${a.payload.name}?`}
                      description="Removes the saved access for this account. Published posts remain live; dispatched uploads may still finish."
                      confirmLabel="Disconnect account"
                      className="text-link small"
                      disabled={w.busy || w.state.workspace?.role !== 'owner'}
                      onConfirm={() =>
                        w.mutate('connection', { id: a.id, disconnect: true })
                      }
                    />
                  </div>
                );
              })}
              {!linked.length && (
                <span className={`pill ${config.connectReady ? '' : 'amber'}`}>
                  {config.connectReady
                    ? 'Ready to connect'
                    : 'One-time setup needed'}
                </span>
              )}
              <button
                className="secondary-btn social-connect"
                disabled={pending || w.busy}
                onClick={() => {
                  setError('');
                  if (
                    config.connectReady &&
                    w.brandId &&
                    w.state.workspace?.role === 'owner'
                  )
                    void start(platform);
                  else setSelected(platform);
                }}
              >
                {linked.length ? <RefreshCw size={15} /> : <Plug size={15} />}
                {config.connectReady
                  ? linked.length
                    ? 'Connect another / reconnect'
                    : `Connect ${item.name}`
                  : 'Set up connection'}
              </button>
            </article>
          );
        })}
      </div>
      <p className="small muted social-security">
        <LockKeyhole size={14} /> Permission stays under your control. Account
        tokens are encrypted on the server; they are never saved in browser
        storage.
      </p>
      {error && !selected && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !pending) setSelected(null);
        }}
      >
        <DialogContent className="dialog-scroll sm:max-w-xl">
          <DialogTitle>
            {selected
              ? `Connect ${socialCatalog[selected].name}`
              : 'Connect account'}
          </DialogTitle>
          <DialogDescription>
            {selected && socialCatalog[selected].permission}
          </DialogDescription>
          {selected && setup && (
            <div className="stack">
              <p className="small muted">
                {socialCatalog[selected].requirement}
              </p>
              {setup.missing.length > 0 && (
                <div className="connection-setup">
                  <h3>Activate once, then connect in a few clicks</h3>
                  <p className="small muted">
                    The website owner needs to finish these service settings.
                    Your social-media password is never needed here.
                  </p>
                  <ul>
                    {setup.missing.map((s) => (
                      <li key={s}>
                        <Plug size={14} /> {s}
                      </li>
                    ))}
                  </ul>
                  <details>
                    <summary>Owner setup details</summary>
                    <p className="small muted">
                      Configure the server workspace, token encryption and this
                      platform’s client ID and secret in the hosting
                      environment. Register this callback in the platform’s
                      developer console:
                    </p>
                    <code className="connection-callback">
                      {typeof location !== 'undefined' ? location.origin : ''}
                      /api/oauth/{selected}/callback
                    </code>
                    <p className="small muted">
                      Background publishing also needs Inngest event and signing
                      keys. Service credentials are never entered into this
                      public page.
                    </p>
                  </details>
                </div>
              )}
              {!setup.backgroundReady && (
                <p className="notice small">
                  Automatic posting and metric refresh still need the background
                  service activated.
                </p>
              )}
              {!w.brandId && (
                <p className="notice small">
                  Add or select a brand from the top navigation first.
                </p>
              )}
              {!w.localMode && w.state.workspace?.role !== 'owner' && (
                <p className="notice small">
                  Your workspace owner can authorize accounts for this brand.
                </p>
              )}
              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
              <a
                className="text-link small"
                href={socialCatalog[selected].docs}
                target="_blank"
                rel="noreferrer"
              >
                Official connection requirements <ArrowUpRight size={13} />
              </a>
              <button
                className="primary-btn"
                disabled={
                  !setup.connectReady ||
                  !w.brandId ||
                  w.state.workspace?.role !== 'owner' ||
                  pending
                }
                onClick={() => void start(selected)}
              >
                <CheckCircle2 size={16} />
                {pending
                  ? 'Opening consent…'
                  : `Continue to ${socialCatalog[selected].name}`}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
