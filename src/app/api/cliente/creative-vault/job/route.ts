import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyCreativeVaultJobRequest } from '@/lib/notifications/admin-events'

const MAX_LOGO_BYTES = 5 * 1024 * 1024
const LOGO_MIMES = ['image/jpeg', 'image/png', 'image/webp']

const jsonSchema = z.object({
  templateId: z.string().min(1),
  checkoutUrl: z
    .string()
    .min(12)
    .max(2000)
    .refine((s) => {
      try {
        const u = new URL(s)
        return u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        return false
      }
    }, 'URL do checkout inválida'),
  hookNotes: z.string().max(8000).optional(),
  parentJobId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    include: { user: { select: { email: true } } },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const ct = req.headers.get('content-type') || ''
  let body: z.infer<typeof jsonSchema>
  let logoFile: File | null = null

  try {
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      body = jsonSchema.parse({
        templateId: String(form.get('templateId') ?? ''),
        checkoutUrl: String(form.get('checkoutUrl') ?? ''),
        hookNotes: form.get('hookNotes') ? String(form.get('hookNotes')) : undefined,
        parentJobId: form.get('parentJobId') ? String(form.get('parentJobId')) : undefined,
      })
      const f = form.get('logo')
      if (f instanceof File && f.size > 0) logoFile = f
    } else {
      body = jsonSchema.parse(await req.json())
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const template = await prisma.creativeVaultTemplate.findFirst({
    where: {
      id: body.templateId,
      OR: [
        { published: true },
        { liveProofTemplateUnlocks: { some: { clientId: client.id } } },
      ],
    },
  })
  if (!template) return NextResponse.json({ error: 'Criativo não encontrado ou sem acesso' }, { status: 404 })

  let parentJob: Awaited<ReturnType<typeof prisma.creativeAgencyJob.findFirst>> = null
  if (body.parentJobId) {
    parentJob = await prisma.creativeAgencyJob.findFirst({
      where: { id: body.parentJobId, clientId: client.id },
    })
    if (!parentJob) {
      return NextResponse.json({ error: 'Pedido anterior não encontrado' }, { status: 404 })
    }
  }

  const iterationNumber = parentJob ? parentJob.iterationNumber + 1 : 1
  const iterationRootOnCreate = parentJob ? parentJob.iterationRootId || parentJob.id : null

  const job = await prisma.creativeAgencyJob.create({
    data: {
      clientId: client.id,
      templateId: template.id,
      checkoutUrl: body.checkoutUrl,
      hookNotes: body.hookNotes?.trim() || null,
      iterationNumber,
      parentJobId: parentJob?.id ?? null,
      iterationRootId: iterationRootOnCreate,
      status: 'FILA',
    },
  })

  if (!parentJob) {
    await prisma.creativeAgencyJob.update({
      where: { id: job.id },
      data: { iterationRootId: job.id },
    })
  }

  let logoUrl: string | null = null
  if (logoFile) {
    const buf = Buffer.from(await logoFile.arrayBuffer())
    if (buf.length > MAX_LOGO_BYTES) {
      await prisma.creativeAgencyJob.delete({ where: { id: job.id } })
      return NextResponse.json({ error: 'Logo muito grande (máx 5MB).' }, { status: 400 })
    }
    const mime = logoFile.type
    if (!LOGO_MIMES.includes(mime)) {
      await prisma.creativeAgencyJob.delete({ where: { id: job.id } })
      return NextResponse.json({ error: 'Logo: use JPEG, PNG ou WebP.' }, { status: 400 })
    }
    const ext = mime.split('/')[1] || 'bin'
    const short = createHash('sha256').update(buf).digest('hex').slice(0, 10)
    const filename = `logo_${short}.${ext}`
    const dir = join(process.cwd(), 'uploads', 'creative-vault', job.id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, filename), buf)
    logoUrl = `/api/cliente/creative-vault/jobs/${job.id}/logo/${encodeURIComponent(filename)}`
    await prisma.creativeAgencyJob.update({
      where: { id: job.id },
      data: { logoUrl },
    })
  }

  const count = await prisma.supportTicket.count()
  const ticketNumber = `TKT-${String(count + 1).padStart(4, '0')}`
  const iterationLabel = parentJob ? `Iteração v${iterationNumber}` : 'Primeira versão'
  const ticketDescription = [
    `[Creative Vault — edição personalizada]`,
    `Job: ${job.id}`,
    `Template: ${template.title} (${template.niche})`,
    iterationLabel,
    `Checkout: ${body.checkoutUrl}`,
    `Cliente: ${client.user.email}`,
    '',
    body.hookNotes?.trim() || '(sem pedido específico de hook)',
    logoUrl ? `\nLogo anexada: ${logoUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const ticket = await prisma.supportTicket.create({
    data: {
      clientId: client.id,
      subject: `[Creative Vault] ${template.title} — ${iterationLabel}`,
      description: ticketDescription,
      category: 'SOLICITACAO',
      priority: 'NORMAL',
      ticketNumber,
    },
  })

  await prisma.creativeAgencyJob.update({
    where: { id: job.id },
    data: { ticketId: ticket.id },
  })

  void notifyCreativeVaultJobRequest({
    clientEmail: client.user.email,
    templateTitle: template.title,
    ticketNumber: ticket.ticketNumber,
    iterationLabel,
  }).catch((e) => console.error('notifyCreativeVaultJobRequest', e))

  const full = await prisma.creativeAgencyJob.findUnique({
    where: { id: job.id },
    include: { template: { select: { title: true, niche: true } } },
  })

  return NextResponse.json({ job: full, ticketNumber: ticket.ticketNumber })
}
