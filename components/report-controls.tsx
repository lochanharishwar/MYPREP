'use client';
import { useEffect, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  RefreshCw,
} from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  formatReportPeriod,
  presetReportPeriod,
  reportDate,
  reportPeriodFromDays,
  shiftReportDay,
  type ReportPeriod,
} from '@/lib/report-period';
import { useWorkspace } from './workspace-provider';

export function useReport<T>(
  type: 'attribution' | 'metrics',
  filters: Record<string, string> = {},
) {
  const { read, brandId, workspaceId, session } = useWorkspace();
  const [period, setPeriod] = useState(() => presetReportPeriod(30));
  const [data, setData] = useState<{ key: string; value: T } | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const query = new URLSearchParams({
    type,
    brandId,
    ...period,
    ...filters,
  }).toString();
  const resultKey = `${workspaceId}:${session?.user.id ?? ''}:${query}:${revision}`;
  useEffect(() => {
    let active = true;
    if (!brandId || !session) return;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError('');
    });
    void read<T>('/api/reports?' + query)
      .then((r) => {
        if (active) setData({ key: resultKey, value: r });
      })
      .catch((e) => {
        if (active) {
          setError((e as Error).message);
          setData(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [read, query, brandId, session, revision, resultKey]);
  return {
    data: brandId && session && data?.key === resultKey ? data.value : null,
    ...period,
    setPeriod,
    error,
    loading,
    refresh: () => setRevision((v) => v + 1),
  };
}

function calendarRange(period: ReportPeriod): DateRange {
  return {
    from: reportDate(period.start),
    to: reportDate(shiftReportDay(period.end, -1)),
  };
}

export function ReportControls({
  report,
}: {
  report: ReportPeriod & {
    setPeriod: (period: ReportPeriod) => void;
    error: string;
    loading: boolean;
    refresh: () => void;
  };
}) {
  const { localMode } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(() =>
    calendarRange(report),
  );
  const [month, setMonth] = useState(() => reportDate(report.start));
  const [selectionError, setSelectionError] = useState('');
  const presets = [7, 30, 90] as const;
  const activePreset = presets.find((days) => {
    const period = presetReportPeriod(days);
    return period.start === report.start && period.end === report.end;
  });
  const draftPeriod = (() => {
    if (!draft?.from || !draft?.to) return null;
    try {
      return reportPeriodFromDays(
        draft.from.toISOString().slice(0, 10),
        draft.to.toISOString().slice(0, 10),
      );
    } catch {
      return null;
    }
  })();
  return (
    <div className="report-controls" aria-label="Report period">
      <div className="report-controls-main">
        <div className="report-period-heading">
          <span className="eyebrow">Reporting period</span>
          <span
            className="report-timezone"
            title="Reports use calendar days in Coordinated Universal Time."
          >
            <Clock3 size={12} aria-hidden="true" /> UTC
          </span>
        </div>
        <div className="report-period-actions">
          <fieldset
            className="report-presets"
            aria-label="Quick reporting periods"
            style={{ margin: 0 }}
          >
            {presets.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={activePreset === days}
                onClick={() => report.setPeriod(presetReportPeriod(days))}
              >
                {days} days
              </button>
            ))}
          </fieldset>
          <Popover
            open={open}
            onOpenChange={(nextOpen) => {
              if (nextOpen) {
                setDraft(calendarRange(report));
                setMonth(reportDate(report.start));
                setSelectionError('');
              }
              setOpen(nextOpen);
            }}
          >
            <PopoverTrigger
              className="report-range-trigger"
              aria-label={`Choose report dates, ${formatReportPeriod(report)}`}
            >
              <CalendarDays size={16} aria-hidden="true" />
              <span>{formatReportPeriod(report)}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={10}
              className="report-date-popover"
            >
              <div className="report-calendar-heading">
                <div>
                  <PopoverTitle>Choose your date range</PopoverTitle>
                  <PopoverDescription>
                    Both selected dates are included · UTC
                  </PopoverDescription>
                </div>
                <CalendarDays size={20} aria-hidden="true" />
              </div>
              <Calendar
                mode="range"
                timeZone="UTC"
                selected={draft}
                month={month}
                onMonthChange={setMonth}
                onSelect={(range) => {
                  setDraft(range);
                  setSelectionError('');
                  if (range?.from && range.to) {
                    try {
                      reportPeriodFromDays(
                        range.from.toISOString().slice(0, 10),
                        range.to.toISOString().slice(0, 10),
                      );
                    } catch (error) {
                      setSelectionError((error as Error).message);
                    }
                  }
                }}
                className="report-calendar"
                showOutsideDays={false}
              />
              <div className="report-calendar-selection" aria-live="polite">
                <span className="small muted">Selected period</span>
                <strong>
                  {draftPeriod
                    ? formatReportPeriod(draftPeriod)
                    : 'Select a start and end date'}
                </strong>
              </div>
              {selectionError && (
                <p role="alert" className="notice small">
                  {selectionError}
                </p>
              )}
              <div className="report-calendar-footer">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  disabled={!draftPeriod}
                  onClick={() => {
                    if (!draftPeriod) return;
                    report.setPeriod(draftPeriod);
                    setOpen(false);
                  }}
                >
                  <Check size={14} aria-hidden="true" /> Apply dates
                </button>
              </div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            className="report-refresh"
            disabled={localMode || report.loading}
            onClick={report.refresh}
            aria-label={report.loading ? 'Loading report' : 'Refresh report'}
            title={
              localMode ? 'Connect reporting to refresh data' : 'Refresh report'
            }
          >
            <RefreshCw
              size={16}
              className={report.loading ? 'report-refreshing' : undefined}
              aria-hidden="true"
            />
            <span>{report.loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>
      {report.error && (
        <p role="alert" className="notice small">
          {report.error}
        </p>
      )}
      <p className="report-period-note">
        All matching records in this period. Today’s totals may still be
        updating.
      </p>
    </div>
  );
}
