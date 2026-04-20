/**
 * Heurísticas leves para auditoria de tráfego (UA + dispositivo).
 * Não são prova de intenção; servem para priorizar revisão humana.
 */

const AUTOMATION_SUBSTRINGS: { needle: string; label: string }[] = [
  { needle: 'Googlebot', label: 'User-Agent típico de crawler Google' },
  { needle: 'AdsBot-Google', label: 'User-Agent AdsBot-Google' },
  { needle: 'Mediapartners-Google', label: 'User-Agent Mediapartners-Google' },
  { needle: 'Google-InspectionTool', label: 'User-Agent Google-InspectionTool' },
  { needle: 'Chrome-Lighthouse', label: 'Chrome-Lighthouse / auditoria de performance' },
  { needle: 'Google Page Speed', label: 'Ferramenta de velocidade Google' },
  { needle: 'APIs-Google', label: 'APIs-Google' },
  { needle: 'GoogleProducer', label: 'GoogleProducer' },
]

export function automationHintFromUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent || !userAgent.trim()) return null
  const ua = userAgent
  for (const { needle, label } of AUTOMATION_SUBSTRINGS) {
    if (ua.includes(needle)) return label
  }
  return null
}

export function parseDeviceAndBrowser(userAgent: string | null | undefined): {
  deviceCategory: string
  browserFamily: string
} {
  if (!userAgent || !userAgent.trim()) {
    return { deviceCategory: 'desconhecido', browserFamily: 'desconhecido' }
  }
  const u = userAgent.toLowerCase()

  let deviceCategory = 'desktop'
  if (/ipad|tablet|playbook|silk/.test(u) || (/android/.test(u) && !/mobile/.test(u))) {
    deviceCategory = 'tablet'
  } else if (/mobile|iphone|ipod|android.*mobile|webos|blackberry|opera mini|iemobile/.test(u)) {
    deviceCategory = 'mobile'
  }

  let browserFamily = 'Outro'
  if (/edg\//.test(u) || /\bedge\//.test(u)) browserFamily = 'Edge'
  else if (/opr\//.test(u) || /opera/.test(u)) browserFamily = 'Opera'
  else if (/firefox\//.test(u)) browserFamily = 'Firefox'
  else if (/safari\//.test(u) && !/chrome|chromium|crios|android/.test(u)) browserFamily = 'Safari'
  else if (/chrome\//.test(u) || /crios\//.test(u) || /chromium\//.test(u)) browserFamily = 'Chrome'

  return { deviceCategory, browserFamily }
}

export function countryCodeToFlagEmoji(country: string | null | undefined): string {
  if (!country || country.length !== 2) return '—'
  const cc = country.toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return '—'
  const A = 0x1f1e6
  const chars = [...cc].map((c) => A + (c.charCodeAt(0) - 65))
  return String.fromCodePoint(...chars)
}

/** Alerta curto para a UI de auditoria (heurística de UA, não prova de intenção). */
export function auditStyleAlertFromUa(userAgent: string | null | undefined): string | null {
  if (!userAgent || !userAgent.trim()) return null
  if (userAgent.includes('Google-InspectionTool') || userAgent.includes('Chrome-Lighthouse')) {
    return 'Provável Auditor Manual Detectado — User-Agent de inspeção/Lighthouse.'
  }
  if (/Googlebot|AdsBot-Google|Mediapartners-Google|APIs-Google/i.test(userAgent)) {
    return 'User-Agent compatível com bot/crawler Google — rever intenção do clique.'
  }
  if (automationHintFromUserAgent(userAgent)) {
    return 'Assinatura de automatismo conhecida no User-Agent.'
  }
  return null
}
