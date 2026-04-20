import { prisma } from '@/lib/prisma'

export const WAR_ROOM_LIVE_CONFIG_KEY = 'war_room_live_config'
export const MENTORADO_SECURITY_INCIDENT_KEY = 'mentorado_security_incident'
export const WAR_ROOM_CONCIERGE_LINKS_KEY = 'war_room_concierge_links'

export type WarRoomLiveConfig = {
  mode: 'youtube' | 'zoom' | 'custom' | 'none'
  /** iframe src (YouTube embed) ou página intermédia */
  embedUrl?: string
  /** Link para abrir Zoom / Meet */
  joinUrl?: string
  schedule: Array<{ title: string; time: string; host?: string }>
}

export type SecurityIncidentPayload = {
  active: boolean
  title: string
  body: string
  videoUrl?: string
}

export type ConciergeLinks = {
  infra?: string
  contingencia?: string
  estrategia?: string
}

const DEFAULT_LIVE: WarRoomLiveConfig = {
  mode: 'none',
  schedule: [
    { title: 'Plantão de contingência', time: '14h–18h (horário de Brasília)', host: 'Gustavo / equipa' },
  ],
}

export function parseWarRoomLiveConfig(raw: string | null | undefined): WarRoomLiveConfig {
  if (!raw?.trim()) return DEFAULT_LIVE
  try {
    const j = JSON.parse(raw) as Partial<WarRoomLiveConfig>
    return {
      mode: j.mode === 'youtube' || j.mode === 'zoom' || j.mode === 'custom' ? j.mode : 'none',
      embedUrl: typeof j.embedUrl === 'string' ? j.embedUrl : undefined,
      joinUrl: typeof j.joinUrl === 'string' ? j.joinUrl : undefined,
      schedule: Array.isArray(j.schedule) && j.schedule.length
        ? j.schedule.map((s) => ({
            title: String(s.title || 'Sessão'),
            time: String(s.time || ''),
            host: s.host ? String(s.host) : undefined,
          }))
        : DEFAULT_LIVE.schedule,
    }
  } catch {
    return DEFAULT_LIVE
  }
}

export function parseSecurityIncident(raw: string | null | undefined): SecurityIncidentPayload | null {
  if (!raw?.trim()) return null
  try {
    const j = JSON.parse(raw) as Partial<SecurityIncidentPayload>
    if (!j.active) return null
    return {
      active: true,
      title: String(j.title || 'Manutenção de segurança'),
      body: String(j.body || ''),
      videoUrl: typeof j.videoUrl === 'string' ? j.videoUrl : undefined,
    }
  } catch {
    return null
  }
}

export function parseConciergeLinks(raw: string | null | undefined): ConciergeLinks {
  if (!raw?.trim()) return {}
  try {
    const j = JSON.parse(raw) as ConciergeLinks
    return {
      infra: typeof j.infra === 'string' ? j.infra : undefined,
      contingencia: typeof j.contingencia === 'string' ? j.contingencia : undefined,
      estrategia: typeof j.estrategia === 'string' ? j.estrategia : undefined,
    }
  } catch {
    return {}
  }
}

export async function getWarRoomLiveConfig(): Promise<WarRoomLiveConfig> {
  const row = await prisma.systemSetting.findUnique({ where: { key: WAR_ROOM_LIVE_CONFIG_KEY } })
  return parseWarRoomLiveConfig(row?.value)
}

export async function getSecurityIncident(): Promise<SecurityIncidentPayload | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: MENTORADO_SECURITY_INCIDENT_KEY } })
  return parseSecurityIncident(row?.value)
}

export async function getConciergeLinksMerged(): Promise<ConciergeLinks> {
  const row = await prisma.systemSetting.findUnique({ where: { key: WAR_ROOM_CONCIERGE_LINKS_KEY } })
  const db = parseConciergeLinks(row?.value)
  return {
    infra: db.infra || process.env.NEXT_PUBLIC_CONCIERGE_INFRA_URL?.trim(),
    contingencia: db.contingencia || process.env.NEXT_PUBLIC_CONCIERGE_CONTINGENCIA_URL?.trim(),
    estrategia: db.estrategia || process.env.NEXT_PUBLIC_CONCIERGE_ESTRATEGIA_URL?.trim(),
  }
}
