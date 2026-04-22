/**
 * GET /api/admin/alfredo/efficiency
 * Scanner de Eficiência — detecta gargalos, custos ociosos e oportunidades de automação.
 *
 * Análise 100% baseada em dados reais do ERP + raciocínio da IA.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { buildAlfredoContext } from '@/lib/alfredo-context'
import { prisma } from '@/lib/prisma'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 45

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })

  // Dados brutos para análise de eficiência
  const [blockedOrders, triagem, criticalTasks, oldAvailableAssets] = await Promise.all([
    // OS pagas pelo cliente mas fornecedor não pago > 48h
    prisma.assetSalesOrder.findMany({
      where:  { status: 'CLIENT_PAID', clientPaidAt: { lt: new Date(Date.now() - 48 * 3600_000) } },
      select: { id: true, negotiatedPrice: true, clientPaidAt: true, grossMargin: true },
      take:   20,
    }),
    // Ativos em triagem há mais de 7 dias (gargalo de entrada)
    prisma.asset.count({
      where: { status: 'TRIAGEM', updatedAt: { lt: new Date(Date.now() - 7 * 86400_000) } },
    }),
    // Tarefas CRITICAL paradas há mais de 3 dias
    prisma.ceoTask.findMany({
      where:  { priority: 'CRITICAL', status: 'TODO', createdAt: { lt: new Date(Date.now() - 3 * 86400_000) } },
      select: { title: true, priorityScore: true, revenueImpact: true },
      take:   5,
    }),
    // Ativos disponíveis há mais de 30 dias (estoque parado = capital morto)
    prisma.asset.count({
      where: { status: 'AVAILABLE', updatedAt: { lt: new Date(Date.now() - 30 * 86400_000) } },
    }),
  ])

  const blockedRevenue = blockedOrders.reduce((s, o) => s + Number(o.negotiatedPrice), 0)
  const blockedMargin  = blockedOrders.reduce((s, o) => s + Number(o.grossMargin), 0)

  const rawInsights = {
    blockedOrders:    blockedOrders.length,
    blockedRevenue,
    blockedMargin,
    triagem,
    criticalTasksParadas: criticalTasks.length,
    deadStock:       oldAvailableAssets,
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      insights:    rawInsights,
      suggestions: [
        blockedOrders.length > 0 ? `🚨 ${blockedOrders.length} OS pagas pelo cliente há >48h sem pagamento ao fornecedor — ${new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(blockedRevenue)} bloqueados` : null,
        triagem > 0 ? `⚠️ ${triagem} ativos em triagem há mais de 7 dias — gargalo de entrada de estoque` : null,
        oldAvailableAssets > 0 ? `📦 ${oldAvailableAssets} ativos disponíveis há >30 dias — capital parado` : null,
      ].filter(Boolean),
      noAI: true,
    })
  }

  const erpContext = await buildAlfredoContext()
  const openai     = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const prompt = `${erpContext}

=== SCANNER DE EFICIÊNCIA ===
Dados adicionais do ERP:
- OS pagas pelo cliente aguardando pagamento ao fornecedor: ${blockedOrders.length} (${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(blockedRevenue)} bloqueados, margem bloqueada: ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(blockedMargin)})
- Ativos em triagem há >7 dias: ${triagem}
- Tarefas CRITICAL paradas há >3 dias: ${criticalTasks.map((t)=>t.title).join('; ')}
- Ativos disponíveis há >30 dias (capital morto): ${oldAvailableAssets}

Analise os gargalos e responda em JSON:
{
  "score": número 1-100 representando a saúde operacional atual,
  "diagnosis": "frase curta (máx 2 linhas) sobre o maior gargalo",
  "opportunities": [
    {
      "type": "ELIMINAR"|"AUTOMATIZAR"|"ESCALAR"|"URGENTE",
      "title": "string",
      "description": "string (1 frase)",
      "estimatedImpact": "string (ex: +R$15.000/mês ou -20% custo)"
    }
  ],
  "automationScript": "string com sugestão de script/código para o gargalo mais crítico, ou null"
}`

  const completion = await openai.chat.completions.create({
    model:       process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    messages:    [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens:  1000,
    response_format: { type: 'json_object' },
  })

  const raw = completion.choices[0]?.message?.content ?? '{}'
  let aiResult: {
    score: number
    diagnosis: string
    opportunities: { type: string; title: string; description: string; estimatedImpact: string }[]
    automationScript: string | null
  }

  try { aiResult = JSON.parse(raw) }
  catch { aiResult = { score: 50, diagnosis: raw, opportunities: [], automationScript: null } }

  // Salva insight na memória
  if (aiResult.diagnosis) {
    await prisma.alfredoMemory.create({
      data: {
        type:    'INSIGHT',
        title:   `Efficiency Scan ${new Date().toLocaleDateString('pt-BR')}`,
        content: `Score: ${aiResult.score}/100\n${aiResult.diagnosis}\n\nOportunidades: ${aiResult.opportunities.map((o)=>o.title).join(', ')}`,
        userId:  session.user.id,
      },
    }).catch(() => null)
  }

  return NextResponse.json({ ...aiResult, rawInsights })
}
