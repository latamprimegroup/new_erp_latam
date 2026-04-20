import { prisma } from '@/lib/prisma'

const OPENAI = process.env.OPENAI_API_KEY
const ANTHROPIC = process.env.ANTHROPIC_API_KEY

async function callOpenAI(prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI}`,
    },
    body: JSON.stringify({
      model: process.env.LEAD_AI_BRIEF_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.35,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

async function callAnthropic(prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = (await res.json()) as { content?: { text?: string }[] }
  return (data.content?.[0]?.text ?? '').trim()
}

/** Resumo de 2 linhas para o comercial (triagem virtual). */
export async function refreshLeadCommercialAiBrief(leadId: string): Promise<void> {
  const lead = await prisma.intelligenceLead.findUnique({
    where: { id: leadId },
    include: {
      events: { orderBy: { occurredAt: 'desc' }, take: 12, select: { eventType: true, title: true, detail: true } },
    },
  })
  if (!lead) return

  const tags = JSON.stringify(lead.behaviorTags ?? [])
  const ev = lead.events
    .map((e) => `${e.eventType}: ${e.title}${e.detail ? ` — ${e.detail.slice(0, 80)}` : ''}`)
    .join('\n')

  const prompt = `És analista comercial da Ads Ativos (tráfego pago, contas, ecossistema B2B).
Em no máximo 2 frases curtas em português do Brasil, diz ao vendedor COMO abordar este lead (perfil, histórico, foco).
Sem inventar dados que não estejam no contexto. Tom direto.

Contexto:
- Nome: ${lead.name}
- LTV: R$ ${Number(lead.totalSales).toFixed(2)} · ${lead.purchaseCount} compras · último produto: ${lead.lastProductName || 'n/d'}
- 1º UTM: ${lead.utmFirstSource || '—'} / ${lead.utmFirstCampaign || '—'} · content: ${lead.utmFirstContent || '—'} · term: ${lead.utmFirstTerm || '—'}
- Último UTM: ${lead.utmSource || '—'} / ${lead.utmCampaign || '—'} · content: ${lead.utmContent || '—'} · term: ${lead.utmTerm || '—'}
- Trust score (0–100): ${lead.trustScore != null ? lead.trustScore : 'n/d'} · Ticket médio: ${lead.averageTicketBrl != null ? `R$ ${Number(lead.averageTicketBrl).toFixed(2)}` : 'n/d'}
- Tags: ${tags}
- Eventos recentes:
${ev || '(nenhum)'}

Responde só o texto das duas linhas, sem aspas nem prefixo.`

  let text = ''
  try {
    if (OPENAI?.trim()) text = await callOpenAI(prompt)
    else if (ANTHROPIC?.trim()) text = await callAnthropic(prompt)
    else {
      const parts: string[] = []
      if (lead.purchaseCount > 0) {
        parts.push(
          `Cliente com histórico: ${lead.purchaseCount} compra(s), LTV ~R$ ${Number(lead.totalSales).toFixed(0)}.`,
        )
        if (lead.lastProductName) parts.push(`Último produto: ${lead.lastProductName} — priorizar upsell ou reposição.`)
      } else {
        parts.push('Lead ainda sem compra no ERP — qualificar orçamento e urgência antes de prometer prazo.')
        if (lead.checkoutIntentAt) parts.push('Sinal de intenção de checkout registado: abordagem consultiva no WhatsApp.')
      }
      text = parts.slice(0, 2).join(' ')
    }
  } catch {
    return
  }

  const brief = text.replace(/\s+/g, ' ').trim().slice(0, 600)
  if (!brief) return
  await prisma.intelligenceLead.update({
    where: { id: leadId },
    data: { commercialAiBrief: brief },
  })
}
