import { describe, it, expect } from 'vitest'
import { brtDayBoundsUtc, resolveCampaignAttributionLabel } from '@/lib/roi-crm-queries'

describe('brtDayBoundsUtc', () => {
  it('mapeia um dia civil BRT para intervalo UTC inclusivo (UTC−3)', () => {
    const { from, to } = brtDayBoundsUtc('2026-03-07')
    expect(from.toISOString()).toBe('2026-03-07T03:00:00.000Z')
    expect(to.getTime() - from.getTime()).toBe(86_400_000 - 1)
  })

  it('rejeita data sem partes numéricas válidas', () => {
    expect(() => brtDayBoundsUtc('not-valid')).toThrow('Data inválida')
  })
})

describe('resolveCampaignAttributionLabel', () => {
  it('prioriza roiAttributionCampaign', () => {
    expect(
      resolveCampaignAttributionLabel('Campanha X', { utmCampaign: 'outra', campaignName: null, utmSource: 'google' })
    ).toBe('Campanha X')
  })

  it('usa utmCampaign do lead quando perfil vazio', () => {
    expect(
      resolveCampaignAttributionLabel(null, { utmCampaign: 'Search_Brand', campaignName: null, utmSource: 'google' })
    ).toBe('Search_Brand')
  })

  it('retorna Não atribuído sem dados', () => {
    expect(resolveCampaignAttributionLabel(null, null)).toBe('Não atribuído')
  })
})
