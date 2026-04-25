/**
 * POST /api/socio/fast-entry
 * Fast-Entry pessoal: processa comprovante (texto ou imagem) e cria SocioEntry diretamente.
 * A IA classifica na categoria pessoal (MORADIA, LAZER, SAUDE, etc.), não nas categorias corporativas.
 */
import { NextResponse }     from 'next/server'
import { getServerSession }  from 'next-auth/next'
import { z }                 from 'zod'
import { authOptions }       from '@/lib/auth'
import { prisma }            from '@/lib/prisma'
import OpenAI                from 'openai'
import type { SocioCategory } from '@prisma/client'

function isAdmin(role?: string | null) { return role === 'ADMIN' }

const PERSONAL_CATEGORIES: { keywords: string[]; category: SocioCategory }[] = [
  { keywords: ['aluguel','condomínio','condominio','iptu','moradia','casa','apartamento'],    category: 'MORADIA'              },
  { keywords: ['restaurante','comida','uber eats','ifood','almoço','jantar','lanche'],        category: 'ALIMENTACAO'          },
  { keywords: ['viagem','hotel','airbnb','passagem','lazer','entretenimento','netflix'],      category: 'LAZER'                },
  { keywords: ['médico','medico','hospital','farmácia','farmacia','plano de saúde','saude'],  category: 'SAUDE'                },
  { keywords: ['escola','faculdade','curso','livro','educação','educacao'],                   category: 'EDUCACAO'             },
  { keywords: ['gasolina','uber','99','combustível','combustivel','carro','moto'],            category: 'TRANSPORTE'           },
  { keywords: ['tesouro','cdb','lci','lca','ações','acoes','fundo','investimento'],           category: 'INVESTIMENTO_EXTERNO' },
  { keywords: ['imposto','irpf','darf','carnê','carne','receita federal'],                    category: 'IMPOSTO_PESSOAL'      },
]

function detectPersonalCategory(text: string): SocioCategory {
  const lower = text.toLowerCase()
  for (const m of PERSONAL_CATEGORIES) {
    if (m.keywords.some((k) => lower.includes(k))) return m.category
  }
  return 'OUTRO'
}

const bodySchema = z.object({
  text:        z.string().max(5000).optional(),
  imageBase64: z.string().optional(),
  mimeType:    z.string().optional().default('image/jpeg'),
  type:        z.enum(['RECEITA', 'DESPESA']).default('DESPESA'),
  confirm:     z.boolean().default(false),
  // Valores editados manualmente pelo usuário no review screen
  manualAmount:        z.number().positive().optional(),
  manualCategory:      z.string().max(50).optional(),
  manualDescription:   z.string().max(500).optional(),
  manualPaymentMethod: z.string().max(50).optional(),
})

export async function POST(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isAdmin(session.user.role))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })

  const { text, imageBase64, mimeType, type, confirm,
          manualAmount, manualCategory, manualDescription, manualPaymentMethod } = parsed.data
  if (!text && !imageBase64) return NextResponse.json({ error: 'Forneça texto ou imagem' }, { status: 400 })

  // ── Extração via IA ──────────────────────────────────────────────────────
  let extracted: {
    amount: number | null; currency: string; date: string | null
    name: string | null; transactionId: string | null
    paymentMethod: string; category: SocioCategory; description: string; confidence: number
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (apiKey) {
    try {
      const client = new OpenAI({ apiKey })
      const prompt = `Você é ALFREDO IA gerenciando as finanças PESSOAIS do sócio.
Extraia dados deste comprovante pessoal e classifique em categoria de gasto PESSOAL.
Retorne SOMENTE JSON válido:
{
  "amount": number,
  "currency": "BRL",
  "date": "ISO string",
  "name": "nome do estabelecimento/pessoa",
  "transactionId": "ID da transação se visível",
  "paymentMethod": "PIX|CARTAO|DINHEIRO|OUTRO",
  "category": "MORADIA|ALIMENTACAO|LAZER|SAUDE|EDUCACAO|TRANSPORTE|INVESTIMENTO_EXTERNO|IMPOSTO_PESSOAL|OUTRO",
  "description": "descrição curta",
  "confidence": 0-100
}`

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = imageBase64
        ? [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
          ] }]
        : [{ role: 'user', content: `${prompt}\n\nTexto:\n${text}` }]

      const r    = await client.chat.completions.create({ model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini', messages, temperature: 0.1, max_tokens: 400 })
      const raw  = r.choices[0]?.message?.content ?? '{}'
      extracted  = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```/g, '').trim())
    } catch {
      extracted = {
        amount: null, currency: 'BRL', date: null, name: null, transactionId: null,
        paymentMethod: 'OUTRO', category: detectPersonalCategory(text ?? ''), description: text?.slice(0, 200) ?? '', confidence: 20,
      }
    }
  } else {
    const amtMatch = (text ?? '').match(/R\$\s*([\d.,]+)/i)
    const amount   = amtMatch ? parseFloat(amtMatch[1].replace(/\./g, '').replace(',', '.')) : null
    extracted = {
      amount, currency: 'BRL', date: null, name: null, transactionId: null,
      paymentMethod: 'OUTRO', category: detectPersonalCategory(text ?? ''), description: text?.slice(0, 200) ?? '', confidence: 30,
    }
  }

  // Valores manuais do usuário têm prioridade sobre os extraídos pela IA
  if (manualAmount != null)        extracted.amount        = manualAmount
  if (manualCategory)              extracted.category      = manualCategory as SocioCategory
  if (manualDescription)           extracted.description   = manualDescription
  if (manualPaymentMethod)         extracted.paymentMethod = manualPaymentMethod

  // Se confirm = true, cria diretamente sem aguardar confirmação do usuário
  if (confirm && extracted.amount && extracted.amount > 0) {
    const profile = await prisma.socioProfile.upsert({ where: { userId: session.user.id }, update: {}, create: { userId: session.user.id } })

    // Anti-duplicata
    if (extracted.transactionId) {
      const dup = await prisma.socioEntry.findFirst({ where: { profileId: profile.id, externalTxId: extracted.transactionId } })
      if (dup) return NextResponse.json({ error: 'Transação já lançada', entryId: dup.id }, { status: 409 })
    }

    const entry = await prisma.socioEntry.create({
      data: {
        profileId:     profile.id,
        type:          type as 'RECEITA' | 'DESPESA',
        category:      (extracted.category ?? 'OUTRO') as SocioCategory,
        amount:        extracted.amount,
        currency:      extracted.currency ?? 'BRL',
        date:          extracted.date ? new Date(extracted.date) : new Date(),
        description:   extracted.description || extracted.name || text?.slice(0, 200) || undefined,
        paymentMethod: extracted.paymentMethod,
        externalTxId:  extracted.transactionId || undefined,
        aiExtracted:   true,
      },
    })

    return NextResponse.json({ confirmed: true, entry, extracted })
  }

  // Retorna dados extraídos para confirmação do usuário
  return NextResponse.json({ confirmed: false, extracted })
}
