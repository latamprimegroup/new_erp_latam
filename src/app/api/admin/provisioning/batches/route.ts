import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { normalizeProvisionDomain } from '@/lib/domain-provision-engine'

const createSchema = z.object({
  domainsText: z.string().min(1).max(500_000),
  targetServerIp: z.string().min(7).max(45),
  templateKey: z.enum(['VSL-A', 'QUIZ-B', 'LEAD-C']),
  metaPixelId: z.string().max(64).optional().nullable(),
  videoMasterKey: z.string().max(120).optional().nullable(),
  clientId: z.string().optional().nullable(),
})

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const batches = await prisma.domainProvisionBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      status: true,
      templateKey: true,
      targetServerIp: true,
      itemCount: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ batches })
}

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response
  const session = auth.session

  try {
    const body = createSchema.parse(await req.json())
    const lines = body.domainsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    const seen = new Set<string>()
    const domains: string[] = []
    for (const line of lines) {
      const d = normalizeProvisionDomain(line)
      if (!d || seen.has(d)) continue
      seen.add(d)
      domains.push(d)
      if (domains.length >= 1000) break
    }

    if (domains.length === 0) {
      return NextResponse.json({ error: 'Nenhum domínio válido (máx. 1000).' }, { status: 400 })
    }

    if (body.clientId) {
      const cp = await prisma.clientProfile.findUnique({ where: { id: body.clientId } })
      if (!cp) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 400 })
    }

    const batch = await prisma.domainProvisionBatch.create({
      data: {
        createdById: session.user.id,
        targetServerIp: body.targetServerIp.trim(),
        templateKey: body.templateKey,
        metaPixelId: body.metaPixelId?.trim() || null,
        videoMasterKey: body.videoMasterKey?.trim() || null,
        clientId: body.clientId?.trim() || null,
        status: 'QUEUED',
        domainsRaw: body.domainsText.slice(0, 500_000),
        itemCount: domains.length,
        items: {
          create: domains.map((domain) => ({
            domain,
          })),
        },
      },
      select: { id: true },
    })

    return NextResponse.json({ id: batch.id, itemCount: domains.length })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos' }, { status: 400 })
    }
    throw e
  }
}
