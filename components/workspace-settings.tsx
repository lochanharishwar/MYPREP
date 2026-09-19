'use client';
import { useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Plug, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useWorkspace } from './workspace-provider';
import { platforms } from '@/lib/contracts';
import { GovernancePanel } from './governance-panel';
import { IdentityControls } from './identity-controls';
import { ConfirmAction } from './confirm-action';
export function WorkspaceSettings() {
  const w = useWorkspace();
  const [saving, setSaving] = useState(false);
  const running = useRef(false);
  const [email, setEmail] = useState(''),
    [name, setName] = useState('My marketing team'),
    [limit, setLimit] = useState(''),
    [newUrl, setNewUrl] = useState(''),
    [inviteEmail, setInviteEmail] = useState(''),
    [role, setRole] = useState('editor'),
    [message, setMessage] = useState('');
  const connections = w.records<{
    platform: string;
    name: string;
    status: string;
    destination?: string;
  }>('connection');
  const run = async (fn: () => Promise<unknown>, success?: string) => {
    if (running.current) return;
    running.current = true;
    setSaving(true);
    setMessage('');
    try {
      await fn();
      if (success) setMessage(success);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      running.current = false;
      setSaving(false);
    }
  };
  return (
    <Dialog open={w.settings} onOpenChange={w.setSettings}>
      <DialogContent className="sm:max-w-2xl dialog-scroll">
        <DialogTitle>Workspace settings</DialogTitle>
        <DialogDescription>
          Connect your team, set your limits, and bring your channels together.
        </DialogDescription>
        {message && <output className="notice">{message}</output>}
        {w.state.budget && (
          <p className="notice">
            This month: USD {Number(w.state.budget.reservedUSD).toFixed(2)}{' '}
            reserved/used of USD {w.state.workspace?.monthly_limit}.{' '}
            {w.state.budget.estimated
              ? 'Includes unsettled conservative estimates.'
              : 'Measured usage.'}
          </p>
        )}
        {saving && (
          <output className="muted small">Saving your request…</output>
        )}
        <fieldset disabled={saving || w.busy} className="min-w-0 border-0 p-0">
          <Tabs defaultValue="account">
            <TabsList className="w-full h-auto flex-wrap">
              <TabsTrigger value="account">Workspace</TabsTrigger>
              <TabsTrigger value="connections">Connections</TabsTrigger>
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="governance">Governance</TabsTrigger>
            </TabsList>
            <TabsContent value="account">
              <IdentityControls />
              {(w.state.workspaces?.length ?? 0) > 0 && (
                <label className="field spaced">
                  Active workspace
                  <select
                    value={w.workspaceId}
                    onChange={(e) => w.setWorkspaceId(e.target.value)}
                  >
                    {w.state.workspaces?.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} · {x.role}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {w.session && w.state.workspace && (
                <button
                  className="text-link spaced"
                  onClick={() =>
                    void run(
                      () => w.mutate('workspace', { accept: true }),
                      'Invitations accepted. Select your workspace above.',
                    )
                  }
                >
                  Accept another workspace invitation
                </button>
              )}
              <div className="stack spaced">
                {w.localMode ? (
                  <>
                    <div className="notice">
                      Local workspace mode is on. Brand discoveries and
                      generated drafts are saved only in this browser; social
                      publishing, team access, and customer data require the
                      secure backend.
                    </div>
                    <button
                      className="secondary-btn"
                      onClick={() => {
                        localStorage.removeItem('bc_local_workspace_v1');
                        location.reload();
                      }}
                    >
                      Reset local workspace
                    </button>
                  </>
                ) : !w.session ? (
                  <>
                    <div className="notice">
                      {w.state.configured
                        ? 'Sign in with your work email or Google account.'
                        : 'Supabase is not configured yet. Account data and campaigns stay unavailable until setup is complete.'}
                    </div>
                    <form
                      className="field"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          if (!w.client)
                            throw new Error(
                              'Configure Supabase before signing in.',
                            );
                          const { error } = await w.client.auth.signInWithOtp({
                            email,
                            options: { emailRedirectTo: location.origin },
                          });
                          if (error) throw error;
                        }, 'Check your email for a secure sign-in link.');
                      }}
                    >
                      <label htmlFor="signin-email">Work email</label>
                      <input
                        id="signin-email"
                        type="email"
                        value={email}
                        required
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@yourbrand.com"
                      />
                      <button disabled={!w.client} className="primary-btn">
                        Email a sign-in link
                      </button>
                    </form>
                    <button
                      disabled={!w.client}
                      className="secondary-btn"
                      onClick={() =>
                        void run(async () => {
                          const { error } =
                            await w.client!.auth.signInWithOAuth({
                              provider: 'google',
                              options: { redirectTo: location.origin },
                            });
                          if (error) throw error;
                        })
                      }
                    >
                      Continue with Google <ExternalLink size={15} />
                    </button>
                  </>
                ) : (
                  <>
                    <p className="small muted">
                      Signed in as {w.session.user.email}
                    </p>
                    {!w.state.workspace ? (
                      <>
                        <form
                          className="field"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void run(
                              () => w.mutate('workspace', { name }),
                              'Workspace created.',
                            );
                          }}
                        >
                          <label>
                            Workspace name
                            <input
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              required
                              minLength={2}
                            />
                          </label>
                          <button className="primary-btn">
                            Create workspace
                          </button>
                        </form>
                        <button
                          className="secondary-btn"
                          onClick={() =>
                            void run(
                              () => w.mutate('workspace', { accept: true }),
                              'Invitations accepted.',
                            )
                          }
                        >
                          Accept workspace invitations
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="row">
                          <ShieldCheck size={20} />
                          <h3>{w.state.workspace.name}</h3>
                          <span className="pill">{w.state.workspace.role}</span>
                        </div>
                        {w.state.workspace.role === 'owner' && (
                          <form
                            className="field"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void run(
                                () =>
                                  w.mutate('settings', {
                                    name: w.state.workspace!.name,
                                    monthlyLimit: Number(limit),
                                  }),
                                'Spending limit saved.',
                              );
                            }}
                          >
                            <label>
                              Monthly automation limit (USD)
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder={String(
                                  w.state.workspace.monthly_limit,
                                )}
                                value={limit}
                                required
                                onChange={(e) => setLimit(e.target.value)}
                              />
                            </label>
                            <p className="muted small">
                              Per-campaign limits apply separately. Provider
                              subscriptions are billed by the provider; costs
                              shown here use configured conservative estimates.
                            </p>
                            <button className="secondary-btn" disabled={w.busy}>
                              Save spending limit
                            </button>
                          </form>
                        )}
                        <form
                          className="field"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void run(async () => {
                              const b = await w.mutate<{ id: string }>(
                                'brands',
                                {
                                  url: newUrl,
                                },
                              );
                              w.setBrandId(b.id);
                              setNewUrl('');
                            }, 'Brand added. You can now analyze its website.');
                          }}
                        >
                          <label>
                            Add another brand
                            <input
                              type="url"
                              required
                              placeholder="https://yourbrand.com"
                              value={newUrl}
                              onChange={(e) => setNewUrl(e.target.value)}
                            />
                          </label>
                          <button className="secondary-btn" disabled={w.busy}>
                            Add brand
                          </button>
                        </form>
                      </>
                    )}
                    <button
                      className="secondary-btn"
                      onClick={() =>
                        void run(async () => {
                          const result = await w.client?.auth.signOut();
                          if (result?.error) throw result.error;
                          location.reload();
                        })
                      }
                    >
                      Sign out
                    </button>
                  </>
                )}
              </div>
            </TabsContent>
            <TabsContent value="governance">
              <GovernancePanel />
            </TabsContent>
            <TabsContent value="connections">
              <div className="spaced">
                <p className="muted small">
                  A configured service has credentials available. A connected
                  social account has completed authorization; platform approval
                  requirements still apply.
                </p>
                {w.state.services.map((s) => (
                  <div className="integration-row" key={s.name}>
                    <div>
                      <h3>{s.name}</h3>
                      <p className="muted small">{s.detail}</p>
                    </div>
                    <span className={`pill ${s.ready ? 'green' : 'amber'}`}>
                      {s.ready ? (
                        <CheckCircle2 size={12} />
                      ) : (
                        <Plug size={12} />
                      )}{' '}
                      {s.ready ? 'Configured' : 'Setup needed'}
                    </span>
                  </div>
                ))}
                <h3 className="spaced">
                  Social accounts · {w.brand?.name ?? 'Select a brand'}
                </h3>
                {platforms.map((p) => (
                  <div className="integration-row" key={p}>
                    <div>
                      <h3 className="capitalize">{p}</h3>
                      {connections
                        .filter((c) => c.payload.platform === p)
                        .map((c) => (
                          <div key={c.id}>
                            <p className="small muted">
                              {c.payload.name} · {c.payload.status}
                            </p>
                            {['reddit', 'linkedin'].includes(p) && (
                              <form
                                className="row spaced"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const f = new FormData(e.currentTarget);
                                  void run(
                                    () =>
                                      w.mutate('connection', {
                                        id: c.id,
                                        destination: f.get('destination'),
                                      }),
                                    'Destination saved.',
                                  );
                                }}
                              >
                                <input
                                  className="text-input"
                                  name="destination"
                                  aria-label={`${p} destination`}
                                  placeholder={
                                    p === 'reddit'
                                      ? 'Subreddit without r/'
                                      : 'urn:li:organization:...'
                                  }
                                  defaultValue={c.payload.destination}
                                />
                                <button className="secondary-btn">Save</button>
                              </form>
                            )}
                            <ConfirmAction
                              key={`${w.workspaceId}:${c.id}:disconnect`}
                              label="Disconnect"
                              className="text-link small"
                              title={`Disconnect ${c.payload.name}?`}
                              description="This removes the saved credentials for this account. Published posts remain live, and uploads already dispatched may still finish. Reconnect the account before scheduling new publications."
                              confirmLabel="Disconnect account"
                              disabled={w.busy || saving}
                              onConfirm={async () => {
                                await w.mutate('connection', {
                                  id: c.id,
                                  disconnect: true,
                                });
                                setMessage('Account disconnected.');
                              }}
                            />
                          </div>
                        ))}
                    </div>
                    <button
                      className="secondary-btn"
                      disabled={
                        !w.brandId ||
                        w.state.workspace?.role !== 'owner' ||
                        w.busy
                      }
                      onClick={() =>
                        void run(async () => {
                          const r = await w.mutate<{ url: string }>('connect', {
                            brandId: w.brandId,
                            platform: p,
                          });
                          location.assign(r.url);
                        })
                      }
                    >
                      Connect
                    </button>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="team">
              <div className="stack spaced">
                <p className="muted small">
                  Owners manage connections and budgets. Editors create
                  campaigns. Approvers approve and schedule. Viewers can inspect
                  results.
                </p>
                <form
                  className="field"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      () => w.mutate('team', { email: inviteEmail, role }),
                      'Invitation saved. Ask your teammate to sign in and select Accept workspace invitations.',
                    );
                  }}
                >
                  <label>
                    Teammate email
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </label>
                  <Select
                    value={role}
                    onValueChange={(v) => setRole(v ?? 'editor')}
                  >
                    <SelectTrigger className="w-full" aria-label="Team role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['editor', 'approver', 'viewer'].map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    className="primary-btn"
                    disabled={w.state.workspace?.role !== 'owner' || w.busy}
                  >
                    Save invitation
                  </button>
                </form>
              </div>
            </TabsContent>
          </Tabs>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
