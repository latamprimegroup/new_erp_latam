import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { getAuthenticatedKey, withRateLimit } from '@/lib/rate-limit-api'

const DOC_TYPES = ['RG_FRENTE', 'RG_VERSO', 'CARTAO_CNPJ', 'COMPROVANTE_ENDERECO', 'COMPROVANTE_OUTRO'] as const
const MAX_SIZE = 10 * 1024 * 1024  // 10MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

/**
 * GET - Lista documentos da conta G2
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const { id } = await params
  const g2 = await prisma.productionG2.findFirst({
    where: { id, deletedAt: null },
  })
  if (!g2) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const docs = await prisma.documentAsset.findMany({
    where: { productionG2Id: id },
    orderBy: { uploadedAt: 'desc' },
  })

  return NextResponse.json(docs.map((d) => ({
    id: d.id,
    type: d.type,
    mimeType: d.mimeType,
    uploadedAt: d.uploadedAt,
    contentHash: d.contentHash.slice(0, 12) + '...',
    hasBlockedReason: !!d.blockedReason,
  })))
}

/**
 * POST - Upload de documento (RG, Cartão CNPJ, etc.)
 * FormData: file, type (RG_FRENTE | RG_VERSO | CARTAO_CNPJ | ...)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response
  const session = auth.session

  const limited = withRateLimit(
    req,
    getAuthenticatedKey(session!.user!.id, 'g2:documents:upload'),
    { max: 20, windowMs: 60_000 }
  )
  if (limited) return limited

  const { id } = await params
  const g2 = await prisma.productionG2.findFirst({
    where: { id, deletedAt: null },
  })
  if (!g2) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (['APROVADA', 'ENVIADA_ESTOQUE', 'REPROVADA'].includes(g2.status)) {
    return NextResponse.json({ error: 'Conta já aprovada ou reprovada — documentos não podem ser alterados' }, { status: 400 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const type = (formData.get('type') as string)?.toUpperCase()

    if (!file || !type || !DOC_TYPES.includes(type as typeof DOC_TYPES[number])) {
      return NextResponse.json(
        { error: `Informe file e type válido: ${DOC_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length > MAX_SIZE) {
      return NextResponse.json({ error: 'Arquivo muito grande (máx 10MB)' }, { status: 400 })
    }

    const mime = file.type
    if (!ALLOWED_MIMES.includes(mime)) {
      return NextResponse.json({ error: 'Tipo não permitido. Use: JPEG, PNG, WebP ou PDF' }, { status: 400 })
    }

    const contentHash = createHash('sha256').update(buf).digest('hex')

    const duplicate = await prisma.documentAsset.findFirst({
      where: { contentHash },
    })
    if (duplicate && duplicate.productionG2Id !== id) {
      await audit({
        userId: session!.user!.id,
        action: 'document_upload_blocked_duplicate',
        entity: 'DocumentAsset',
        entityId: undefined,
        details: { productionG2Id: id, type, contentHash: contentHash.slice(0, 16) },
      })
      return NextResponse.json(
        { error: 'Documento duplicado — este arquivo já foi enviado em outra conta' },
        { status: 400 }
      )
    }

    const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1] || 'bin'
    const dir = join(process.cwd(), 'uploads', 'documents', id)
    await mkdir(dir, { recursive: true })
    const filename = `${type}_${Date.now()}.${ext}`
    const storagePath = join('documents', id, filename)
    const fullPath = join(process.cwd(), 'uploads', storagePath)
    await writeFile(fullPath, buf)

    const doc = await prisma.documentAsset.upsert({
      where: {
        productionG2Id_type: { productionG2Id: id, type: type as 'RG_FRENTE' | 'RG_VERSO' | 'CARTAO_CNPJ' | 'COMPROVANTE_ENDERECO' | 'COMPROVANTE_OUTRO' },
      },
      create: {
        productionG2Id: id,
        type: type as 'RG_FRENTE' | 'RG_VERSO' | 'CARTAO_CNPJ' | 'COMPROVANTE_ENDERECO' | 'COMPROVANTE_OUTRO',
        storagePath,
        contentHash,
        mimeType: mime,
        uploadedById: session!.user!.id,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
      },
      update: {
        storagePath,
        contentHash,
        mimeType: mime,
        uploadedById: session!.user!.id,
        uploadedAt: new Date(),
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
        blockedReason: null,
      },
    })

    await audit({
      userId: session!.user!.id,
      action: 'document_uploaded',
      entity: 'DocumentAsset',
      entityId: doc.id,
      details: { productionG2Id: id, type },
    })

    return NextResponse.json({
      id: doc.id,
      type: doc.type,
      uploadedAt: doc.uploadedAt,
    })
  } catch (err) {
    console.error('Document upload error:', err)
    return NextResponse.json({ error: 'Erro ao fazer upload' }, { status: 500 })
  }
}
