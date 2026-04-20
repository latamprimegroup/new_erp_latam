import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER']

/**
 * GET — PDF do cartão CNPJ em modo inline (preview no navegador, sem download forçado).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const account = await prisma.productionAccount.findFirst({
    where: { id, deletedAt: null },
    select: { cnpjPdfUrl: true, producerId: true },
  })
  if (!account?.cnpjPdfUrl) {
    return NextResponse.json({ error: 'Nenhum PDF de CNPJ enviado para esta conta' }, { status: 404 })
  }

  if (session.user.role === 'PRODUCER' && account.producerId !== session.user.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const fullPath = join(process.cwd(), 'uploads', account.cnpjPdfUrl)
    const buf = await readFile(fullPath)
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="cartao-cnpj.pdf"',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Arquivo não encontrado no servidor' }, { status: 404 })
  }
}
