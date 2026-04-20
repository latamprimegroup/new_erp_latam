const DOMAIN_SHARE_WARN = 3
const PROXY_SHARE_WARN = 3

export type ShareMaps = {
  domainCounts: Map<string, number>
  proxyCounts: Map<string, number>
}

export function buildShareMaps(
  rows: { domainHost: string; proxyHostKey: string | null; status: string }[]
): ShareMaps {
  const domainCounts = new Map<string, number>()
  const proxyCounts = new Map<string, number>()
  for (const r of rows) {
    if (r.status !== 'ACTIVE') continue
    domainCounts.set(r.domainHost, (domainCounts.get(r.domainHost) || 0) + 1)
    const pk = r.proxyHostKey?.trim()
    if (pk) {
      proxyCounts.set(pk, (proxyCounts.get(pk) || 0) + 1)
    }
  }
  return { domainCounts, proxyCounts }
}

export function contaminationHints(opts: {
  domainHost: string
  proxyHostKey: string | null
  maps: ShareMaps
}): string[] {
  const hints: string[] = []
  const dc = opts.maps.domainCounts.get(opts.domainHost) || 0
  if (dc >= DOMAIN_SHARE_WARN) {
    hints.push('Muitas campanhas ativas no mesmo domínio — reveja isolamento.')
  }
  const pk = opts.proxyHostKey?.trim()
  if (pk) {
    const pc = opts.maps.proxyCounts.get(pk) || 0
    if (pc >= PROXY_SHARE_WARN) {
      hints.push('Mesmo proxy associado a várias campanhas ativas — risco de correlação operacional.')
    }
  }
  return hints
}

/** Discrepância de atribuição (GCLID) — heurística interna, sem alegar “auditoria Google”. */
export function gclidAttributionHint(opts: {
  gclidTrackingRequired: boolean
  clickTotal: number
  gclidCaptured: number
}): string | null {
  const { gclidTrackingRequired, clickTotal, gclidCaptured } = opts
  if (clickTotal < 8) return null
  const ratio = gclidCaptured / Math.max(1, clickTotal)
  if (gclidTrackingRequired && ratio < 0.35) {
    return 'GCLID obrigatório: taxa de captura baixa face aos cliques — rever postback S2S / tagging.'
  }
  if (!gclidTrackingRequired && ratio < 0.2) {
    return 'Muitos cliques sem GCLID capturado — confirmar parâmetros de clique e integrações.'
  }
  return null
}
