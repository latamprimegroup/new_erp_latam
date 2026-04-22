/**
 * POST /api/admin/alfredo — Chat com streaming
 * Body: { message: string; history?: { role: 'user'|'assistant'; content: string }[] }
 *
 * Retorna Server-Sent Events (text/event-stream) para streaming em tempo real.
 * Se OPENAI_API_KEY não estiver configurada, retorna mensagem de setup.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { buildAlfredoContext } from '@/lib/alfredo-context'
import { prisma } from '@/lib/prisma'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso restrito ao CEO' }, { status: 403 })

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      error: 'OPENAI_API_KEY não configurada',
      setup: 'Adicione OPENAI_API_KEY=sk-... no arquivo .env.local para ativar a ALFREDO IA.',
    }, { status: 503 })
  }

  const { message, history = [] } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

  const systemPrompt = await buildAlfredoContext()
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10).map((h: { role: 'user'|'assistant'; content: string }) => ({
      role: h.role, content: h.content,
    })),
    { role: 'user', content: message },
  ]

  // Streaming via ReadableStream
  const encoder = new TextEncoder()
  let fullResponse = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const chatStream = await openai.chat.completions.create({
          model:       process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
          messages,
          stream:      true,
          temperature: 0.4,
          max_tokens:  1200,
        })

        for await (const chunk of chatStream) {
          const delta = chunk.choices[0]?.delta?.content ?? ''
          if (delta) {
            fullResponse += delta
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`))
          }
        }

        // Salva o insight como memória se tiver > 100 chars
        if (fullResponse.length > 100) {
          await prisma.alfredoMemory.create({
            data: {
              type:    'CHAT_SUMMARY',
              title:   `Chat ${new Date().toLocaleDateString('pt-BR')}`,
              content: `CEO: ${message.slice(0, 200)}\n\nALFREDO: ${fullResponse.slice(0, 500)}`,
              userId:  session.user.id,
            },
          }).catch(() => null)
        }

        controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro na IA'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
