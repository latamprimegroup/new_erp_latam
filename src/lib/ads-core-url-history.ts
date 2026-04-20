import type { Prisma } from '@prisma/client'

export type AdsCoreUrlHistoryEntry = {
  at: string
  userId: string
  old: string | null
  new: string | null
}

export function parseUrlHistory(raw: unknown): AdsCoreUrlHistoryEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (x) =>
      x &&
      typeof x === 'object' &&
      'at' in x &&
      'userId' in x &&
      typeof (x as AdsCoreUrlHistoryEntry).at === 'string'
  ) as AdsCoreUrlHistoryEntry[]
}

export function appendUrlHistory(
  previous: unknown,
  entry: AdsCoreUrlHistoryEntry
): Prisma.InputJsonValue {
  const list = parseUrlHistory(previous)
  return [...list, entry] as unknown as Prisma.InputJsonValue
}
