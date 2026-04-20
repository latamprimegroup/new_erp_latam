const ANTHROPIC_API = process.env.ANTHROPIC_API_KEY

export type LeadSalesScriptContext = {
  name: string
  email: string
  totalSales: number
  purchaseCount: number
  lastProductName: string | null
  daysSincePurchase: number | null
  behaviorTags: unknown
  customerHealth: string
  upsellSuggestions: string[]
}

export async function generateLeadWhatsAppScript(ctx: LeadSalesScriptContext): Promise<string> {
  if (!ANTHROPIC_API?.trim()) {
    return [
      `Olá ${ctx.name.split(' ')[0] || 'Cliente'}, aqui é da Ads Ativos.`,
      ctx.lastProductName
        ? `Vi que o teu último investimento foi em "${ctx.lastProductName}" — posso ajudar com reposição ou o próximo passo do ecossistema?`
        : 'Queria alinhar contigo o melhor próximo passo no ecossistema — tens 2 minutos?',
      ctx.upsellSuggestions.length
        ? `Temos condições especiais em: ${ctx.upsellSuggestions.slice(0, 2).join(', ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  const prompt = `És copywriter de WhatsApp para a Ads Ativos (tráfego pago / contas / ecossistema 9D).
Gera UMA mensagem curta em português do Brasil (máx. 600 caracteres), tom direto e profissional, sem emojis excessivos.
Contexto do lead:
- Nome: ${ctx.name}
- LTV aproximado: R$ ${ctx.totalSales.toFixed(2)} (${ctx.purchaseCount} compras)
- Último produto: ${ctx.lastProductName || 'n/d'}
- Dias desde última compra: ${ctx.daysSincePurchase != null ? ctx.daysSincePurchase : 'nunca comprou'}
- Saúde comercial (régua): ${ctx.customerHealth}
- Tags comportamentais (JSON): ${JSON.stringify(ctx.behaviorTags ?? [])}
- Sugestões de upsell: ${ctx.upsellSuggestions.join(', ') || 'n/d'}

Se for VIP com dias sem compra, cria urgência suave e menciona o último produto. Não inventes números nem garantias legais. Só o texto da mensagem, sem aspas.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic: ${res.status} — ${err}`)
  }
  const data = (await res.json()) as { content?: { text?: string }[] }
  return (data.content?.[0]?.text ?? '').trim()
}
