export type StreamProgress = {
  current: number;
  total: number;
  percent: number;
};

export type RunStatusInput = {
  success?: boolean;
  timed_out?: boolean;
  cancelled?: boolean;
};

export function parseStreamProgressChunk(chunk: string): StreamProgress | null {
  const match = chunk.match(/tick\s+(\d+)\/(\d+)/i);
  if (!match) return null;

  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null;

  return {
    current,
    total,
    percent: Math.min(100, Math.max(0, (current / total) * 100)),
  };
}

export function getRunStatusFromResult(result: RunStatusInput): string {
  if (result.cancelled) return 'cancelled';
  if (result.timed_out) return 'timed-out';
  return result.success ? 'success' : 'failed';
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatActionArgs(args: string[]): string {
  return args.join(' ') || '(none)';
}
