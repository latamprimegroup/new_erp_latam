import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { TrafficShieldSpyBlockKind } from '@prisma/client'
import { DATACENTER_ASN_HINTS, uniqueAsns } from './datacenter-asns'
import { DEFAULT_SPY_USER_AGENT_SUBSTRINGS } from './spy-defaults'
import { getOrCreateTrafficShieldSettings } from './settings-store'

export type TrafficShieldEdgePayload = {
  version: 1
  generatedAt: string
  policy: {
    blockDatacenterAsns: boolean
    requireClickIdParam: boolean
    pushEnvironmentHints: boolean
    datacenterAsnList: number[]
    /** Módulo 12: o edge deve bloquear pedidos cujo User-Agent contenha (case-insensitive) alguma destas substrings. */
    spyToolBlockingEnabled: boolean
  }
  blockedAddresses: string[]
  /** Substrings de UA (ferramentas de espionagem + lista personalizada). */
  blockedUserAgentSubstrings: string[]
}

function mergeUniqueCidrs(base: string[], extra: string[]): string[] {
  const set = new Set<string>()
  for (const s of base) {
    const t = s.trim()
    if (t) set.add(t)
  }
  for (const s of extra) {
    const t = s.trim()
    if (t) set.add(t)
  }
  return [...set]
}

function normalizeUaSubstrings(raw: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of raw) {
    const t = s.trim().slice(0, 300).toLowerCase()
    if (t.length < 2 || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

export async function buildTrafficShieldEdgePayload(): Promise<TrafficShieldEdgePayload> {
  const settings = await getOrCreateTrafficShieldSettings()
  const blocks = await prisma.trafficShieldIpBlock.findMany({
    where: { active: true },
    select: { cidrOrIp: true },
  })
  const spyBlocks = settings.enableSpyToolBlocking
    ? await prisma.trafficShieldSpyBlock.findMany({
        where: { active: true },
        select: { kind: true, pattern: true },
      })
    : []

  const spyIps = spyBlocks
    .filter((b) => b.kind === TrafficShieldSpyBlockKind.IP_CIDR)
    .map((b) => b.pattern.trim())
    .filter(Boolean)
  const customUas = spyBlocks
    .filter((b) => b.kind === TrafficShieldSpyBlockKind.USER_AGENT_SUBSTRING)
    .map((b) => b.pattern.trim())
    .filter(Boolean)

  const spyUaList = settings.enableSpyToolBlocking
    ? normalizeUaSubstrings([...DEFAULT_SPY_USER_AGENT_SUBSTRINGS, ...customUas])
    : []

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    policy: {
      blockDatacenterAsns: settings.blockDatacenterAsns,
      requireClickIdParam: settings.requireClickIdParam,
      pushEnvironmentHints: settings.pushEnvironmentHints,
      datacenterAsnList: settings.blockDatacenterAsns ? uniqueAsns(DATACENTER_ASN_HINTS) : [],
      spyToolBlockingEnabled: settings.enableSpyToolBlocking,
    },
    blockedAddresses: mergeUniqueCidrs(
      blocks.map((b) => b.cidrOrIp.trim()).filter(Boolean),
      spyIps,
    ),
    blockedUserAgentSubstrings: spyUaList,
  }
}

/**
 * Envia configuração ao edge. URL: `settings.edgeWebhookUrl` ou `TRAFFIC_SHIELD_EDGE_WEBHOOK_URL` (.env).
 */
export async function pushTrafficShieldConfigToEdge(): Promise<{ ok: boolean; skipped: boolean; error?: string }> {
  const settings = await getOrCreateTrafficShieldSettings()
  const url = (settings.edgeWebhookUrl?.trim() || process.env.TRAFFIC_SHIELD_EDGE_WEBHOOK_URL?.trim()) ?? ''
  if (!url) {
    await prisma.trafficShieldSettings.update({
      where: { id: 'default' },
      data: {
        lastPushAt: new Date(),
        lastPushOk: false,
        lastPushError: 'Webhook não configurado (URL vazia).',
      },
    })
    return { ok: false, skipped: true, error: 'no_webhook_url' }
  }

  const payload = await buildTrafficShieldEdgePayload()
  const body = JSON.stringify(payload)
  const secret = process.env.TRAFFIC_SHIELD_EDGE_SECRET?.trim()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'AdsAtivosTrafficShield/1.0',
  }
  if (secret) {
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
    headers['X-Traffic-Shield-Signature'] = `sha256=${sig}`
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    })
    const ok = res.ok
    const errText = ok ? null : (await res.text().catch(() => '')).slice(0, 500)
    await prisma.trafficShieldSettings.update({
      where: { id: 'default' },
      data: {
        lastPushAt: new Date(),
        lastPushOk: ok,
        lastPushError: ok ? null : errText || `HTTP ${res.status}`,
      },
    })
    return ok ? { ok: true, skipped: false } : { ok: false, skipped: false, error: errText || `HTTP ${res.status}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch failed'
    await prisma.trafficShieldSettings.update({
      where: { id: 'default' },
      data: {
        lastPushAt: new Date(),
        lastPushOk: false,
        lastPushError: msg.slice(0, 500),
      },
    })
    return { ok: false, skipped: false, error: msg }
  }
}
