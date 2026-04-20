import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import {
  cfCleanConflictingRootRecords,
  cfCreateARecord,
  cfEnsureZone,
  cfSetAlwaysHttps,
  cfSetSslStrict,
} from '@/lib/cloudflare-dns'
import { buildLanderHtml } from '@/lib/provisioning-templates'
import { notifyProvisioningServer } from '@/lib/provisioning-server'

export function normalizeProvisionDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase()
  s = s.replace(/^https?:\/\//, '')
  s = s.split(/[/?#]/)[0] || ''
  s = s.replace(/^www\./, '')
  if (s.length < 4 || s.length > 253) return null
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(s)) return null
  return s
}

export function videoVariantHash(domain: string, batchId: string, itemId: string): string {
  return createHash('md5').update(`${domain}:${batchId}:${itemId}`).digest('hex')
}

export async function processDomainProvisionItem(itemId: string): Promise<void> {
  const item = await prisma.domainProvisionItem.findUnique({
    where: { id: itemId },
    include: { batch: true },
  })
  if (!item || item.registrarStatus !== 'PENDING') return

  const domain = item.domain
  const batch = item.batch
  const hash = videoVariantHash(domain, batch.id, item.id)
  const lines: string[] = []
  const log = (msg: string) => lines.push(`[${new Date().toISOString()}] ${msg}`)

  await prisma.domainProvisionItem.update({
    where: { id: itemId },
    data: {
      videoVariantHash: hash,
      publicUrl: `https://${domain}`,
      lastError: null,
    },
  })

  const hasCf = !!process.env.CLOUDFLARE_API_TOKEN?.trim()

  if (!hasCf) {
    log('Cloudflare: SKIPPED (sem CLOUDFLARE_API_TOKEN) — configure o token para zona DNS automática.')
    await prisma.domainProvisionItem.update({
      where: { id: itemId },
      data: {
        registrarStatus: 'SKIPPED',
        cloudflareStatus: 'SKIPPED',
        lastError: null,
        logs: lines.join('\n'),
      },
    })
  } else {
    try {
      log('Cloudflare: criando/recuperando zona…')
      const zone = await cfEnsureZone(domain)
      log(`Zona ${zone.id} status=${zone.status}`)
      await prisma.domainProvisionItem.update({
        where: { id: itemId },
        data: { cloudflareZoneId: zone.id, registrarStatus: 'OK' },
      })

      const removed = await cfCleanConflictingRootRecords(zone.id, domain)
      if (removed) log(`Removidos ${removed} registro(s) conflitantes no apex`)
      await cfCreateARecord(zone.id, domain, batch.targetServerIp, true)
      log(`DNS: A → ${batch.targetServerIp} (proxied)`)
      await cfSetSslStrict(zone.id)
      await cfSetAlwaysHttps(zone.id)
      log('SSL strict + Always HTTPS')
      await prisma.domainProvisionItem.update({
        where: { id: itemId },
        data: { cloudflareStatus: 'OK', logs: lines.join('\n') },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro Cloudflare'
      log(`ERRO: ${msg}`)
      await prisma.domainProvisionItem.update({
        where: { id: itemId },
        data: {
          registrarStatus: 'FAILED',
          cloudflareStatus: 'FAILED',
          serverStatus: 'SKIPPED',
          lastError: msg,
          logs: lines.join('\n'),
        },
      })
      return
    }
  }

  const lines2 = [...lines]
  const log2 = (msg: string) => lines2.push(`[${new Date().toISOString()}] ${msg}`)

  try {
    const html = buildLanderHtml(batch.templateKey, domain, {
      metaPixelId: batch.metaPixelId,
      videoVariantHash: hash,
    })
    log2('Servidor: enviando webhook / template…')
    const r = await notifyProvisioningServer({
      domain,
      templateKey: batch.templateKey,
      html,
      metaPixelId: batch.metaPixelId,
      videoVariantHash: hash,
      batchId: batch.id,
      itemId: item.id,
    })
    log2(r.message)
    await prisma.domainProvisionItem.update({
      where: { id: itemId },
      data: {
        serverStatus: r.skipped ? 'SKIPPED' : r.ok ? 'OK' : 'FAILED',
        lastError: r.ok ? null : r.message,
        logs: lines2.join('\n'),
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro servidor'
    log2(`ERRO server: ${msg}`)
    await prisma.domainProvisionItem.update({
      where: { id: itemId },
      data: {
        serverStatus: 'FAILED',
        lastError: msg,
        logs: lines2.join('\n'),
      },
    })
  }
}

export async function runProvisionStep(batchId: string, concurrency: number): Promise<{
  processed: number
  remaining: number
}> {
  const pending = await prisma.domainProvisionItem.findMany({
    where: { batchId, registrarStatus: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: concurrency,
    select: { id: true },
  })

  if (pending.length === 0) {
    await prisma.domainProvisionBatch.update({
      where: { id: batchId },
      data: { status: 'DONE' },
    })
    return { processed: 0, remaining: 0 }
  }

  await Promise.all(pending.map((p) => processDomainProvisionItem(p.id)))

  const remaining = await prisma.domainProvisionItem.count({
    where: { batchId, registrarStatus: 'PENDING' },
  })

  await prisma.domainProvisionBatch.update({
    where: { id: batchId },
    data: { status: remaining === 0 ? 'DONE' : 'RUNNING' },
  })

  return { processed: pending.length, remaining }
}
