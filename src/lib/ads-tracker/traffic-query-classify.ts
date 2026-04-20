/**
 * Classifica tráfego a partir da querystring (útil para métricas e pré-visualização do builder).
 * Não substitui relatórios do Google Ads.
 */

export type TrafficAttributionKind = 'paid_google' | 'paid_other' | 'organic' | 'direct'

export function classifyQueryString(searchParams: URLSearchParams): TrafficAttributionKind {
  const g = searchParams.get('gclid')
  const gb = searchParams.get('gbraid')
  const wb = searchParams.get('wbraid')
  if (g || gb || wb) return 'paid_google'

  if (searchParams.get('msclkid')) return 'paid_other'
  if (searchParams.get('fbclid')) return 'paid_other'
  if (searchParams.get('ttclid')) return 'paid_other'

  const med = (searchParams.get('utm_medium') || '').toLowerCase()
  if (med && /cpc|ppc|paid|display|discovery|pmax|shopping/i.test(med)) return 'paid_other'

  if (searchParams.get('utm_source') || searchParams.get('utm_campaign')) return 'organic'
  return 'direct'
}

export function attributionKindLabel(k: TrafficAttributionKind): string {
  switch (k) {
    case 'paid_google':
      return 'Pago — Google Ads (GCLID / parallel tracking)'
    case 'paid_other':
      return 'Pago — outra rede'
    case 'organic':
      return 'Orgânico / etiquetado (sem click id de anúncio)'
    case 'direct':
      return 'Direto / sem parâmetros de campanha'
    default:
      return k
  }
}
