/**
 * Prompt profissional para geração de site Google Ads Compliant
 * Estrutura completa: Hero, Sobre, Serviços, Diferenciais, Processo, Prova Social, FAQ, CTA, Rodapé
 */
import type { SanitizedBriefing } from './sanitize'

export function buildLandingPagePrompt(briefing: SanitizedBriefing): string {
  const nome = briefing.nomeFantasia || briefing.nomeEmpresa || briefing.nicho
  const wa = briefing.whatsapp
    ? `https://wa.me/55${briefing.whatsapp.replace(/^55/, '')}`
    : null
  const tel = briefing.telefone
    ? `tel:+55${briefing.telefone.replace(/\D/g, '').replace(/^55/, '')}`
    : null

  const servicosBlock = briefing.servicos
    ? briefing.servicos
        .split(/[\n,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .join('\n- ')
    : 'Não especificado'
  const diffParts: string[] = []
  if (briefing.anosExperiencia != null && briefing.anosExperiencia > 0) {
    diffParts.push(`${briefing.anosExperiencia} anos de experiência`)
  }
  if (briefing.diferenciais) {
    briefing.diferenciais.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean).forEach((s) => diffParts.push(s))
  }
  const diferenciaisBlock = diffParts.length > 0 ? diffParts.join('\n- ') : 'Atendimento local, experiência no segmento, transparência'

  const OBJETIVO_LABELS: Record<string, string> = {
    LIGACOES: 'Geração de ligações',
    WHATSAPP: 'Mensagens via WhatsApp',
    ORCAMENTO: 'Solicitação de orçamento',
    AGENDAMENTO: 'Agendamento',
    PRESENCIAL: 'Atendimento presencial',
    OUTRO: briefing.objetivoOutro || 'Outro',
  }
  const objetivoLabel = briefing.objetivo ? OBJETIVO_LABELS[briefing.objetivo] || briefing.objetivoOutro || 'Conversão' : 'Conversão e contato'
  const perfilBlock = [briefing.tipoCliente, briefing.problemasDemandas, briefing.perfilCliente].filter(Boolean).join('. ') || 'Cliente local'

  return `Você é uma IA Sênior especialista em sites para negócios locais, Google Ads, CRO, SEO Local e compliance de políticas. Mais de 20 anos de experiência prática.

Crie um SITE COMPLETO, ÚNICO e PROFISSIONAL em HTML + Tailwind CSS (CDN: https://cdn.tailwindcss.com), totalmente compatível com as políticas do Google Ads.

━━━━━━━━━━━━━━━━━━━━━━
📌 DADOS DO NEGÓCIO
━━━━━━━━━━━━━━━━━━━━━━
• Nome da empresa: ${briefing.nomeEmpresa || nome}
• Nome fantasia: ${briefing.nomeFantasia || nome}
• Nicho: ${briefing.nicho}
• Subnicho: ${briefing.subnicho || 'N/A'}
• Cidade/Estado: ${briefing.cidade} – ${briefing.estado}
• CNPJ: ${briefing.cnpj || 'N/A'}
• Endereço: ${briefing.endereco || 'N/A'}
• Telefone: ${briefing.telefone || 'N/A'}
• WhatsApp: ${briefing.whatsapp || 'N/A'}
• E-mail: ${briefing.email || 'N/A'}
• Horário: ${briefing.horarioAtendimento || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━
🛠 SERVIÇOS
━━━━━━━━━━━━━━━━━━━━━━
- ${servicosBlock}

━━━━━━━━━━━━━━━━━━━━━━
⭐ DIFERENCIAIS
━━━━━━━━━━━━━━━━━━━━━━
- ${diferenciaisBlock}

━━━━━━━━━━━━━━━━━━━━━━
🎯 OBJETIVO PRINCIPAL: ${objetivoLabel}
👥 TIPO DE CLIENTE: ${briefing.tipoCliente || 'Cliente local'}
👥 PROBLEMAS/DEMANDAS: ${briefing.problemasDemandas || 'Diversas'}
🚫 RESTRIÇÕES: ${briefing.restricoes || 'Nenhuma'}

━━━━━━━━━━━━━━━━━━━━━━
⚠️ REGRAS ABSOLUTAS (NÃO VIOLAR)
━━━━━━━━━━━━━━━━━━━━━━
- NÃO prometer resultados garantidos
- NÃO usar termos absolutos (100%, garantido, imediato, o melhor)
- NÃO fazer comparações com concorrentes
- NÃO usar depoimentos com nomes ou resultados numéricos
- NÃO usar linguagem sensacionalista
- Linguagem institucional, clara, profissional e transparente

━━━━━━━━━━━━━━━━━━━━━━
🧱 ESTRUTURA OBRIGATÓRIA
━━━━━━━━━━━━━━━━━━━━━━
1. HERO: Headline (serviço + cidade), subheadline profissional, CTA (${wa ? 'WhatsApp' : tel ? 'Ligação' : 'Contato'}), telefone clicável
2. SOBRE A EMPRESA: História institucional, posicionamento, compromisso com qualidade
3. SERVIÇOS: Cada serviço com o que é, para quem é, como funciona (sem promessas irreais)
4. DIFERENCIAIS: Atendimento local, experiência, transparência, suporte
5. PROCESSO: Contato → Análise → Orientação → Execução → Suporte
6. PROVA SOCIAL: Frases genéricas e seguras (sem nomes ou números)
7. FAQ: 4-6 perguntas reais do nicho, respostas educativas
8. CTA FINAL: Reforço de contato, botões clicáveis
9. RODAPÉ: Nome, CNPJ, endereço, telefone, WhatsApp, e-mail, horário, links Política de Privacidade (#privacidade) e Termos de Uso (#termos)

CTAs clicáveis: ${wa ? `WhatsApp: ${wa}` : ''} ${tel ? `Tel: ${tel}` : ''}

━━━━━━━━━━━━━━━━━━━━━━
🔍 SEO LOCAL
━━━━━━━━━━━━━━━━━━━━━━
- Meta title e description com nicho + cidade
- Conteúdo original, estrutura semântica (header, main, section, footer, article)

━━━━━━━━━━━━━━━━━━━━━━
🎨 ESTILO
━━━━━━━━━━━━━━━━━━━━━━
- Profissional, institucional, clean, mobile-first, alta legibilidade

Retorne APENAS o HTML completo, sem markdown, sem explicações. Máximo 600 linhas.`
}
