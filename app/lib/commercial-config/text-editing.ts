export function editingTextToLines(value: string): string[] {
  return value.split('\n')
}

export function editingLinesToText(value: readonly string[]): string {
  return value.join('\n')
}

export function normalizeTextListsForPersistence<T>(value: T): T {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) {
      return value
        .map((item) => item.trim())
        .filter((item) => item.length > 0) as T
    }

    return value.map((item) => normalizeTextListsForPersistence(item)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeTextListsForPersistence(item),
      ]),
    ) as T
  }

  return value
}

export function isLatestEditRevision(
  saveRevision: number,
  currentRevision: number,
): boolean {
  return saveRevision === currentRevision
}
