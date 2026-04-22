/**
 * POST /api/admin/alfredo/analyze
 * Body: { taskId: string }
 *
 * Analisa uma CeoTask específica e retorna o veredito do Quadrante de Decisão:
 *   EXECUTAR_AGORA | AUTOMATIZAR | DELEGAR | ELIMINAR
 * + justificativa + sugestão técnica + impacto na meta R$1M.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { buildAlfredoContext } from '@/lib/alfredo-context'
import { prisma } from '@/lib/prisma'
import OpenAI from 'openai'
import type { TaskAnalysisResult } from '@/lib/alfredo-context'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })

  if (!process.env.OPENAI_API_KEY)
    return NextResponse.json({ error: 'OPENAI_API_KEY não configurada' }, { status: 503 })

  const { taskId } = await req.json()
  if (!taskId) return NextResponse.json({ error: 'taskId obrigatório' }, { status: 400 })

  const task = await prisma.ceoTask.findUnique({ where: { id: taskId } })
  if (!task) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })

  const erpContext = await buildAlfredoContext()
  const openai     = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const prompt = `${erpContext}

=== ANÁLISE DE TAREFA ===
Título: ${task.title}
Descrição: ${task.description ?? 'Sem descrição'}
Categoria: ${task.category}
Impacto declarado: ${task.impact}/10
Urgência declarada: ${task.urgency}/10
Priority Score: ${task.priorityScore}
Impacto financeiro estimado pelo CEO: ${task.revenueImpact ? `R$${Number(task.revenueImpact).toLocaleString('pt-BR')}` : 'Não informado'}

Com base nos dados reais do ERP acima, analise esta tarefa e responda SOMENTE em JSON válido (sem markdown, sem texto fora do JSON):
{
  "verdict": "EXECUTAR_AGORA" | "AUTOMATIZAR" | "DELEGAR" | "ELIMINAR",
  "quadrante": 1 | 2 | 3 | 4,
  "justificativa": "string curta (máx 2 frases) explicando o veredito com base nos dados reais",
  "techSuggestion": "string com sugestão de automação/script se AUTOMATIZAR, ou null",
  "revenueImpact": "string descrevendo o impacto percentual na meta de R$1M",
  "scoreAjustado": número entre 1-30 baseado na análise real
}`

  const completion = await openai.chat.completions.create({
    model:       process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    messages:    [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens:  600,
    response_format: { type: 'json_object' },
  })

  const raw = completion.choices[0]?.message?.content ?? '{}'
  let result: TaskAnalysisResult

  try {
    result = JSON.parse(raw) as TaskAnalysisResult
  } catch {
    return NextResponse.json({ error: 'IA retornou formato inválido', raw }, { status: 500 })
  }

  // Persistir análise na memória
  await prisma.alfredoMemory.create({
    data: {
      type:    'TASK_ANALYSIS',
      title:   `Análise: ${task.title.slice(0, 80)}`,
      content: `Veredito: ${result.verdict}\n${result.justificativa}\n\n${result.techSuggestion ?? ''}`,
      metadata: { taskId, verdict: result.verdict, quadrante: result.quadrante },
      userId:  session.user.id,
    },
  })

  // Ajustar priority score se a IA sugeriu diferente
  if (result.scoreAjustado && result.scoreAjustado !== task.priorityScore) {
    await prisma.ceoTask.update({
      where: { id: taskId },
      data:  { priorityScore: result.scoreAjustado },
    })
  }

  return NextResponse.json({ ...result, taskId, taskTitle: task.title })
}
