export type TimerResult = {
  label: string;
  ms: number;
};

export async function timeIt<T>(label: string, fn: () => Promise<T>): Promise<{ value: T; timing: TimerResult }> {
  const start = performance.now();
  const value = await fn();
  const end = performance.now();
  return { value, timing: { label, ms: end - start } };
}

