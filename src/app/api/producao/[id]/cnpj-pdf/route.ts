import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MAX_SIZE = 15 * 1024 * 1024 // 15MB

/**
 * POST - Upload do Cartão CNPJ (PDF) para conta de produção
 * Armazena como base64 no banco de dados — independente de filesystem (compatível com Vercel).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const account = await prisma.productionAccount.findUnique({
    where: { id, deletedAt: null },
    select: { id: true, status: true, producerId: true, accountCode: true, googleAdsCustomerId: true },
  })
  if (!account) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  const isOwner = account.producerId === session.user.id
  const isManagerOrAdmin = ['ADMIN', 'PRODUCTION_MANAGER'].includes(session.user.role ?? '')
  if (!isOwner && !isManagerOrAdmin) {
    return NextResponse.json({ error: 'Apenas o produtor, gerente ou admin pode enviar documentos' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Falha ao ler o arquivo enviado. Tente novamente.' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'Informe o arquivo PDF' }, { status: 400 })
  }

  const mime = (file.type || '').toLowerCase()
  const isAllowedMime = mime.includes('pdf')
  const nameOk = file.name.toLowerCase().endsWith('.pdf')
  if (!isAllowedMime && !nameOk) {
    return NextResponse.json({ error: 'Apenas arquivos PDF são permitidos' }, { status: 400 })
  }

  let buf: Buffer
  try {
    buf = Buffer.from(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Falha ao ler o conteúdo do arquivo.' }, { status: 400 })
  }

  if (buf.length > MAX_SIZE) {
    return NextResponse.json({ error: `Arquivo muito grande (máx ${MAX_SIZE / 1024 / 1024}MB)` }, { status: 400 })
  }

  if (buf.length >= 4 && buf.toString('ascii', 0, 4) !== '%PDF') {
    return NextResponse.json({ error: 'Arquivo não é um PDF válido.' }, { status: 400 })
  }

  try {
    const gDigits = account.googleAdsCustomerId?.replace(/\D/g, '') ?? ''
    const idPart =
      gDigits.length >= 10
        ? gDigits
        : (account.accountCode || id.slice(0, 8)).replace(/[^a-zA-Z0-9]/g, '_')
    const filename = `cnpj_${idPart}_${Date.now()}.pdf`
    const base64 = buf.toString('base64')

    await prisma.productionAccount.update({
      where: { id },
      data: {
        cnpjPdfBase64: base64,
        cnpjPdfFilename: filename,
        // mantém cnpjPdfUrl para compatibilidade legada
        cnpjPdfUrl: `db:${filename}`,
      },
    })

    await audit({
      userId: session.user.id,
      action: 'production_cnpj_pdf_uploaded',
      entity: 'ProductionAccount',
      entityId: id,
      details: { filename, size: buf.length, storage: 'database' },
    })

    return NextResponse.json({ ok: true, filename })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('CNPJ PDF upload error:', err)
    return NextResponse.json(
      { error: `Erro ao salvar o arquivo: ${message}` },
      { status: 500 }
    )
  }
}
