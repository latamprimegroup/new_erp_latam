/**
 * GET /api/admin/alfredo/briefing
 * Briefing matinal do CEO — gerado pela IA com dados reais do ERP.
 * Cached por 4h (uma geração por manhã).
 *
 * Retorna: { summary, alerts, revenue, marginPct, topTask, fresh, generatedAt }
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { buildAlfredoContext } from '@/lib/alfredo-context'
import { prisma } from '@/lib/prisma'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })

  // Cache: reutiliza briefing gerado nas últimas 4h
  const today     = new Date(); today.setHours(0, 0, 0, 0)
  const cacheAge  = new Date(Date.now() - 4 * 3600_000)
  const existing  = await prisma.alfredoBriefing.findFirst({
    where: { date: today, generatedAt: { gte: cacheAge } },
  })

  if (existing) {
    return NextResponse.json({ ...existing, fresh: false })
  }

  if (!process.env.OPENAI_API_KEY) {
    // Retorna briefing básico sem IA quando a key não está configurada
    const ctx = await buildAlfredoContext()
    const lines = ctx.split('\n').filter((l) => l.startsWith('Faturamento') || l.startsWith('Burn') || l.startsWith('Dias'))
    return NextResponse.json({
      summary: `📊 Briefing sem IA (configure OPENAI_API_KEY):\n\n${lines.join('\n')}`,
      alerts:  [],
      fresh:   true,
      noAI:    true,
    })
  }

  const erpContext = await buildAlfredoContext()
  const openai     = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const completion = await openai.chat.completions.create({
    model:       process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens:  800,
    messages: [{
      role:    'user',
      content: `${erpContext}

=== BRIEFING MATINAL ===
Gere o resumo de tração do dia para o CEO Tiago Alfredo. Responda em JSON:
{
  "summary": "texto direto (máx 4 frases) cobrindo: situação do faturamento, principal gargalo e 1 ação prioritária do dia",
  "alerts": [
    { "type": "DANGER"|"WARNING"|"OK", "message": "string curta" }
  ],
  "topTask": "título da tarefa mais crítica para hoje",
  "esquecidos": ["item esquecido 1", "item esquecido 2"]
}`,
    }],
    response_format: { type: 'json_object' },
  })

  const raw = completion.choices[0]?.message?.content ?? '{}'
  let data: { summary: string; alerts: { type: string; message: string }[]; topTask: string; esquecidos?: string[] }

  try { data = JSON.parse(raw) }
  catch { data = { summary: raw, alerts: [], topTask: '' } }

  // Extrai métricas do contexto para salvar no cache
  const revenueMatch  = erpContext.match(/Faturamento mês atual: R\$([\d.,]+)/)
  const marginMatch   = erpContext.match(/Margem bruta.*?\(([\d.]+)%\)/)
  const revenue       = revenueMatch ? parseFloat(revenueMatch[1].replace(/\./g, '').replace(',', '.')) : 0
  const marginPct     = marginMatch  ? parseFloat(marginMatch[1]) : 0

  const briefing = await prisma.alfredoBriefing.upsert({
    where:  { date: today },
    update: { summary: data.summary, alerts: data.alerts, topTask: data.topTask, revenue, marginPct, generatedAt: new Date() },
    create: { date: today, summary: data.summary, alerts: data.alerts, topTask: data.topTask, revenue, marginPct },
  })

  return NextResponse.json({ ...briefing, esquecidos: data.esquecidos, fresh: true })
}
