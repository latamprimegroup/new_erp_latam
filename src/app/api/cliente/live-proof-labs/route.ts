import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { toClientListItem } from '@/lib/live-proof-labs/serialize'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const rows = await prisma.liveProofLabCase.findMany({
    where: {
      publishedToClients: true,
      status: { in: ['EM_TESTE', 'VALIDADA', 'REPROVADA', 'EM_ESCALA'] },
    },
    orderBy: [{ sortOrder: 'asc' }, { validatedAt: 'desc' }, { createdAt: 'desc' }],
  })

  const emTeste: Awaited<ReturnType<typeof toClientListItem>>[] = []
  const lighthouse: Awaited<ReturnType<typeof toClientListItem>>[] = []
  const graveyard: Awaited<ReturnType<typeof toClientListItem>>[] = []
  for (const row of rows) {
    const item = await toClientListItem(row)
    if (item.status === 'REPROVADA') graveyard.push(item)
    else if (item.status === 'EM_TESTE') emTeste.push(item)
    else lighthouse.push(item)
  }

  return NextResponse.json({
    emTeste,
    lighthouse,
    graveyard,
    /** @deprecated usar lighthouse */
    validated: lighthouse,
  })
}
