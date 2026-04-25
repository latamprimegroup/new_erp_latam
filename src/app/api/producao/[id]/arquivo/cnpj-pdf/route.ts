import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ROLES = ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER']

/**
 * GET — PDF do cartão CNPJ servido a partir do banco de dados (base64).
 * Compatível com Vercel (sem filesystem efémero).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const account = await prisma.productionAccount.findFirst({
    where: { id, deletedAt: null },
    select: { cnpjPdfBase64: true, cnpjPdfFilename: true, cnpjPdfUrl: true, producerId: true },
  })

  if (session.user.role === 'PRODUCER' && account?.producerId !== session.user.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  // ── Prioridade: base64 no banco (novo) ─────────────────────────────────────
  if (account?.cnpjPdfBase64) {
    try {
      const buf = Buffer.from(account.cnpjPdfBase64, 'base64')
      const { searchParams } = new URL(req.url)
      const download = searchParams.get('download') === '1'
      const filename = account.cnpjPdfFilename ?? 'cartao-cnpj.pdf'
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
          'Cache-Control': 'private, max-age=3600',
        },
      })
    } catch {
      return NextResponse.json({ error: 'Erro ao recuperar PDF do banco' }, { status: 500 })
    }
  }

  // ── Fallback legado: tenta ler do filesystem (ambientes com disco persistente) ─
  if (account?.cnpjPdfUrl && !account.cnpjPdfUrl.startsWith('db:')) {
    try {
      const { readFile } = await import('fs/promises')
      const { join } = await import('path')
      const fullPath = join(process.cwd(), 'uploads', ...account.cnpjPdfUrl.split(/[/\\]/))
      const buf = await readFile(fullPath)
      const { searchParams } = new URL(req.url)
      const download = searchParams.get('download') === '1'
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="cartao-cnpj.pdf"`,
          'Cache-Control': 'private, max-age=3600',
        },
      })
    } catch {
      // ficheiro apagado pelo Vercel — sem fallback disponível
    }
  }

  return NextResponse.json({ error: 'Nenhum PDF de CNPJ enviado para esta conta' }, { status: 404 })
}
