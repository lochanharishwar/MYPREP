import { describe, expect, it } from 'vitest';
import {
  presetReportPeriod,
  reportDate,
  reportPeriodFromDays,
  shiftReportDay,
} from '../lib/report-period';

describe('report date boundaries', () => {
  it('includes the selected final day while sending an exclusive UTC end', () => {
    expect(reportPeriodFromDays('2026-12-31', '2026-12-31')).toEqual({
      start: '2026-12-31',
      end: '2027-01-01',
    });
    expect(reportPeriodFromDays('2024-02-28', '2024-02-29')).toEqual({
      start: '2024-02-28',
      end: '2024-03-01',
    });
  });
  it('uses the UTC day for presets even when the browser is on another date', () => {
    expect(
      presetReportPeriod(7, new Date('2026-01-01T00:30:00+14:00')),
    ).toEqual({ start: '2025-12-25', end: '2026-01-01' });
    expect(
      presetReportPeriod(30, new Date('2026-03-09T23:30:00-07:00')),
    ).toEqual({ start: '2026-02-09', end: '2026-03-11' });
  });
  it('keeps exact calendar-day lengths across daylight-saving transitions', () => {
    for (const days of [7, 30, 90] as const) {
      const period = presetReportPeriod(days, new Date('2026-11-02T12:00:00Z'));
      expect(
        (Date.parse(period.end) - Date.parse(period.start)) / 86_400_000,
      ).toBe(days);
      expect(shiftReportDay(period.end, -1)).toBe('2026-11-02');
    }
  });
  it('rejects invalid, reversed, and oversized ranges before requesting a report', () => {
    expect(() => reportDate('2026-02-30')).toThrow();
    expect(() => reportPeriodFromDays('2026-02-02', '2026-02-01')).toThrow();
    expect(() => reportPeriodFromDays('2025-01-01', '2026-01-02')).toThrow();
    expect(reportPeriodFromDays('2024-01-01', '2024-12-31').end).toBe(
      '2025-01-01',
    );
  });
});
