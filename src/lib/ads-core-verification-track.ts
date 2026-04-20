/** Códigos persistidos em `AdsCoreAsset.verificationTrack` (alinhado ao enum Prisma). */
export type AdsCoreVerificationTrackCode = 'G2_ANUNCIANTE' | 'ANUNCIANTE_COMERCIAL'

export const ADS_CORE_VERIFICATION_TRACK_LABELS: Record<AdsCoreVerificationTrackCode, string> = {
  G2_ANUNCIANTE: 'G2 + Verificação de Anunciante',
  ANUNCIANTE_COMERCIAL: 'Verificação de Anunciante + Operações Comerciais',
}

/** Aceita código enum, CSV abreviado ou trechos da frase da especificação. */
export function parseAdsCoreVerificationTrack(raw?: string | null): AdsCoreVerificationTrackCode {
  const s = (raw ?? '').toUpperCase().trim()
  if (!s) return 'G2_ANUNCIANTE'
  if (s === 'ANUNCIANTE_COMERCIAL' || s.includes('OPERACOES') || s.includes('OPERAÇÕES') || s.includes('COMERCIAL')) {
    return 'ANUNCIANTE_COMERCIAL'
  }
  if (s === 'G2_ANUNCIANTE' || s.startsWith('G2')) return 'G2_ANUNCIANTE'
  return 'G2_ANUNCIANTE'
}

export function labelVerificationTrack(t?: string | null): string {
  if (t === 'ANUNCIANTE_COMERCIAL' || t === 'G2_ANUNCIANTE') {
    return ADS_CORE_VERIFICATION_TRACK_LABELS[t]
  }
  return ADS_CORE_VERIFICATION_TRACK_LABELS.G2_ANUNCIANTE
}
