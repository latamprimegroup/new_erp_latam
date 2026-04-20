/**
 * AdsPower Local API — criação industrial de perfil (Módulo 02).
 * Base: http://local.adspower.net:50325 ou ADSPOWER_LOCAL_API_URL
 * Doc: https://localapi-doc-en.adspower.com/docs/XDhI2D
 */
import { getLocalApiBase } from '@/lib/multilogin-adapter'

export type AdsPowerUserProxyConfig = {
  proxy_type: 'http' | 'socks5'
  proxy_host: string
  proxy_port: string
  proxy_user?: string
  proxy_password?: string
  /** luminati | oxylabs | other */
  proxy_soft?: string
}

function industrialFingerprintConfig(): Record<string, unknown> {
  return {
    automatic_timezone: '1',
    canvas: '1',
    webgl_image: '1',
    webgl: '3',
    audio: '1',
    /** forward reduz vazamento WebRTC para o proxy; ajustável via ADSPOWER_FINGERPRINT_OVERRIDES_JSON */
    webrtc: 'forward',
    location_switch: '1',
    language_switch: '1',
    flash: 'block',
    scan_port_type: '1',
    random_ua: {
      ua_browser: ['chrome'],
      ua_system_version: ['Windows 10', 'Windows 11'],
    },
  }
}

/** JSON com chaves de fingerprint (ex.: webrtc, dns) conforme doc Local API AdsPower — merge superficial. */
function fingerprintOverridesFromEnv(): Record<string, unknown> {
  const raw = process.env.ADSPOWER_FINGERPRINT_OVERRIDES_JSON?.trim()
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function apiHeaders(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = process.env.ADSPOWER_API_KEY?.trim()
  if (key) {
    h.Authorization = `Bearer ${key}`
  }
  return h
}

/**
 * Cria perfil no AdsPower com fingerprint Windows + ruído Canvas/WebGL/Audio e TZ por IP.
 */
export async function createIndustrialProfile(input: {
  profileLabel: string
  email: string
  password: string
  twoFaKey?: string | null
  cookieJson?: string | null
  groupId: string
  userProxyConfig: AdsPowerUserProxyConfig
}): Promise<{ profileId: string; raw: unknown }> {
  const base = getLocalApiBase('ads_power').replace(/\/$/, '')
  const fingerprint_config = {
    ...industrialFingerprintConfig(),
    ...fingerprintOverridesFromEnv(),
  }

  const body: Record<string, unknown> = {
    name: input.profileLabel.slice(0, 100),
    domain_name: 'google.com',
    username: input.email,
    password: input.password,
    group_id: input.groupId,
    user_proxy_config: {
      proxy_type: input.userProxyConfig.proxy_type,
      proxy_host: input.userProxyConfig.proxy_host,
      proxy_port: String(input.userProxyConfig.proxy_port),
      proxy_user: input.userProxyConfig.proxy_user || '',
      proxy_password: input.userProxyConfig.proxy_password || '',
      proxy_soft: input.userProxyConfig.proxy_soft || 'other',
    },
    fingerprint_config,
  }

  if (input.twoFaKey?.trim()) {
    body.fakey = input.twoFaKey.trim()
  }
  if (input.cookieJson?.trim()) {
    body.cookie = input.cookieJson.trim()
  }

  const res = await fetch(`${base}/api/v1/user/create`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  })

  const j = (await res.json()) as { code?: number; data?: { id?: string }; msg?: string }
  if (!res.ok || j.code !== 0 || !j.data?.id) {
    throw new Error(j.msg || `AdsPower create falhou (HTTP ${res.status})`)
  }

  return { profileId: String(j.data.id), raw: j }
}

/** Inicia browser; retorna WebSocket Puppeteer quando disponível. */
export async function startAdsPowerBrowser(userId: string): Promise<{ wsPuppeteer: string | null; raw: unknown }> {
  const base = getLocalApiBase('ads_power').replace(/\/$/, '')
  const headless =
    process.env.GEO_PROVISION_HEADLESS === '1' || process.env.GEO_PROVISION_HEADLESS === 'true'
  const qs = new URLSearchParams({ user_id: userId })
  if (headless) qs.set('headless', '1')

  const res = await fetch(`${base}/api/v1/browser/start?${qs.toString()}`, {
    headers: apiHeaders(),
  })
  const j = (await res.json()) as {
    code?: number
    data?: { ws?: { puppeteer?: string }; puppeteer?: string }
    msg?: string
  }
  if (j.code !== 0) {
    throw new Error(j.msg || 'AdsPower start browser falhou')
  }
  const ws =
    j.data?.ws?.puppeteer ||
    (typeof j.data?.puppeteer === 'string' ? j.data.puppeteer : null) ||
    null
  return { wsPuppeteer: ws, raw: j }
}

export async function stopAdsPowerBrowser(userId: string): Promise<void> {
  const base = getLocalApiBase('ads_power').replace(/\/$/, '')
  await fetch(`${base}/api/v1/browser/stop?user_id=${encodeURIComponent(userId)}`, {
    headers: apiHeaders(),
  })
}

export async function checkAdsPowerLocalApi(): Promise<boolean> {
  const base = getLocalApiBase('ads_power').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/status`, { cache: 'no-store' })
    const j = (await res.json()) as { code?: number }
    return j.code === 0
  } catch {
    return false
  }
}
