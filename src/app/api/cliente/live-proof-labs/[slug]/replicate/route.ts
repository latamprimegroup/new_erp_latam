import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyCreativeVaultJobRequest } from '@/lib/notifications/admin-events'

const bodySchema = z.object({
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
})

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    include: { user: { select: { email: true } } },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { slug } = await ctx.params
  const labCase = await prisma.liveProofLabCase.findFirst({
    where: {
      slug,
      publishedToClients: true,
      status: { in: ['VALIDADA', 'EM_ESCALA'] },
    },
    include: { creativeTemplate: true },
  })

  if (!labCase) {
    return NextResponse.json({ error: 'Caso não disponível para réplica.' }, { status: 404 })
  }
  if (!labCase.creativeTemplateId || !labCase.creativeTemplate) {
    return NextResponse.json(
      { error: 'Este caso ainda não tem criativo de Vault configurado. Contacta o suporte.' },
      { status: 400 },
    )
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const template = labCase.creativeTemplate
  if (!template.published) {
    return NextResponse.json({ error: 'Template indisponível.' }, { status: 400 })
  }

  const scriptParts = [
    `[Live Proof Labs — réplica: ${labCase.title}]`,
    labCase.vslScriptNotes?.trim() || '',
    template.scriptCopy?.trim() ? `--- Roteiro base do template ---\n${template.scriptCopy.trim()}` : '',
  ].filter(Boolean)

  const hookNotes = scriptParts.join('\n\n')

  const job = await prisma.creativeAgencyJob.create({
    data: {
      clientId: client.id,
      templateId: template.id,
      checkoutUrl: body.checkoutUrl,
      hookNotes: hookNotes || null,
      iterationNumber: 1,
      parentJobId: null,
      iterationRootId: null,
      status: 'FILA',
    },
  })

  await prisma.creativeAgencyJob.update({
    where: { id: job.id },
    data: { iterationRootId: job.id },
  })

  const count = await prisma.supportTicket.count()
  const ticketNumber = `TKT-${String(count + 1).padStart(4, '0')}`
  const iterationLabel = 'Primeira versão (Live Proof Labs)'
  const ticketDescription = [
    `[Creative Vault — Live Proof Labs]`,
    `Caso: ${labCase.title} (${labCase.slug})`,
    `Job: ${job.id}`,
    `Template: ${template.title} (${template.niche})`,
    iterationLabel,
    `Checkout: ${body.checkoutUrl}`,
    `Cliente: ${client.user.email}`,
    '',
    hookNotes || '(sem roteiro adicional)',
  ].join('\n')

  const ticket = await prisma.supportTicket.create({
    data: {
      clientId: client.id,
      subject: `[Live Proof Labs] ${template.title} — ${labCase.productLabel}`,
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

  await prisma.liveProofLabReplicateLog.create({
    data: {
      caseId: labCase.id,
      clientId: client.id,
      jobId: job.id,
    },
  })

  if (labCase.creativeTemplateId) {
    await prisma.liveProofLabTemplateUnlock.upsert({
      where: {
        clientId_templateId: {
          clientId: client.id,
          templateId: labCase.creativeTemplateId,
        },
      },
      create: {
        clientId: client.id,
        templateId: labCase.creativeTemplateId,
        caseId: labCase.id,
      },
      update: { caseId: labCase.id },
    })
  }

  void notifyCreativeVaultJobRequest({
    clientEmail: client.user.email,
    templateTitle: `${template.title} (LPL)`,
    ticketNumber: ticket.ticketNumber,
    iterationLabel,
  }).catch((e) => console.error('notifyCreativeVaultJobRequest', e))

  const shieldQuery = new URLSearchParams()
  shieldQuery.set('checkout', body.checkoutUrl)
  if (labCase.defaultOfferPlatform) shieldQuery.set('platform', labCase.defaultOfferPlatform)
  shieldQuery.set('label', `LPL · ${labCase.productLabel}`.slice(0, 200))

  return NextResponse.json({
    jobId: job.id,
    ticketNumber: ticket.ticketNumber,
    nextSteps: {
      creativeVaultUrl: '/dashboard/cliente/creative-vault',
      shieldTrackerUrl: `/dashboard/cliente/shield-tracker?${shieldQuery.toString()}`,
    },
    hint:
      'Criámos o pedido no Creative Vault com o roteiro VSL. Abre o Shield & Tracker para criar o link blindado com o teu domínio e checkout.',
  })
}
