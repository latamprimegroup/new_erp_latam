import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { AccountRmaReason } from '@prisma/client'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyStakeholdersOnRmaOpen } from '@/lib/rma-notify'
import { parseEvidenceUrls } from '@/lib/rma'

const MAX_FILES = 6
const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const createBodySchema = z.object({
  originalAccountId: z.string().min(1),
  reason: z.nativeEnum(AccountRmaReason),
  reasonDetail: z.string().max(8000).optional(),
  additionalComments: z.string().max(8000).optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const list = await prisma.accountReplacementRequest.findMany({
    where: { clientId: client.id },
    orderBy: { openedAt: 'desc' },
    take: 80,
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
    },
  })

  const items = list.map((row) => ({
    ...row,
    evidenceUrls: parseEvidenceUrls(row.evidenceUrls),
  }))

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const ct = req.headers.get('content-type') || ''
  let data: z.infer<typeof createBodySchema>
  const files: File[] = []

  try {
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      const raw = {
        originalAccountId: String(form.get('originalAccountId') ?? ''),
        reason: String(form.get('reason') ?? ''),
        reasonDetail: form.get('reasonDetail') ? String(form.get('reasonDetail')) : undefined,
        additionalComments: form.get('additionalComments')
          ? String(form.get('additionalComments'))
          : undefined,
      }
      data = createBodySchema.parse(raw)
      const ev = form.getAll('evidence')
      for (const f of ev) {
        if (f instanceof File && f.size > 0) files.push(f)
      }
    } else {
      const body = await req.json()
      data = createBodySchema.parse(body)
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (data.reason === AccountRmaReason.OUTRO && (!data.reasonDetail || data.reasonDetail.trim().length < 8)) {
    return NextResponse.json(
      { error: 'Para motivo "Outro", descreva o problema em pelo menos 8 caracteres.' },
      { status: 400 }
    )
  }

  const account = await prisma.stockAccount.findFirst({
    where: {
      id: data.originalAccountId,
      clientId: client.id,
      deletedAt: null,
      deliveredAt: { not: null },
    },
  })
  if (!account) {
    return NextResponse.json(
      { error: 'Conta não encontrada ou ainda não entregue. Use só contas já entregues.' },
      { status: 404 }
    )
  }

  const open = await prisma.accountReplacementRequest.findFirst({
    where: {
      originalAccountId: data.originalAccountId,
      status: { in: ['EM_ANALISE', 'EM_REPOSICAO'] },
    },
  })
  if (open) {
    return NextResponse.json(
      { error: 'Já existe uma solicitação de reposição em aberto para esta conta.' },
      { status: 409 }
    )
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Máximo ${MAX_FILES} arquivos de evidência.` }, { status: 400 })
  }

  const rma = await prisma.accountReplacementRequest.create({
    data: {
      clientId: client.id,
      originalAccountId: data.originalAccountId,
      reason: data.reason,
      reasonDetail: data.reasonDetail?.trim() || null,
      additionalComments: data.additionalComments?.trim() || null,
      evidenceUrls: [],
    },
  })

  const urls: string[] = []
  const dir = join(process.cwd(), 'uploads', 'rma', rma.id)
  await mkdir(dir, { recursive: true })

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length > MAX_BYTES) {
      await prisma.accountReplacementRequest.delete({ where: { id: rma.id } })
      return NextResponse.json({ error: 'Arquivo muito grande (máx 8MB por arquivo).' }, { status: 400 })
    }
    const mime = file.type
    if (!ALLOWED.includes(mime)) {
      await prisma.accountReplacementRequest.delete({ where: { id: rma.id } })
      return NextResponse.json({ error: 'Use apenas imagens JPEG, PNG, WebP ou GIF.' }, { status: 400 })
    }
    const ext = mime.split('/')[1] || 'bin'
    const short = createHash('sha256').update(buf).digest('hex').slice(0, 10)
    const filename = `ev_${i}_${short}.${ext}`
    await writeFile(join(dir, filename), buf)
    urls.push(`/api/cliente/rma/${rma.id}/file/${encodeURIComponent(filename)}`)
  }

  const updated = await prisma.accountReplacementRequest.update({
    where: { id: rma.id },
    data: { evidenceUrls: urls },
    include: {
      originalAccount: {
        select: {
          id: true,
          platform: true,
          googleAdsCustomerId: true,
          status: true,
        },
      },
    },
  })

  await notifyStakeholdersOnRmaOpen(rma.id)

  return NextResponse.json(updated)
}
