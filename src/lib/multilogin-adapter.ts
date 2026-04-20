/**
 * Integração com APIs locais AdsPower / Dolphin {anty}.
 * O cliente abre o antidetect no PC; o servidor só monta URLs e documenta o fluxo.
 */

export type MultiloginProvider = 'ads_power' | 'dolphin'

/** Padrão local; também comum: http://local.adspower.net:50325 — use ADSPOWER_LOCAL_API_URL. */
const ADSPOWER_DEFAULT = 'http://127.0.0.1:50325'
const DOLPHIN_DEFAULT = 'http://127.0.0.1:3001'

export function getLocalApiBase(provider: MultiloginProvider): string {
  if (provider === 'dolphin') {
    return process.env.DOLPHIN_LOCAL_API_URL?.trim() || DOLPHIN_DEFAULT
  }
  return process.env.ADSPOWER_LOCAL_API_URL?.trim() || ADSPOWER_DEFAULT
}

/**
 * URL típica para iniciar perfil via API local (AdsPower v1).
 * Dolphin varia por versão — ajuste DOLPHIN_LOCAL_API_URL conforme documentação.
 */
export function buildProfileStartUrl(provider: MultiloginProvider, externalProfileId: string): string {
  const base = getLocalApiBase(provider).replace(/\/$/, '')
  const id = encodeURIComponent(externalProfileId)
  if (provider === 'ads_power') {
    return `${base}/api/v1/browser/start?user_id=${id}`
  }
  return `${base}/browser_profiles/${id}/start`
}

export function multiloginClientInstructions(provider: MultiloginProvider): string {
  if (provider === 'ads_power') {
    return 'No PC com AdsPower aberto, a API local (porta 50325) pode iniciar o perfil. Configure ADSPOWER_LOCAL_API_URL se usar porta diferente.'
  }
  return 'No PC com Dolphin Anty, use a API local ou o botão "Abrir perfil" no app. Configure DOLPHIN_LOCAL_API_URL conforme a sua instalação.'
}
