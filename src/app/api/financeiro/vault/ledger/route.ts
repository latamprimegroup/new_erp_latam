import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'FINANCE'] as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const take = Math.min(100, parseInt(req.nextUrl.searchParams.get('take') || '40', 10) || 40)
  const journals = await prisma.vaultLedgerJournal.findMany({
    take,
    orderBy: { occurredAt: 'desc' },
    include: {
      lines: true,
    },
  })

  return NextResponse.json({
    journals: journals.map((j) => ({
      id: j.id,
      occurredAt: j.occurredAt.toISOString(),
      memo: j.memo,
      source: j.source,
      sourceId: j.sourceId,
      lines: j.lines.map((l) => ({
        account: l.account,
        debit: l.debit.toString(),
        credit: l.credit.toString(),
      })),
    })),
  })
}
