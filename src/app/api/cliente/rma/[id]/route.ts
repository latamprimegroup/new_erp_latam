import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseEvidenceUrls } from '@/lib/rma'

async function assertClientOwnsRma(userId: string, rmaId: string) {
  const client = await prisma.clientProfile.findUnique({ where: { userId } })
  if (!client) return { ok: false as const, status: 404 as const, error: 'Cliente não encontrado' }
  const rma = await prisma.accountReplacementRequest.findFirst({
    where: { id: rmaId, clientId: client.id },
    include: {
      originalAccount: {
        select: {
          id: true,
          platform: true,
          googleAdsCustomerId: true,
          status: true,
        },
      },
      replacementAccount: {
        select: { id: true, googleAdsCustomerId: true, status: true },
      },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  })
  if (!rma) return { ok: false as const, status: 404 as const, error: 'Não encontrado' }
  return { ok: true as const, rma }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const check = await assertClientOwnsRma(session.user!.id, id)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  const evidenceUrls = parseEvidenceUrls(check.rma.evidenceUrls)

  return NextResponse.json({
    ...check.rma,
    evidenceUrls,
  })
}
