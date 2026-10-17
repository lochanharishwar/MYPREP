'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Clock3,
  ArrowUpRight,
  Check,
  ChevronRight,
  FlaskConical,
  Globe2,
  History,
  UsersRound,
} from 'lucide-react';
import { postingSuggestions } from '@/lib/timing';
import { socialCatalog } from '@/lib/social-catalog';
import type { Entity, MetricObservation, ScheduledPost } from '@/lib/contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useWorkspace } from './workspace-provider';
import { SectionHeading } from './section-heading';

const planningTimezones = [
  {
    value: 'Asia/Kolkata',
    label: 'Kolkata, India',
    detail: 'India Standard Time',
  },
  {
    value: 'UTC',
    label: 'Coordinated Universal Time',
    detail: 'UTC · No daylight saving',
  },
  { value: 'America/New_York', label: 'New York', detail: 'Eastern Time' },
  {
    value: 'America/Los_Angeles',
    label: 'Los Angeles',
    detail: 'Pacific Time',
  },
  { value: 'Europe/London', label: 'London', detail: 'United Kingdom' },
  { value: 'Europe/Berlin', label: 'Berlin', detail: 'Central European Time' },
  {
    value: 'Asia/Singapore',
    label: 'Singapore',
    detail: 'Singapore Standard Time',
  },
  {
    value: 'Australia/Sydney',
    label: 'Sydney',
    detail: 'Australian Eastern Time',
  },
];

export function PlanningControls({
  accounts,
  accountId,
  timezone,
  onAccountChange,
  onTimezoneChange,
}: {
  accounts: Entity<{ name: string; platform: string; status: string }>[];
  accountId: string;
  timezone: string;
  onAccountChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
}) {
  const account = accounts.find((item) => item.id === accountId);
  const zone = planningTimezones.find((item) => item.value === timezone);
  const platformName = (platform: string) =>
    socialCatalog[platform as keyof typeof socialCatalog]?.name ?? platform;
  return (
    <div className="planner-controls">
      <div className="planner-control">
        <span className="planner-control-label">Account</span>
        <Select
          value={accountId}
          onValueChange={(value) => onAccountChange(value ?? '')}
        >
          <SelectTrigger
            aria-label="Planning account"
            className="planner-select-trigger"
          >
            <span className="planner-control-icon">
              <UsersRound size={19} aria-hidden="true" />
            </span>
            <SelectValue>
              <span className="planner-select-copy">
                <strong>{account?.payload.name ?? 'Choose an account'}</strong>
                <span>
                  {account
                    ? platformName(account.payload.platform)
                    : 'Explore times for your audience'}
                </span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            className="planner-select-menu"
            alignItemWithTrigger={false}
          >
            <SelectItem value="">
              <span className="planner-option-copy">
                <strong>General experiment plan</strong>
                <span>Explore without an account</span>
              </span>
            </SelectItem>
            {accounts.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                <span className="planner-option-copy">
                  <strong>{item.payload.name}</strong>
                  <span>
                    {platformName(item.payload.platform)} ·{' '}
                    {item.payload.status === 'connected'
                      ? 'Connected'
                      : 'Reconnect to publish'}
                  </span>
                </span>
              </SelectItem>
            ))}
            {!accounts.length && (
              <p className="planner-menu-note">
                Connect a channel above to use its posting history.
              </p>
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="planner-control">
        <span className="planner-control-label">Timezone</span>
        <Select
          value={timezone}
          onValueChange={(value) => {
            if (value) onTimezoneChange(value);
          }}
        >
          <SelectTrigger
            aria-label="Planning timezone"
            className="planner-select-trigger"
          >
            <span className="planner-control-icon">
              <Globe2 size={19} aria-hidden="true" />
            </span>
            <SelectValue>
              <span className="planner-select-copy">
                <strong>{zone?.label ?? timezone}</strong>
                <span>{zone?.detail ?? timezone}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            className="planner-select-menu"
            alignItemWithTrigger={false}
          >
            {planningTimezones.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                <span className="planner-option-copy">
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function PostingPlanner({
  accountId,
  timezone,
  onChoose,
  selectedTime,
}: {
  accountId: string;
  timezone: string;
  onChoose: (time: string) => void;
  selectedTime?: string;
}) {
  const w = useWorkspace();
  const [now, setNow] = useState(() => Date.now());
  const [historyData, setHistoryData] = useState<{
    key: string;
    posts: Entity<ScheduledPost>[];
    observations: Entity<MetricObservation>[];
    partial: boolean;
    totalPosts: number;
  } | null>(null);
  const [historyError, setHistoryError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const { read, brandId, workspaceId, localMode, session } = w;
  const historyKey = `${workspaceId}:${session?.user.id ?? ''}:${brandId}:${accountId}:${Math.floor(now / 300000)}`;
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 60000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useEffect(() => {
    if (localMode || !accountId || !brandId || !session) return;
    const controller = new AbortController();
    let active = true;
    const query = new URLSearchParams({ brandId, accountId });
    void read<{
      posts: Entity<ScheduledPost>[];
      observations: Entity<MetricObservation>[];
      partial: boolean;
      totalPosts: number;
    }>(`/api/timing?${query}`, { signal: controller.signal })
      .then((value) => {
        if (active) setHistoryData({ key: historyKey, ...value });
      })
      .catch((error) => {
        if (active)
          setHistoryError({
            key: historyKey,
            message:
              error instanceof Error
                ? error.message
                : 'Account history could not be loaded.',
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [read, localMode, accountId, brandId, session, historyKey]);
  const remote = historyData?.key === historyKey ? historyData : null;
  const failure = historyError?.key === historyKey ? historyError.message : '';
  const loadingHistory =
    !localMode && !!accountId && !!session && !remote && !failure;
  const posts = localMode
      ? w.records<ScheduledPost>('schedule')
      : (remote?.posts ?? []),
    observations = localMode
      ? w.records<MetricObservation>('metrics')
      : (remote?.observations ?? []);
  const result = useMemo(() => {
    try {
      return {
        days: postingSuggestions(posts, observations, accountId, timezone, now),
        error: '',
      };
    } catch {
      return {
        days: [],
        error: 'Choose a valid timezone, such as Asia/Kolkata.',
      };
    }
  }, [posts, observations, accountId, timezone, now]);
  const history = result.days.some((d) => !d.experimental);
  return (
    <section className="posting-planner" aria-label="Posting time suggestions">
      <div className="section-title posting-planner-heading">
        <div>
          <SectionHeading character="schedule" as="h3">
            Find your next posting window
          </SectionHeading>
          <p className="posting-planner-subtitle">
            <Clock3 size={13} aria-hidden="true" /> Next seven days ·{' '}
            {planningTimezones.find((zone) => zone.value === timezone)?.label ??
              timezone}
          </p>
        </div>
        <span
          className={`pill posting-plan-basis ${history ? 'green' : 'amber'}`}
        >
          {history ? (
            <History size={13} aria-hidden="true" />
          ) : (
            <FlaskConical size={13} aria-hidden="true" />
          )}
          {loadingHistory
            ? 'Checking history'
            : history
              ? 'Account history'
              : 'Experiment plan'}
        </span>
      </div>
      <p className="small muted posting-plan-explanation">
        {history
          ? 'Ranked by median performance 24–48 hours after publication, using this account’s last 90 days. Each hour needs three posts on separate dates.'
          : 'No reliable timing pattern yet. Try morning, lunchtime and evening, then compare the results. These are planning choices, not platform-endorsed best times.'}
      </p>
      {result.error && (
        <p role="alert" className="notice">
          {result.error}
        </p>
      )}
      {loadingHistory && (
        <p className="small muted" role="status">
          Loading this account’s published-post history…
        </p>
      )}
      {failure && (
        <p className="notice small" role="alert">
          {failure} These times remain experimental until history is available.
        </p>
      )}
      {remote?.partial && (
        <p className="notice small">
          Partial history: a bounded sample from {remote.totalPosts} published
          posts is available. Suggestions may change as more data is analyzed.
        </p>
      )}
      <div className="posting-days">
        {result.days.map((day) => (
          <article
            className={`posting-day ${day.slots.some((slot) => selectedTime === slot.localTime) ? 'has-selection' : ''}`}
            key={day.date}
          >
            <div className="posting-day-heading">
              <strong>
                {new Intl.DateTimeFormat('en', {
                  weekday: 'short',
                  timeZone: 'UTC',
                }).format(new Date(day.date + 'T12:00:00Z'))}
              </strong>
              <span className="small muted">
                {new Intl.DateTimeFormat('en', {
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(day.date + 'T12:00:00Z'))}
              </span>
              <span className="posting-day-marker" aria-hidden="true" />
            </div>
            <div className="posting-slots">
              {day.slots.map((slot, i) => (
                <button
                  type="button"
                  className={`posting-slot ${selectedTime === slot.localTime ? 'selected' : ''}`}
                  aria-pressed={selectedTime === slot.localTime}
                  aria-label={`${new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(day.date + 'T12:00:00Z'))}, ${slot.localTime.slice(11)}, ${timezone}${i === 0 && !day.experimental ? ', top observed window' : ''}`}
                  key={slot.utc}
                  onClick={() => {
                    if (Date.parse(slot.utc) <= Date.now() + 600000) {
                      setNow(Date.now());
                      w.setNotice(
                        'That window is too close or has passed. Choose a later time.',
                      );
                      return;
                    }
                    onChoose(slot.localTime);
                  }}
                >
                  {selectedTime === slot.localTime ? (
                    <Check size={13} aria-hidden="true" />
                  ) : (
                    <Clock3 size={13} aria-hidden="true" />
                  )}
                  <span>{slot.localTime.slice(11)}</span>
                  {i === 0 && !day.experimental && (
                    <span className="small">Top observed</span>
                  )}
                </button>
              ))}
              {!day.slots.length && (
                <span className="small muted">Today’s windows have passed</span>
              )}
            </div>
            <span className="posting-day-basis">
              {day.basis === 'weekday'
                ? 'Same weekday'
                : day.basis === 'account'
                  ? 'Across all days'
                  : 'Test window'}
            </span>
            {!day.experimental && (
              <details className="timing-evidence">
                <summary>{day.sampleCount} posts · why these times?</summary>
                <p className="small muted">
                  Compared by {day.metric}. Content quality and format can also
                  explain differences. This is observational evidence.
                </p>
                {day.slots.map(
                  (s) =>
                    s.evidence && (
                      <p className="small" key={s.utc}>
                        {s.localTime.slice(11)}: median{' '}
                        {s.evidence.median.toLocaleString()} {day.metric},{' '}
                        {s.evidence.count} posts.
                      </p>
                    ),
                )}
                <p className="small muted">
                  Latest observation:{' '}
                  {day.latestObservedAt
                    ? new Date(day.latestObservedAt).toLocaleDateString()
                    : 'Unavailable'}
                  .
                </p>
              </details>
            )}
          </article>
        ))}
      </div>
      <details className="timing-method">
        <summary>
          <span>How these windows are chosen</span>
          <ChevronRight size={15} aria-hidden="true" />
        </summary>
        <p className="small muted">
          Click a time to fill the schedule. Suggestions identify hourly
          windows; minute-level precision is not a prediction. Use the same
          account, comparable content and consistent measurement to test the
          plan. No time guarantees popularity.
        </p>
        <p className="small muted">
          YouTube says upload time does not determine long-term performance. Its
          Audience report can help you plan live streams and Premieres.
        </p>
        <a
          href="https://support.google.com/youtube/answer/16533387?hl=en"
          target="_blank"
          rel="noreferrer"
          className="text-link small"
        >
          YouTube’s recommendation guidance <ArrowUpRight size={12} />
        </a>
        <a
          href="https://support.google.com/youtube/answer/9314416?hl=en"
          target="_blank"
          rel="noreferrer"
          className="text-link small"
        >
          Find your audience’s active hours <ArrowUpRight size={12} />
        </a>
      </details>
    </section>
  );
}
