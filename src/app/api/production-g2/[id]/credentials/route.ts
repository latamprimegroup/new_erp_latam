import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { getAuthenticatedKey, withRateLimit } from '@/lib/rate-limit-api'
import { prisma } from '@/lib/prisma'

/**
 * POST - Visualiza credenciais completas (registra log de visualização)
 * Rate limit: 10 requisições/minuto por usuário (dado sensível)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response
  const session = auth.session

  const limited = withRateLimit(req, getAuthenticatedKey(session.user!.id, 'credentials:view'), { max: 10, windowMs: 60_000 })
  if (limited) return limited

  const { id } = await params
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null

  const item = await prisma.productionG2.findFirst({
    where: { id, deletedAt: null },
    include: { credentials: true },
  })

  if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (!item.credentials) return NextResponse.json({ error: 'Credenciais não cadastradas' }, { status: 404 })

  await prisma.productionG2CredentialViewLog.create({
    data: {
      productionG2Id: id,
      userId: session.user!.id,
      ip,
    },
  })

  return NextResponse.json(item.credentials)
}
