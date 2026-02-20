/**
 * Geração de estrutura Google Ads via IA
 */
import { buildGoogleAdsPrompt } from './google-ads-prompt'
import type { BriefingForAds } from './google-ads-prompt'

const OPENAI_API = process.env.OPENAI_API_KEY
const ANTHROPIC_API = process.env.ANTHROPIC_API_KEY

async function callOpenAI(prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8000,
      temperature: 0.5,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI: ${res.status} - ${err}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

async function callAnthropic(prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic: ${res.status} - ${err}`)
  }
  const data = (await res.json()) as { content?: { text?: string }[] }
  return data.content?.[0]?.text ?? ''
}

function buildFallbackStructure(briefing: BriefingForAds): string {
  const nome = briefing.nomeFantasia || briefing.nomeEmpresa || briefing.nicho
  const servicos = briefing.servicos.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean)
  const primeiroServico = servicos[0] || briefing.nicho

  const headlines: string[] = [
    `${primeiroServico} ${briefing.cidade}`,
    `${nome} em ${briefing.cidade}`,
    `Serviço ${briefing.nicho}`,
    `Especialista ${briefing.nicho}`,
    `${primeiroServico} perto de mim`,
    `Contrate ${primeiroServico}`,
    `${nome} - ${briefing.cidade}`,
    `Atendimento ${briefing.cidade}`,
    `Profissional ${briefing.nicho}`,
    `Empresa ${briefing.nicho}`,
  ].map((h) => h.slice(0, 30))

  const descricoes = [
    `Entre em contato. Atendimento em ${briefing.cidade}. Fale conosco e solicite um orçamento.`,
    `${nome} - serviços de ${briefing.nicho} na região. Solicite atendimento.`,
    `Profissionais especializados em ${briefing.nicho}. Atendemos ${briefing.cidade}. Fale conosco.`,
    `Solicite orçamento para ${primeiroServico}. Atendimento em ${briefing.cidade}.`,
  ].map((d) => d.slice(0, 90))

  return `1️⃣ CAMPANHAS
- Campanha 1: ${primeiroServico} + ${briefing.cidade}
- Campanha 2: Serviços Secundários + ${briefing.cidade}
- Campanha 3: Marca - ${nome}

2️⃣ GRUPOS DE ANÚNCIOS
- Grupo: ${primeiroServico} ${briefing.cidade}
- Grupo: ${briefing.nicho} perto de mim

3️⃣ PALAVRAS-CHAVE (exemplos)
- "${primeiroServico} ${briefing.cidade}"
- [${primeiroServico} ${briefing.cidade}]
- "${primeiroServico} perto de mim"

4️⃣ PALAVRAS-CHAVE NEGATIVAS
gratuito, curso, emprego, vagas, como fazer, tutorial, PDF, reclamação, DIY, download

5️⃣ HEADLINES (exemplos, máx 30 chars)
${headlines.map((h) => `- ${h}`).join('\n')}

6️⃣ DESCRIÇÕES (máx 90 chars)
${descricoes.map((d) => `- ${d}`).join('\n')}

7️⃣ EXTENSÕES
- Chamada: ${briefing.whatsapp || briefing.telefone || 'Configure no painel'}
- Sitelinks: Serviços, Contato, Sobre`
}

export async function generateGoogleAdsStructure(briefing: BriefingForAds): Promise<string> {
  const prompt = buildGoogleAdsPrompt(briefing)

  if (OPENAI_API) {
    return callOpenAI(prompt)
  }
  if (ANTHROPIC_API) {
    return callAnthropic(prompt)
  }

  return buildFallbackStructure(briefing)
}
