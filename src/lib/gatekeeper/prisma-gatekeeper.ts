import { Prisma } from '@prisma/client'
import { gatekeeperAudit } from './audit-log'
import { GATEKEEPER_CROSSING_ERROR } from './errors'

export function mapGatekeeperPrismaError(e: unknown): string | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    gatekeeperAudit('UNIQUENESS', 'Prisma P2002 — violação de unicidade', {
      target: JSON.stringify(e.meta?.target ?? []),
    })
    return GATEKEEPER_CROSSING_ERROR
  }
  return null
}
