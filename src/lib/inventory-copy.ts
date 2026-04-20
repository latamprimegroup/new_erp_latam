import type { AccountPlatform } from '@prisma/client'

const MODEL = process.env.OPENAI_INVENTORY_COPY_MODEL?.trim() || 'gpt-4o-mini'

export type AccountCopyInput = {
  id: string
  platform: AccountPlatform
  type: string
  niche: string | null
  yearStarted: number | null
  spentDisplayAmount: number | null
  spentDisplayCurrency: string | null
  salePriceBrl: number | null
  adsAtivosVerified: boolean
}

function skuPublic(id: string, platform: AccountPlatform): string {
  const p = platform.replace('_ADS', '').slice(0, 4)
  return `AA-${p}-${id.slice(0, 8)}`
}

/**
 * Gera 3 variações de copy para Telegram/WhatsApp (termos de autoridade + gatilhos).
 */
export async function generateInventoryCopyVariations(
  accounts: AccountCopyInput[]
): Promise<{ accountId: string; sku: string; copies: string[] }[]> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    return accounts.map((a) => ({
      accountId: a.id,
      sku: skuPublic(a.id, a.platform),
      copies: [
        buildFallbackCopy(a, 1),
        buildFallbackCopy(a, 2),
        buildFallbackCopy(a, 3),
      ],
    }))
  }

  const results: { accountId: string; sku: string; copies: string[] }[] = []

  for (const a of accounts) {
    const sku = skuPublic(a.id, a.platform)
    const spendLine =
      a.spentDisplayAmount != null && a.spentDisplayCurrency
        ? `${a.spentDisplayAmount} ${a.spentDisplayCurrency} (Old Spend / histórico)`
        : 'histórico de spend disponível sob consulta'
    const priceLine =
      a.salePriceBrl != null ? `R$ ${a.salePriceBrl.toFixed(2)}` : 'consulte valores'

    const system = `Você escreve anúncios curtos para venda de contas de anúncios (Meta, Google, TikTok) no estilo Ads Ativos.
Regras: 3 textos em português do Brasil; tom premium; use emojis com moderação (2–4 por texto); inclua gatilhos como Old Spend, High Trust, Conta Aquecida, Pronta para Escala quando fizer sentido.
Nunca invente números de spend além dos fornecidos. Selo: se adsAtivosVerified, mencione "Ativo Verificado Ads Ativos".
Formato de saída: JSON array de 3 strings, apenas o JSON.`

    const user = JSON.stringify({
      sku,
      platform: a.platform,
      tipo: a.type,
      nicho: a.niche,
      ano: a.yearStarted,
      spend: spendLine,
      preco_brl: priceLine,
      selo_verificado: a.adsAtivosVerified,
    })

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.85,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })

    if (!res.ok) {
      results.push({
        accountId: a.id,
        sku,
        copies: [buildFallbackCopy(a, 1), buildFallbackCopy(a, 2), buildFallbackCopy(a, 3)],
      })
      continue
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const raw = data.choices?.[0]?.message?.content?.trim() ?? ''
    let copies: string[] = []
    try {
      const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ''))
      if (Array.isArray(parsed) && parsed.length >= 3) {
        copies = parsed.slice(0, 3).map((x) => String(x))
      }
    } catch {
      copies = []
    }
    if (copies.length < 3) {
      copies = [buildFallbackCopy(a, 1), buildFallbackCopy(a, 2), buildFallbackCopy(a, 3)]
    }

    results.push({ accountId: a.id, sku, copies: copies.slice(0, 3) })
  }

  return results
}

function buildFallbackCopy(a: AccountCopyInput, variant: number): string {
  const sku = skuPublic(a.id, a.platform)
  const spend =
    a.spentDisplayAmount != null && a.spentDisplayCurrency
      ? `💸 Old Spend exibido: ${a.spentDisplayAmount} ${a.spentDisplayCurrency}`
      : '💸 Histórico de spend sólido'
  const price =
    a.salePriceBrl != null ? `💰 Fechamento: R$ ${a.salePriceBrl.toFixed(2)}` : '💰 Consulte valor'
  const seal = a.adsAtivosVerified ? '✅ Ativo Verificado Ads Ativos' : ''
  const hooks = [
    '🔥 Conta aquecida · High Trust · pronta para escala.',
    '🚀 Perfil com tráfego legítimo — ideal para escalar campanhas.',
    '⚡ Conta com histórico — menos atrito na subida de orçamento.',
  ]
  return [
    `${sku} · ${a.platform.replace('_ADS', '')}`,
    spend,
    price,
    seal,
    hooks[variant - 1] ?? hooks[0],
    `📦 Ref: ${a.id.slice(0, 12)}…`,
  ]
    .filter(Boolean)
    .join('\n')
}
