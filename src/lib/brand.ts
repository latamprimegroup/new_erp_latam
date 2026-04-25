/**
 * Ads Ativos Global — Constantes de Branding Centralizadas
 *
 * Todas as comunicações de saída do War Room OS devem usar estas constantes.
 * Nunca hardcode o nome da marca em strings espalhadas pelo código.
 */

export const BRAND = {
  name:       'Ads Ativos Global',
  nameShort:  'Ads Ativos',
  taglinePT:  'A maior contingência Global de infraestrutura de tráfego.',
  taglineEN:  "The World's Largest Contingency Infrastructure.",
  email:      process.env.EMAIL_FROM ?? 'Ads Ativos Global <noreply@adsativos.com>',
  supportWA:  process.env.NEXT_PUBLIC_WA_SUPPORT_NUMBER ?? '',
  domain:     process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? 'https://adsativos.com',
  storeDomain: process.env.NEXT_PUBLIC_STORE_URL ?? 'https://adsativos.store',
  dashboardPath: '/dashboard',
  rmaPath:       '/dashboard/suporte/registrar-queda',
  /** Emoji padrão que representa a marca */
  shield:     '🛡️',
} as const

/** Detecta o idioma preferido com base no DDI do número de telefone.
 *  +55 → português (BR) · qualquer outro DDI → inglês */
export function detectLanguage(phone: string): 'pt' | 'en' {
  const digits = phone.replace(/\D/g, '')
  // Considera BR se começa com 55 e tem 12-13 dígitos (55 + DDD + número)
  return digits.startsWith('55') && digits.length >= 12 ? 'pt' : 'en'
}

/** Formata data no locale correto */
export function formatDate(date: Date, lang: 'pt' | 'en'): string {
  return date.toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}
