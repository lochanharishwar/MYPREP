'use client';
import { useEffect, useMemo, useState } from 'react';
import { Clock3, ArrowUpRight } from 'lucide-react';
import { postingSuggestions } from '@/lib/timing';
import type { Entity, MetricObservation, ScheduledPost } from '@/lib/contracts';
import { useWorkspace } from './workspace-provider';
import { SectionHeading } from './section-heading';

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
      <div className="section-title">
        <div>
          <SectionHeading character="schedule" as="h3">
            Find your next posting window
          </SectionHeading>
          <p className="small muted">Next seven days · {timezone}</p>
        </div>
        <span className={`pill ${history ? 'green' : 'amber'}`}>
          {history ? 'Account history' : 'Experiment plan'}
        </span>
      </div>
      <p className="small muted">
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
          <article className="posting-day" key={day.date}>
            <div>
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
            </div>
            <div className="posting-slots">
              {day.slots.map((slot, i) => (
                <button
                  type="button"
                  className={`posting-slot ${selectedTime === slot.localTime ? 'selected' : ''}`}
                  aria-pressed={selectedTime === slot.localTime}
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
                  <Clock3 size={13} />
                  {slot.localTime.slice(11)}
                  {i === 0 && !day.experimental && (
                    <span className="small">Top observed</span>
                  )}
                </button>
              ))}
              {!day.slots.length && (
                <span className="small muted">Today’s windows have passed</span>
              )}
            </div>
            <span className="small muted">
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
        <summary>How to use these suggestions</summary>
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
