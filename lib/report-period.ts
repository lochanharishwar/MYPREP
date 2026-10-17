export type ReportPeriod = { start: string; end: string };

const DAY = 86_400_000;

/** Calendar days are always interpreted in UTC, independently of browser time. */
export function reportDate(day: string) {
  const date = new Date(`${day}T12:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    throw new Error('Choose a valid calendar date.');
  return date;
}

export function shiftReportDay(day: string, amount: number) {
  return new Date(reportDate(day).getTime() + amount * DAY)
    .toISOString()
    .slice(0, 10);
}

/** The UI includes both dates; the reports API excludes its end boundary. */
export function reportPeriodFromDays(
  from: string,
  through: string,
): ReportPeriod {
  const start = reportDate(from),
    end = reportDate(through);
  const days = (end.getTime() - start.getTime()) / DAY + 1;
  if (days < 1)
    throw new Error('The end date must be on or after the start date.');
  if (days > 366) throw new Error('Choose a period of 366 days or fewer.');
  return { start: from, end: shiftReportDay(through, 1) };
}

export function presetReportPeriod(days: 7 | 30 | 90, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return reportPeriodFromDays(shiftReportDay(today, 1 - days), today);
}

export function formatReportPeriod({ start, end }: ReportPeriod) {
  const formatter = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return formatter.formatRange(
    reportDate(start),
    reportDate(shiftReportDay(end, -1)),
  );
}
