import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const MAX_SIZE = 15 * 1024 * 1024 // 15MB
const ALLOWED_MIMES = ['application/pdf', 'application/x-pdf', 'application/acrobat']

/**
 * POST - Upload do Cartão CNPJ (PDF) para conta de produção
 * Renomeia para cnpj_[ID_DA_CONTA].pdf e grava em uploads/producao/{accountId}/
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
    select: {
      id: true,
      status: true,
      producerId: true,
      accountCode: true,
      googleAdsCustomerId: true,
      producer: true,
    },
  })
  if (!account) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  // Permite upload para qualquer status (incluindo APPROVED) — produtor, gerente ou admin
  const isOwner = account.producerId === session.user.id
  const isManagerOrAdmin = ['ADMIN', 'PRODUCTION_MANAGER'].includes(session.user.role ?? '')
  if (!isOwner && !isManagerOrAdmin) {
    return NextResponse.json({ error: 'Apenas o produtor, gerente ou admin pode enviar documentos' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch (parseErr) {
    console.error('CNPJ PDF — erro ao parsear formData:', parseErr)
    return NextResponse.json({ error: 'Falha ao ler o arquivo enviado. Tente novamente.' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'Informe o arquivo PDF' }, { status: 400 })
  }

  const mime = (file.type || '').toLowerCase()
  const isAllowedMime = ALLOWED_MIMES.includes(mime) || mime.startsWith('application/pdf')
  // Fallback: aceita se o nome terminar em .pdf (alguns browsers omitem o MIME)
  const nameOk = file.name.toLowerCase().endsWith('.pdf')
  if (!isAllowedMime && !nameOk) {
    return NextResponse.json({ error: 'Apenas arquivos PDF são permitidos' }, { status: 400 })
  }

  let buf: Buffer
  try {
    buf = Buffer.from(await file.arrayBuffer())
  } catch (readErr) {
    console.error('CNPJ PDF — erro ao ler buffer:', readErr)
    return NextResponse.json({ error: 'Falha ao ler o conteúdo do arquivo.' }, { status: 400 })
  }

  if (buf.length > MAX_SIZE) {
    return NextResponse.json({ error: `Arquivo muito grande (máx ${MAX_SIZE / 1024 / 1024}MB)` }, { status: 400 })
  }

  // Sanity check: verifica assinatura mágica do PDF (%PDF)
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) !== '%PDF') {
    return NextResponse.json({ error: 'Arquivo não é um PDF válido.' }, { status: 400 })
  }

  try {
    const gDigits = account.googleAdsCustomerId?.replace(/\D/g, '') ?? ''
    const idPart =
      gDigits.length >= 10
        ? gDigits
        : (account.accountCode || id.slice(0, 8)).replace(/[^a-zA-Z0-9]/g, '_')
    const ts = Date.now()
    const filename = `cnpj_${idPart}_${ts}.pdf`

    const dir = join(process.cwd(), 'uploads', 'producao', id)
    await mkdir(dir, { recursive: true })

    const fullPath = join(dir, filename)
    await writeFile(fullPath, buf)

    // Salva caminho relativo usando separador posix para portabilidade
    const storagePath = `producao/${id}/${filename}`

    await prisma.productionAccount.update({
      where: { id },
      data: { cnpjPdfUrl: storagePath },
    })

    await audit({
      userId: session.user.id,
      action: 'production_cnpj_pdf_uploaded',
      entity: 'ProductionAccount',
      entityId: id,
      details: { filename, size: buf.length },
    })

    return NextResponse.json({ ok: true, filename })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('CNPJ PDF upload error:', err)
    return NextResponse.json(
      { error: `Erro ao salvar o arquivo no servidor: ${message}` },
      { status: 500 }
    )
  }
}

// Aumenta o timeout para uploads grandes
export const maxDuration = 30
