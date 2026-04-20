import { hostFromHttpUrl } from './urls'

/**
 * Sugestões de higiene em URLs (não substitui auditoria humana nem políticas de anúncios).
 */
export function buildScriptHygieneHints(primaryUrl: string, secondaryUrl?: string | null): string[] {
  const hints: string[] = []
  const blob = `${primaryUrl}\n${secondaryUrl || ''}`.toLowerCase()

  if (/[?&](fbclid|gclid|msclkid|ttclid|wbraid|gbraid)=/i.test(blob)) {
    hints.push(
      'URLs contêm parâmetros de clique em anexo — evite partilhar estes links estáticos em criativos; use redirecionamentos rastreados.'
    )
  }
  if (/facebook\.com\/tr|google-analytics|googletagmanager|doubleclick|hotjar|fullstory/i.test(blob)) {
    hints.push('Verifique se domínios de terceiros na URL são necessários e estão atualizados na política de privacidade.')
  }
  if (/pixel|utm_|cid=|tid=/i.test(blob)) {
    hints.push('Confirme que identificadores em caminhos ou query não expõem dados sensíveis.')
  }
  const h1 = hostFromHttpUrl(primaryUrl)
  const h2 = secondaryUrl ? hostFromHttpUrl(secondaryUrl) : null
  if (h1 && h2 && h1 !== h2) {
    hints.push('Hosts diferentes entre destino principal e secundário — documente a relação entre ambos para a equipa.')
  }

  return hints
}

export function formatHygieneHints(hints: string[]): string {
  return hints.map((h) => `• ${h}`).join('\n')
}
