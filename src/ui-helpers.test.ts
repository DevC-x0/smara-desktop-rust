import { describe, expect, it } from 'vitest';
import { formatActionArgs, formatDuration, getRunStatusFromResult, parseStreamProgressChunk } from './ui-helpers';

describe('ui helpers', () => {
  it('parses deterministic stream-test progress chunks', () => {
    expect(parseStreamProgressChunk('stream-test tick 3/8')).toEqual({
      current: 3,
      total: 8,
      percent: 37.5,
    });
  });

  it('ignores chunks without progress markers', () => {
    expect(parseStreamProgressChunk('ordinary stdout line')).toBeNull();
  });

  it('maps run result flags to user-facing statuses', () => {
    expect(getRunStatusFromResult({ success: true })).toBe('success');
    expect(getRunStatusFromResult({ success: false })).toBe('failed');
    expect(getRunStatusFromResult({ success: false, cancelled: true })).toBe('cancelled');
    expect(getRunStatusFromResult({ success: false, timed_out: true })).toBe('timed-out');
  });

  it('formats durations and action args consistently', () => {
    expect(formatDuration(999)).toBe('999 ms');
    expect(formatDuration(1250)).toBe('1.3 s');
    expect(formatActionArgs(['doctor', '--json'])).toBe('doctor --json');
    expect(formatActionArgs([])).toBe('(none)');
  });
});
