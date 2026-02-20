/**
 * Prompt para Estrutura Google Ads - Rede de Pesquisa
 * Campanhas, Grupos, Palavras-chave, Anúncios RSA, Extensões
 */
export type BriefingForAds = {
  nomeEmpresa: string
  nomeFantasia?: string | null
  nicho: string
  subnicho?: string | null
  cidade: string
  estado: string
  servicos: string
  diferenciais?: string | null
  anosExperiencia?: number | null
  objetivo?: string | null
  telefone?: string | null
  whatsapp?: string | null
}

const OBJETIVO_LABELS: Record<string, string> = {
  LIGACOES: 'Ligação',
  WHATSAPP: 'WhatsApp',
  ORCAMENTO: 'Orçamento',
  AGENDAMENTO: 'Agendamento',
  PRESENCIAL: 'Atendimento presencial',
  OUTRO: 'Conversão',
}

export function buildGoogleAdsPrompt(briefing: BriefingForAds): string {
  const nome = briefing.nomeFantasia || briefing.nomeEmpresa || briefing.nicho
  const servicosList = briefing.servicos
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const servicosBlock = servicosList.length > 0 ? servicosList.map((s) => `- ${s}`).join('\n  ') : '- Não especificado'
  const objetivoLabel = briefing.objetivo ? OBJETIVO_LABELS[briefing.objetivo] || briefing.objetivo : 'Contato'
  const contato = briefing.whatsapp || briefing.telefone || 'Não informado'

  return `Você é uma IA Sênior especialista em Google Ads, com mais de 20 anos de experiência em campanhas de pesquisa para negócios locais, Quality Score, políticas de publicidade e conversão.

Crie uma ESTRUTURA COMPLETA DE GOOGLE ADS – REDE DE PESQUISA, totalmente compatível com as políticas do Google Ads, focada em alta intenção, relevância local e conversão.

━━━━━━━━━━━━━━━━━━━━━━
📌 DADOS DO NEGÓCIO
━━━━━━━━━━━━━━━━━━━━━━
• Nome da empresa: ${briefing.nomeEmpresa || nome}
• Nicho principal: ${briefing.nicho}
• Subnicho: ${briefing.subnicho || 'N/A'}
• Cidade: ${briefing.cidade}
• Estado: ${briefing.estado}
• Serviços principais:
  ${servicosBlock}
• Diferenciais: ${briefing.diferenciais || 'Atendimento local, profissionalismo'}
• Anos de experiência: ${briefing.anosExperiencia ?? 'N/A'}
• Objetivo do anúncio: ${objetivoLabel}
• Telefone/WhatsApp: ${contato}

━━━━━━━━━━━━━━━━━━━━━━
⚠️ REGRAS ABSOLUTAS (NÃO VIOLAR)
━━━━━━━━━━━━━━━━━━━━━━
- NÃO prometer resultados garantidos
- NÃO usar termos absolutos (100%, garantido, imediato, o melhor)
- NÃO mencionar preços sem contexto
- NÃO comparar com concorrentes
- NÃO usar linguagem sensacionalista
- NÃO usar emojis, exclamações excessivas ou linguagem apelativa
- Linguagem profissional, local, informativa e clara

━━━━━━━━━━━━━━━━━━━━━━
🎯 ENTREGA OBRIGATÓRIA
━━━━━━━━━━━━━━━━━━━━━━

Entregue TUDO em texto estruturado, organizado nas seções abaixo. Use a cidade "${briefing.cidade}" em headlines e descrições quando fizer sentido.

1️⃣ CAMPANHAS
- Campanha 1: Serviço Principal + ${briefing.cidade}
- Campanha 2: Serviços Secundários + ${briefing.cidade}
- Campanha 3: Marca (${nome})
- Campanha 4: Intenção Alta (emergencial/urgente/perto de mim) – se aplicável ao nicho

2️⃣ GRUPOS DE ANÚNCIOS
Para cada campanha, liste os grupos com tema único e palavras-chave relacionadas.

3️⃣ PALAVRAS-CHAVE
Para CADA grupo:
- Correspondência de frase e exata
- Serviço + cidade, serviço + "perto de mim", serviço + intenção comercial (contratar, empresa, especializado)
- NÃO incluir termos informativos de topo de funil

4️⃣ PALAVRAS-CHAVE NEGATIVAS
Lista: gratuito, curso, emprego, vagas, como fazer, tutorial, PDF, barato, reclamação, avaliação, caseiro, DIY, download, e negativas específicas do nicho.

5️⃣ ANÚNCIOS RSA
Para CADA grupo de anúncios:
- 12 a 15 HEADLINES (máx. 30 caracteres cada)
- 4 DESCRIÇÕES (máx. 90 caracteres cada)
- Sem emojis, sem exclamações excessivas, CTA profissional (Fale conosco, Solicite atendimento)

6️⃣ EXTENSÕES RECOMENDADAS
- Extensão de chamada
- Extensão de local
- Sitelinks
- Frases de destaque
- Snippets estruturados (serviços)

Retorne APENAS o texto da estrutura, organizado por seções numeradas. Pronto para copiar e colar no Google Ads Editor.`
}
