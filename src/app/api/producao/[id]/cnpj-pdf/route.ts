import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIMES = ['application/pdf']

/**
 * POST - Upload do Cartão CNPJ (PDF) para conta de produção
 * Renomeia para cnpj_[ID_DA_CONTA].pdf
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'PRODUCER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const account = await prisma.productionAccount.findUnique({
    where: { id, deletedAt: null },
    include: { producer: true },
  })
  if (!account) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  if (account.status !== 'PENDING') {
    return NextResponse.json({ error: 'Só é possível enviar PDF para contas pendentes' }, { status: 400 })
  }

  const isProducer = account.producerId === session.user.id
  if (!isProducer && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas o produtor ou admin pode enviar documentos' }, { status: 403 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Informe o arquivo PDF' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length > MAX_SIZE) {
      return NextResponse.json({ error: 'Arquivo muito grande (máx 10MB)' }, { status: 400 })
    }

    const mime = file.type
    if (!ALLOWED_MIMES.includes(mime)) {
      return NextResponse.json({ error: 'Apenas arquivos PDF são permitidos' }, { status: 400 })
    }

    const idDaConta = account.googleAdsCustomerId || id.slice(0, 8)
    const safeId = idDaConta.replace(/[^a-zA-Z0-9-]/g, '_')
    const filename = `cnpj_${safeId}.pdf`

    const dir = join(process.cwd(), 'uploads', 'producao', id)
    await mkdir(dir, { recursive: true })
    const storagePath = join('producao', id, filename)
    const fullPath = join(process.cwd(), 'uploads', storagePath)
    await writeFile(fullPath, buf)

    await prisma.productionAccount.update({
      where: { id },
      data: { cnpjPdfUrl: storagePath },
    })

    await audit({
      userId: session.user.id,
      action: 'production_cnpj_pdf_uploaded',
      entity: 'ProductionAccount',
      entityId: id,
      details: { filename },
    })

    return NextResponse.json({ ok: true, filename })
  } catch (err) {
    console.error('CNPJ PDF upload error:', err)
    return NextResponse.json({ error: 'Erro ao fazer upload' }, { status: 500 })
  }
}
