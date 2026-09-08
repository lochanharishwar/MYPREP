'use client';
import { useState } from 'react';
import { useWorkspace } from './workspace-provider';
import { Table, TableBody, TableCell, TableRow } from './ui/table';
type Member = {
  user_id: string;
  role: string;
  brand_access: string;
  customer_access: boolean;
  export_access: boolean;
  approval_stages: string[];
  brands: string[];
};
type Governance = {
  controls: {
    id: string;
    kind: string;
    payload: {
      idea?: string;
      frozen?: boolean;
      approvedAt?: string;
      revokedAt?: string;
    };
  }[];
  operations: {
    pendingOutbox: number;
    deadLetters: number;
    oldestPendingAt: string | null;
    verifyingPosts: number;
    expiredAccounts: number;
    failedMediaJobs: number;
    activeMediaJobs: number;
    lastMetricAt: string | null;
  };
  members: Member[];
  invitations: {
    id: string;
    email: string;
    role: string;
    expires_at: string;
  }[];
  audit: {
    id: string;
    action: string;
    created_at: string;
    actor_id?: string;
    resource_id?: string;
  }[];
  outbox: {
    id: string;
    name: string;
    attempts: number;
    created_at: string;
    error?: string;
    dead_at?: string;
  }[];
};
function MemberEditor({
  member,
  onSaved,
}: {
  member: Member;
  onSaved: () => void;
}) {
  const w = useWorkspace();
  const [role, setRole] = useState(member.role),
    [access, setAccess] = useState(member.brand_access),
    [brands, setBrands] = useState<string[]>(member.brands),
    [customer, setCustomer] = useState(member.customer_access),
    [exports, setExports] = useState(member.export_access),
    [stages, setStages] = useState(member.approval_stages),
    [confirm, setConfirm] = useState('');
  const save = (command: string) =>
    void w
      .mutate('governance', {
        action: 'member',
        userId: member.user_id,
        command,
        role,
        brands: access === 'all' ? null : brands,
        customerAccess: customer,
        exportAccess: exports,
        stages,
      })
      .then(() => {
        setConfirm('');
        onSaved();
      })
      .catch(() => {});
  return (
    <article className="data-card">
      <p className="small mono">Member {member.user_id}</p>
      <div className="field spaced">
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {['owner', 'editor', 'approver', 'viewer'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Brand access
          <select value={access} onChange={(e) => setAccess(e.target.value)}>
            <option value="all">All workspace brands</option>
            <option value="assigned">Selected brands</option>
          </select>
        </label>
        {access === 'assigned' &&
          w.state.brands.map((b) => (
            <label key={b.id}>
              <input
                type="checkbox"
                checked={brands.includes(b.id)}
                onChange={(e) =>
                  setBrands((v) =>
                    e.target.checked
                      ? [...v, b.id]
                      : v.filter((id) => id !== b.id),
                  )
                }
              />
              {b.name}
            </label>
          ))}
        <label>
          <input
            type="checkbox"
            checked={customer}
            onChange={(e) => setCustomer(e.target.checked)}
          />
          Customer-data access
        </label>
        <label>
          <input
            type="checkbox"
            checked={exports}
            onChange={(e) => setExports(e.target.checked)}
          />
          Customer export permission
        </label>
        <div className="tabs-row">
          {['creative', 'brand', 'legal'].map((stage) => (
            <label key={stage}>
              <input
                type="checkbox"
                checked={stages.includes(stage)}
                onChange={(e) =>
                  setStages((v) =>
                    e.target.checked
                      ? [...v, stage]
                      : v.filter((s) => s !== stage),
                  )
                }
              />
              {stage} review
            </label>
          ))}
        </div>
        <button
          className="secondary-btn"
          disabled={w.busy}
          onClick={() => save('update')}
        >
          Save member permissions
        </button>
      </div>
      <div className="tabs-row spaced">
        <button className="text-link" onClick={() => setConfirm('remove')}>
          Remove member…
        </button>
        <button className="text-link" onClick={() => setConfirm('transfer')}>
          Transfer ownership…
        </button>
      </div>
      {confirm && (
        <div className="notice spaced">
          <p>
            {confirm === 'remove'
              ? 'Remove this member’s workspace access?'
              : 'Make this member an owner and change your role to Editor?'}
          </p>
          <button
            className="secondary-btn"
            disabled={w.busy}
            onClick={() => save(confirm)}
          >
            Confirm {confirm}
          </button>
          <button className="text-link" onClick={() => setConfirm('')}>
            Cancel
          </button>
        </div>
      )}
    </article>
  );
}
export function GovernancePanel() {
  const w = useWorkspace();
  const [data, setData] = useState<Governance | null>(null),
    [offset, setOffset] = useState(0);
  const policy = w.state.workspace?.approval_policy;
  const [paused, setPaused] = useState(
      w.state.workspace?.publishing_paused ?? false,
    ),
    [mfa, setMfa] = useState(w.state.workspace?.require_mfa ?? false),
    [hours, setHours] = useState(w.state.workspace?.session_hours ?? 24),
    [expiry, setExpiry] = useState(policy?.expiresHours ?? 168),
    [separation, setSeparation] = useState(policy?.separationOfDuties ?? false),
    [stages, setStages] = useState(policy?.stages ?? ['brand']);
  const load = (page = 0) =>
    void w
      .read<Governance>('/api/governance?offset=' + page)
      .then((d) => {
        setData(d);
        setOffset(page);
      })
      .catch((e) => w.setNotice((e as Error).message));
  if (w.state.workspace?.role !== 'owner')
    return (
      <p className="notice">
        Governance and operations are available to workspace owners.
      </p>
    );
  return (
    <div className="stack spaced">
      <h3>Approval and session policy</h3>
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={paused}
            onChange={(e) => setPaused(e.target.checked)}
          />
          Emergency publishing stop
        </label>
        <label>
          <input
            type="checkbox"
            checked={mfa}
            onChange={(e) => setMfa(e.target.checked)}
          />
          Require authenticator MFA
        </label>
        <label>
          Session lifetime (hours)
          <input
            type="number"
            min="1"
            max="720"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </label>
        <label>
          Approval lifetime (hours)
          <input
            type="number"
            min="1"
            max="720"
            value={expiry}
            onChange={(e) => setExpiry(Number(e.target.value))}
          />
        </label>
        <div className="tabs-row">
          {['creative', 'brand', 'legal'].map((stage) => (
            <label key={stage}>
              <input
                type="checkbox"
                checked={stages.includes(stage)}
                onChange={(e) =>
                  setStages((v) =>
                    e.target.checked
                      ? [...v, stage]
                      : v.filter((s) => s !== stage),
                  )
                }
              />
              {stage} approval
            </label>
          ))}
        </div>
        <label>
          <input
            type="checkbox"
            checked={separation}
            onChange={(e) => setSeparation(e.target.checked)}
          />
          Require different people for creation and approval stages
        </label>
        <button
          className="primary-btn"
          disabled={w.busy || !stages.length}
          onClick={() =>
            void w
              .mutate('governance', {
                action: 'policy',
                publishingPaused: paused,
                requireMfa: mfa,
                sessionHours: hours,
                stages,
                separationOfDuties: separation,
                expiresHours: expiry,
              })
              .then(() => w.setNotice('Workspace policy saved.'))
              .catch(() => {})
          }
        >
          Save governance policy
        </button>
      </div>
      <button className="secondary-btn" onClick={() => load()}>
        Load members, audit and operations
      </button>
      {data && (
        <>
          <h3>Members</h3>
          {data.members.map((m) => (
            <MemberEditor key={m.user_id} member={m} onSaved={() => load()} />
          ))}
          <h3>Pending invitations</h3>
          {data.invitations.map((i) => (
            <div className="data-card" key={i.id}>
              <p>
                {i.email} · {i.role}
              </p>
              <p className="source">
                Expires {new Date(i.expires_at).toLocaleString()}
              </p>
              <button
                className="text-link"
                disabled={w.busy}
                onClick={() =>
                  void w
                    .mutate('governance', {
                      action: 'revoke-invitation',
                      id: i.id,
                    })
                    .then(() => load())
                    .catch(() => {})
                }
              >
                Revoke invitation
              </button>
            </div>
          ))}
          <h3>Operational queue</h3>
          <details>
            <summary>Campaign freezes and approval revocations</summary>
            <p className="muted small">
              Recent 100 control records. Freezing stops future paid steps and
              publication; dispatched provider requests may already be in
              flight.
            </p>
            {data.controls.map((c) => (
              <div className="data-card" key={c.id}>
                {c.kind === 'campaign' ? (
                  <>
                    <p>{c.payload.idea}</p>
                    <button
                      className="secondary-btn"
                      disabled={w.busy}
                      onClick={() =>
                        void w
                          .mutate('governance', {
                            action: 'freeze',
                            id: c.id,
                            frozen: !c.payload.frozen,
                          })
                          .then(() => load())
                          .catch(() => {})
                      }
                    >
                      {c.payload.frozen ? 'Resume campaign' : 'Freeze campaign'}
                    </button>
                  </>
                ) : (
                  <>
                    <p>
                      Approved{' '}
                      {c.payload.approvedAt
                        ? new Date(c.payload.approvedAt).toLocaleString()
                        : 'version'}
                    </p>
                    <button
                      className="secondary-btn"
                      disabled={w.busy || !!c.payload.revokedAt}
                      onClick={() =>
                        void w
                          .mutate('governance', {
                            action: 'revoke-approval',
                            id: c.id,
                          })
                          .then(() => load())
                          .catch(() => {})
                      }
                    >
                      {c.payload.revokedAt
                        ? 'Revoked'
                        : 'Revoke approval and cancel unsent posts'}
                    </button>
                  </>
                )}
              </div>
            ))}
          </details>
          <div className="data-card">
            <p>
              {data.operations.pendingOutbox} pending deliveries ·{' '}
              {data.operations.deadLetters} dead letters ·{' '}
              {data.operations.verifyingPosts} uncertain posts
            </p>
            <p>
              {data.operations.activeMediaJobs} active media jobs ·{' '}
              {data.operations.failedMediaJobs} failed media jobs ·{' '}
              {data.operations.expiredAccounts} expired accounts
            </p>
            <p className="muted small">
              Oldest pending:{' '}
              {data.operations.oldestPendingAt
                ? new Date(data.operations.oldestPendingAt).toLocaleString()
                : 'None'}{' '}
              · Latest metric:{' '}
              {data.operations.lastMetricAt
                ? new Date(data.operations.lastMetricAt).toLocaleString()
                : 'Awaiting platform data'}
            </p>
          </div>
          {data.outbox.length ? (
            data.outbox.map((j) => (
              <div className="data-card" key={j.id}>
                <strong>
                  {j.name} ·{' '}
                  {j.dead_at ? 'Needs operator attention' : 'Pending delivery'}
                </strong>
                <p className="muted small">
                  {j.attempts} delivery attempts · queued{' '}
                  {new Date(j.created_at).toLocaleString()}
                </p>
                <p>{j.error}</p>
                {j.dead_at && (
                  <button
                    className="secondary-btn"
                    onClick={() =>
                      void w
                        .mutate('governance', { action: 'retry-job', id: j.id })
                        .then(() => load())
                        .catch(() => {})
                    }
                  >
                    Retry delivery
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="muted">No pending queue items in this workspace.</p>
          )}
          <h3>Audit history</h3>
          <Table>
            <TableBody>
              {data.audit.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    {new Date(a.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{a.action}</TableCell>
                  <TableCell>{a.actor_id ?? 'System job'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="tabs-row">
            <button
              className="secondary-btn"
              disabled={offset === 0}
              onClick={() => load(Math.max(0, offset - 50))}
            >
              Newer
            </button>
            <button
              className="secondary-btn"
              disabled={data.audit.length < 50}
              onClick={() => load(offset + 50)}
            >
              Older
            </button>
          </div>
        </>
      )}
    </div>
  );
}
