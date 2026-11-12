'use client';
// Evidence and signed private storage URLs must bypass image optimization.
/* oxlint-disable next/no-img-element */
// The installed Recharts 3 release supports Cell for per-series colors.
/* oxlint-disable typescript/no-deprecated */
import { useState } from 'react';
import { PublicationResolution } from './publication-resolution';
import { CalendarDays } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useWorkspace } from './workspace-provider';
import { SectionHeading } from './section-heading';
import type { ContentVersion, Entity, ScheduledPost, Approval } from '@/lib/contracts';
import { Empty } from './empty-state';
import { ContentMedia } from './content-media';
import { SocialConnections } from './social-connections';
import { PlanningControls, PostingPlanner } from './posting-planner';
import { Dropdown } from './workspace-shared';

export function ScheduleView() {
  const w = useWorkspace();
  const posts = w.records<ScheduledPost>('schedule'),
    approvals = w.records<Approval>('approval'),
    contents = w.records<ContentVersion>('content');
  const [modal, setModal] = useState(false),
    [editing, setEditing] = useState<Entity<ScheduledPost> | null>(null),
    [approval, setApproval] = useState(''),
    [localTime, setLocalTime] = useState(''),
    [timezone, setTimezone] = useState('Asia/Kolkata');
  const [month, setMonth] = useState(new Date());
  const planningScope = `${w.workspaceId}:${w.session?.user.id ?? ''}:${w.brandId}`;
  const [planning, setPlanning] = useState({
    scope: planningScope,
    accountId: '',
    time: '',
    timezone: 'Asia/Kolkata',
  });
  const accounts = w.records<{
    name: string;
    platform: string;
    status: string;
  }>('connection');
  const planningAccount =
    planning.scope === planningScope &&
    accounts.some((account) => account.id === planning.accountId)
      ? planning.accountId
      : '';
  const plannedTime =
    planning.scope === planningScope && planning.accountId === planningAccount
      ? planning.time
      : '';
  const planningTimezone =
    planning.scope === planningScope ? planning.timezone : 'Asia/Kolkata';
  const unscheduled = approvals.filter(
    (a) =>
      !posts.some(
        (p) =>
          p.payload.approvalId === a.id &&
          !['cancelled', 'failed', 'missed'].includes(p.payload.status),
      ),
  );
  const destination =
    editing?.payload.accountId ??
    approvals.find((a) => a.id === approval)?.payload.accountId ??
    '';
  const first = new Date(month.getFullYear(), month.getMonth(), 1),
    days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((first.getDay() + days) / 7) * 7 },
    (_, i) => i - first.getDay() + 1,
  );
  const open = (p?: Entity<ScheduledPost>) => {
    setEditing(p ?? null);
    setApproval('');
    setLocalTime(
      p
        ? new Intl.DateTimeFormat('sv-SE', {
            timeZone: p.payload.timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          })
            .format(new Date(p.payload.scheduledAt))
            .replace(' ', 'T')
        : '',
    );
    setTimezone(p?.payload.timezone ?? 'Asia/Kolkata');
    setModal(true);
  };
  return (
    <div className="stack">
      <div className="section-title">
        <div>
          <SectionHeading character="schedule">
            A good idea deserves its moment.
          </SectionHeading>
          <p className="muted small spaced">
            Approved versions, connected accounts, and a time that works for
            your audience.
          </p>
        </div>
        <button
          className="primary-btn"
          disabled={w.localMode || !unscheduled.length || w.busy}
          onClick={() => open()}
        >
          <CalendarDays size={16} /> Schedule content
        </button>
      </div>
      <SocialConnections />
      <section className="panel schedule-planning">
        <PlanningControls
          accounts={accounts}
          accountId={planningAccount}
          timezone={planningTimezone}
          onAccountChange={(accountId) =>
            setPlanning({
              scope: planningScope,
              accountId,
              time: '',
              timezone: planningTimezone,
            })
          }
          onTimezoneChange={(nextTimezone) =>
            setPlanning({
              scope: planningScope,
              accountId: planningAccount,
              time: '',
              timezone: nextTimezone,
            })
          }
        />
        <PostingPlanner
          accountId={planningAccount}
          timezone={planningTimezone}
          selectedTime={plannedTime}
          onChoose={(time) => {
            setPlanning({
              scope: planningScope,
              accountId: planningAccount,
              time,
              timezone: planningTimezone,
            });
            if (!w.localMode && unscheduled.length) {
              const suggested = unscheduled.find(
                (a) => a.payload.accountId === planningAccount,
              );
              setEditing(null);
              setApproval(suggested?.id ?? '');
              setLocalTime(time);
              setTimezone(planningTimezone);
              setModal(true);
            }
          }}
        />
        {plannedTime && (
          <output className="notice small planning-selection">
            Selected: {plannedTime.replace('T', ' ')} · {planningTimezone}.
            {w.localMode
              ? ' This is a planning selection. Activate account connections and background publishing to schedule automatically.'
              : ' Choose an approved version to save this schedule.'}
          </output>
        )}
      </section>
      <section className="panel">
        <SectionHeading character="schedule">
          Publication calendar
        </SectionHeading>
        <Tabs defaultValue="list">
          <div className="section-title">
            <TabsList>
              <TabsTrigger value="list">List view</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
            </TabsList>
            <span className="pill">
              {posts.filter((p) => p.payload.status === 'scheduled').length}{' '}
              scheduled
            </span>
          </div>
          <TabsContent value="list">
            {posts.length ? (
              <div className="card-list">
                {posts.map((p) => (
                  <article className="data-card" key={p.id}>
                    <div className="section-title">
                      <span className="pill capitalize">
                        {p.payload.platform} · {p.payload.status}
                      </span>
                      <span className="small muted">
                        {new Date(p.payload.scheduledAt).toLocaleString(
                          undefined,
                          { timeZone: p.payload.timezone },
                        )}{' '}
                        · {p.payload.timezone}
                      </span>
                    </div>
                    <p>
                      {contents.find((c) => c.id === p.payload.contentId)
                        ?.payload.caption ?? 'Approved content'}
                    </p>
                    {p.payload.url && (
                      <a
                        className="text-link small"
                        href={p.payload.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View published post
                      </a>
                    )}
                    {p.payload.error && (
                      <p className="notice">{p.payload.error}</p>
                    )}
                    {p.payload.status === 'verifying' && (
                      <PublicationResolution post={p} />
                    )}
                    {p.payload.status === 'verifying' && (
                      <button
                        className="secondary-btn spaced"
                        disabled={w.busy}
                        onClick={() =>
                          void w
                            .mutate('reconcile', { id: p.id })
                            .then(() =>
                              w.setNotice(
                                'Provider status checked. Uncertain matches remain verifying.',
                              ),
                            )
                            .catch(() => {})
                        }
                      >
                        Verify publication
                      </button>
                    )}
                    {contents.find((c) => c.id === p.payload.contentId)?.payload
                      .assetPath && (
                      <details className="spaced">
                        <summary>Preview approved media</summary>
                        <ContentMedia
                          content={contents.find(
                            (c) => c.id === p.payload.contentId,
                          )!}
                        />
                      </details>
                    )}
                    {['scheduled', 'failed', 'missed'].includes(
                      p.payload.status,
                    ) && (
                      <div className="tabs-row spaced">
                        <button
                          className="secondary-btn"
                          onClick={() => open(p)}
                        >
                          Reschedule
                        </button>
                        <button
                          className="secondary-btn"
                          disabled={w.busy}
                          onClick={() =>
                            void w
                              .mutate('change-schedule', {
                                id: p.id,
                                command: 'cancel',
                              })
                              .catch(() => {})
                          }
                        >
                          Cancel schedule
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                icon={CalendarDays}
                title="Room for your next big moment"
                description={
                  w.localMode
                    ? 'Activate the background publishing service and connect a destination before scheduling. Local drafts remain available in Content studio.'
                    : 'Approve a reviewed content version, then choose its destination, date, and time. Your schedule will stay active when you close the app.'
                }
              />
            )}
          </TabsContent>
          <TabsContent value="calendar">
            <div className="section-title spaced">
              <button
                aria-label="Previous month"
                className="secondary-btn"
                onClick={() =>
                  setMonth(new Date(month.getFullYear(), month.getMonth() - 1))
                }
              >
                ←
              </button>
              <h3>
                {month.toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                })}
              </h3>
              <button
                aria-label="Next month"
                className="secondary-btn"
                onClick={() =>
                  setMonth(new Date(month.getFullYear(), month.getMonth() + 1))
                }
              >
                →
              </button>
            </div>
            <div className="calendar-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="muted small">
                  {d}
                </div>
              ))}
              {cells.map((d, i) => (
                <div key={i} className="calendar-cell">
                  {d > 0 && d <= days && (
                    <>
                      <span>{d}</span>
                      {posts
                        .filter((p) => {
                          const dt = new Date(p.payload.scheduledAt);
                          return (
                            dt.getFullYear() === month.getFullYear() &&
                            dt.getMonth() === month.getMonth() &&
                            dt.getDate() === d
                          );
                        })
                        .map((p) => (
                          <button key={p.id} onClick={() => open(p)}>
                            {p.payload.platform} · {p.payload.status}
                          </button>
                        ))}
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="muted small spaced">
              Calendar dates use your browser timezone. Each post retains its
              scheduling timezone.
            </p>
          </TabsContent>
        </Tabs>
      </section>
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="dialog-scroll sm:max-w-3xl">
          <DialogTitle>
            {editing ? 'Reschedule post' : 'Give your content a moment'}
          </DialogTitle>
          <DialogDescription>
            Select an approved version and a future date. Times remain attached
            to the chosen timezone.
          </DialogDescription>
          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              void w
                .mutate(
                  editing ? 'change-schedule' : 'schedule',
                  editing
                    ? {
                        id: editing.id,
                        command: 'reschedule',
                        localTime,
                        timezone,
                      }
                    : { approvalId: approval, localTime, timezone },
                )
                .then(() => setModal(false))
                .catch(() => {});
            }}
          >
            {!editing && (
              <Dropdown
                value={approval}
                onChange={setApproval}
                label="Approved content"
                options={unscheduled.map((a) => ({
                  value: a.id,
                  label: `${a.payload.platform}: ${contents.find((c) => c.id === a.payload.contentId)?.payload.caption.slice(0, 60) ?? 'Approved version'}`,
                }))}
              />
            )}
            <label>
              Date and time
              <input
                type="datetime-local"
                required
                value={localTime}
                onChange={(e) => setLocalTime(e.target.value)}
              />
            </label>
            <label>
              Timezone
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                required
                placeholder="Asia/Kolkata"
              />
            </label>
            <PostingPlanner
              accountId={destination}
              timezone={timezone}
              selectedTime={localTime}
              onChoose={setLocalTime}
            />
            <button
              className="primary-btn"
              disabled={w.busy || (!editing && !approval)}
            >
              Save schedule
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
