/** A synchronous, component-local lock. Acquired before the first await. */
export function createMutationLock(onChange: (key: string | null) => void) {
  let active: string | null = null;
  return {
    isLocked: () => active !== null,
    async run<T>(key: string, operation: () => Promise<T>): Promise<T | undefined> {
      if (active !== null) return;
      active = key;
      try {
        onChange(key);
        return await operation();
      } finally {
        active = null;
        onChange(null);
      }
    },
  };
}
