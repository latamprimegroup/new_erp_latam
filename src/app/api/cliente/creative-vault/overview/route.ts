import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { CreativeVaultNiche } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { creativeDiagnosticsFromMetrics } from '@/lib/cliente/creative-vault-diagnostics'

function num(d: unknown): number {
  if (d === null || d === undefined) return 0
  if (typeof d === 'object' && d !== null && 'toNumber' in d && typeof (d as { toNumber: () => number }).toNumber === 'function') {
    return (d as { toNumber: () => number }).toNumber()
  }
  return Number(d)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const nicheParam = searchParams.get('niche')
  const nicheFilter =
    nicheParam && Object.values(CreativeVaultNiche).includes(nicheParam as CreativeVaultNiche)
      ? (nicheParam as CreativeVaultNiche)
      : undefined

  const unlockRows = await prisma.liveProofLabTemplateUnlock.findMany({
    where: { clientId: client.id },
    select: { templateId: true },
  })
  const unlockedIds = [...new Set(unlockRows.map((u) => u.templateId))]

  const templates = await prisma.creativeVaultTemplate.findMany({
    where: {
      ...(nicheFilter ? { niche: nicheFilter } : {}),
      OR: [{ published: true }, ...(unlockedIds.length ? [{ id: { in: unlockedIds } }] : [])],
    },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    select: {
      id: true,
      slug: true,
      niche: true,
      title: true,
      description: true,
      previewVideoUrl: true,
      thumbnailUrl: true,
      roiLabel: true,
      scriptCopy: true,
      published: true,
    },
  })

  const unlockSet = new Set(unlockedIds)
  const templatesOut = templates.map((t) => ({
    id: t.id,
    slug: t.slug,
    niche: t.niche,
    title: t.title,
    description: t.description,
    previewVideoUrl: t.previewVideoUrl,
    thumbnailUrl: t.thumbnailUrl,
    roiLabel: t.roiLabel,
    scriptCopy: t.scriptCopy,
    liveProofUnlocked: unlockSet.has(t.id),
  }))

  const jobs = await prisma.creativeAgencyJob.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: 'desc' },
    include: {
      template: { select: { id: true, title: true, niche: true } },
    },
  })

  const metrics = await prisma.creativeAdMetricsEntry.findMany({
    where: { clientId: client.id },
    orderBy: { metricDate: 'desc' },
    take: 60,
    include: {
      job: {
        select: {
          id: true,
          iterationNumber: true,
          template: { select: { title: true } },
        },
      },
    },
  })

  const latest = metrics[0]
  let latestDiagnostics: ReturnType<typeof creativeDiagnosticsFromMetrics> = []
  if (latest) {
    latestDiagnostics = creativeDiagnosticsFromMetrics(
      num(latest.spend),
      num(latest.ctrPercent),
      num(latest.sales)
    )
  }

  const metricsSerialized = metrics.map((m) => ({
    id: m.id,
    metricDate: m.metricDate.toISOString().slice(0, 10),
    spend: num(m.spend),
    clicks: m.clicks,
    ctrPercent: num(m.ctrPercent),
    cpc: num(m.cpc),
    sales: num(m.sales),
    label: m.label,
    jobId: m.jobId,
    jobLabel: m.job
      ? `${m.job.template.title} · v${m.job.iterationNumber}`
      : null,
    roi: num(m.spend) > 0 ? num(m.sales) / num(m.spend) : null,
    diagnostics: creativeDiagnosticsFromMetrics(num(m.spend), num(m.ctrPercent), num(m.sales)),
  }))

  const rootMap = new Map<string, typeof jobs>()
  for (const j of jobs) {
    const root = j.iterationRootId || j.id
    const arr = rootMap.get(root) || []
    arr.push(j)
    rootMap.set(root, arr)
  }
  const iterationChains = [...rootMap.entries()].map(([rootId, chain]) => ({
    rootId,
    jobs: [...chain].sort((a, b) => a.iterationNumber - b.iterationNumber).map((j) => ({
      id: j.id,
      iterationNumber: j.iterationNumber,
      status: j.status,
      templateTitle: j.template.title,
      ctrSnapshotAtDelivery: j.ctrSnapshotAtDelivery ? num(j.ctrSnapshotAtDelivery) : null,
      uniqueMetadataHashDone: j.uniqueMetadataHashDone,
      deliverableUrl: j.deliverableUrl,
      createdAt: j.createdAt.toISOString(),
    })),
  }))

  const vslWatches = await prisma.clienteVslWatch.findMany({
    where: { clientId: client.id },
    orderBy: { updatedAt: 'desc' },
    take: 40,
  })

  const deliveredJobsForSelect = jobs
    .filter((j) => j.status === 'ENTREGUE')
    .map((j) => ({
      id: j.id,
      label: `${j.template.title} · v${j.iterationNumber}`,
    }))

  return NextResponse.json({
    templates: templatesOut,
    jobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      checkoutUrl: j.checkoutUrl,
      logoUrl: j.logoUrl,
      hookNotes: j.hookNotes,
      iterationNumber: j.iterationNumber,
      parentJobId: j.parentJobId,
      iterationRootId: j.iterationRootId,
      deliverableUrl: j.deliverableUrl,
      uniqueMetadataHashDone: j.uniqueMetadataHashDone,
      ctrSnapshotAtDelivery: j.ctrSnapshotAtDelivery ? num(j.ctrSnapshotAtDelivery) : null,
      ticketId: j.ticketId,
      createdAt: j.createdAt.toISOString(),
      template: j.template,
    })),
    metrics: metricsSerialized,
    latestDiagnostics,
    iterationChains,
    vslWatches: vslWatches.map((v) => ({
      id: v.id,
      vslUrl: v.vslUrl,
      dropOffSeconds: v.dropOffSeconds,
      notes: v.notes,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    })),
    deliveredJobsForSelect,
    nicheOptions: Object.values(CreativeVaultNiche),
  })
}
