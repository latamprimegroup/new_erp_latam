import type { BriefingForAds } from './google-ads-prompt'

export type AdsBlock = {
  campaign: string
  adGroup: string
  keywordsPhrase: string[]
  keywordsExact: string[]
  negatives: string[]
  headlines: string[]
  descriptions: string[]
}

export function generateGoogleAdsStructured(briefing: BriefingForAds): {
  blocks: AdsBlock[]
  complianceWarnings: string[]
} {
  const service = briefing.servicos.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean)[0] || briefing.nicho
  const city = briefing.cidade
  const brand = briefing.nomeFantasia || briefing.nomeEmpresa || briefing.nicho
  const baseNegatives = ['gratis', 'curso', 'emprego', 'vagas', 'pdf', 'download', 'como fazer', 'reclamacao']

  const headlinesBase = [
    `${service} em ${city}`,
    `${brand} ${city}`,
    `${service} com suporte`,
    `Atendimento em ${city}`,
    `${service} para empresas`,
    `Fale com especialista`,
    `Equipe profissional`,
    `${service} com qualidade`,
    `${service} local`,
    `${brand} oficial`,
    `Solicite seu atendimento`,
    `Atendimento rapido`,
    `Suporte consultivo`,
    `${service} confiavel`,
    `Agende agora`,
  ].map((h) => h.slice(0, 30))

  const descriptions = [
    `Atendimento profissional em ${city}. Solicite contato e saiba como podemos ajudar.`.slice(0, 90),
    `${brand} oferece ${service} com foco em qualidade e transparencia.`.slice(0, 90),
    `Fale com nossa equipe e receba orientacao para sua necessidade.`.slice(0, 90),
    `Solicite proposta sem promessas irreais, com abordagem institucional.`.slice(0, 90),
  ]

  const mkBlock = (name: string, term: string): AdsBlock => ({
    campaign: `Search | ${service} | ${name} | ${city}`,
    adGroup: `${term} | ${city}`,
    keywordsPhrase: [`"${term} ${city}"`, `"${term} perto de mim"`, `"${term} ${briefing.estado}"`],
    keywordsExact: [`[${term} ${city}]`, `[${term} ${briefing.estado}]`, `[${term} local]`],
    negatives: baseNegatives,
    headlines: headlinesBase,
    descriptions,
  })

  return {
    blocks: [
      mkBlock('Prospeccao', service),
      mkBlock('Marca', brand),
      mkBlock('Conversao', `${service} especializado`),
      mkBlock('Defesa', `${service} oficial`),
    ],
    complianceWarnings: [
      'Evite superlativos absolutos (ex.: melhor do Brasil) sem prova objetiva.',
      'Nao use promessas garantidas de resultado financeiro ou medico.',
      'Mantenha CNPJ/endereco/contato reais e politicas legais no site.',
    ],
  }
}
