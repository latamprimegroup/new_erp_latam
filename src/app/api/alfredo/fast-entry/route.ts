/**
 * POST /api/alfredo/fast-entry
 * Motor de OCR + NLP da ALFREDO IA — Zero Entry Policy
 *
 * Aceita:
 *   { type: 'ENTRADA'|'SAIDA', text?: string, imageBase64?: string, mimeType?: string }
 *
 * Retorna: FastEntryDraft com dados extraídos para confirmação
 *
 * GET /api/alfredo/fast-entry — histórico dos últimos 20 lançamentos
 */
import { NextResponse }     from 'next/server'
import { getServerSession }  from 'next-auth/next'
import { z }                 from 'zod'
import { authOptions }       from '@/lib/auth'
import { prisma }            from '@/lib/prisma'
import OpenAI                from 'openai'

// ─── Mapa de categorização por palavra-chave ─────────────────────────────────
const CATEGORY_MAP: { keywords: string[]; category: string }[] = [
  { keywords: ['conta',  'contas',  'ativo',  'ativos',  'perfil'],          category: 'Custo de Ativos'    },
  { keywords: ['servidor', 'proxy', 'infra',  'hosting', 'vps', 'domínio'],  category: 'Infraestrutura'     },
  { keywords: ['salário', 'folha',  'pagamento colaborador', 'freelancer'],   category: 'Recursos Humanos'   },
  { keywords: ['imposto', 'das',    'irpj',   'csll',    'inss'],            category: 'Impostos'           },
  { keywords: ['comissão', 'comissoes', 'parceiro'],                          category: 'Comissões'          },
  { keywords: ['ads',    'tráfego', 'campanha', 'google',  'meta',  'tiktok'], category: 'Mídia Paga'       },
  { keywords: ['software', 'saas',  'assinatura', 'licença'],                 category: 'Software/SaaS'      },
  { keywords: ['pix recebido', 'pagamento recebido', 'cliente pagou'],        category: 'Recebível'          },
]

function detectCategory(text: string): string {
  const lower = text.toLowerCase()
  for (const m of CATEGORY_MAP) {
    if (m.keywords.some((k) => lower.includes(k))) return m.category
  }
  return 'Geral'
}

// ─── Prompt do sistema para a ALFREDO IA ─────────────────────────────────────
function buildExtractionPrompt(type: string): string {
  const isEntrada = type === 'ENTRADA'
  return `Você é ALFREDO IA, assistente financeiro do ERP Ads Ativos. Extraia dados de comprovantes de ${isEntrada ? 'recebimento' : 'pagamento'} e retorne JSON.

REGRAS:
- Se for imagem: leia o comprovante (PIX, TED, transferência) e extraia todos os campos visíveis.
- Se for texto: interprete como mensagem do WhatsApp ou descrição manual.
- Retorne SOMENTE JSON válido, sem markdown, sem texto extra.
- Para datas, use ISO 8601 (ex: "2026-04-21T14:30:00.000Z").
- Para valores, use número com duas casas decimais (ex: 1500.00).
- Se não conseguir extrair um campo, use null.
- Para "transactionId", extraia o código E2E do PIX (começa com "E0") ou ID da transação.
- Para "confidence", estime de 0 a 100 o quão certo você está da extração total.

SCHEMA de saída:
{
  "amount": number | null,
  "currency": "BRL" | "USD" | "EUR",
  "date": string | null,
  "name": string | null,
  "transactionId": string | null,
  "paymentMethod": "PIX" | "TED" | "DOC" | "BOLETO" | "CARTAO" | "DINHEIRO" | "OUTRO",
  "category": string | null,
  "description": string,
  "confidence": number,
  "isIncome": boolean
}`
}

// ─── Extração sem OpenAI (fallback regex) ───────────────────────────────────
function extractWithRegex(text: string, type: string) {
  const amtMatch = text.match(/R\$\s*([\d.,]+)/i) ??
                   text.match(/([\d]{1,3}(?:[.,][\d]{3})*(?:[.,][\d]{2}))/);
  const rawAmt   = amtMatch ? amtMatch[1].replace(/\./g, '').replace(',', '.') : null
  const amount   = rawAmt ? parseFloat(rawAmt) : null

  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
  const txMatch   = text.match(/E\d{20,}/i) ?? text.match(/\b[A-Z0-9]{25,}\b/)

  return {
    amount,
    currency: 'BRL',
    date:            dateMatch ? new Date(dateMatch[1]).toISOString() : null,
    name:            null,
    transactionId:   txMatch ? txMatch[0] : null,
    paymentMethod:   text.toLowerCase().includes('pix') ? 'PIX' : 'OUTRO',
    category:        detectCategory(text),
    description:     text.slice(0, 200),
    confidence:      amount ? 40 : 10,
    isIncome:        type === 'ENTRADA',
  }
}

// ─── Schema de entrada ───────────────────────────────────────────────────────
const bodySchema = z.object({
  type:         z.enum(['ENTRADA', 'SAIDA']),
  text:         z.string().max(5000).optional(),
  imageBase64:  z.string().optional(), // base64 puro (sem prefixo data:)
  mimeType:     z.string().optional().default('image/jpeg'),
})

// ─── POST: processa e cria draft ─────────────────────────────────────────────
export async function POST(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { type, text, imageBase64, mimeType } = parsed.data
  if (!text && !imageBase64) return NextResponse.json({ error: 'Forneça texto ou imagem' }, { status: 400 })

  let extracted: ReturnType<typeof extractWithRegex>

  // ── Tenta com OpenAI ──────────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY
  if (apiKey) {
    try {
      const client  = new OpenAI({ apiKey })
      const model   = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
      const prompt  = buildExtractionPrompt(type)

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = imageBase64
        ? [{ role: 'user', content: [
            { type: 'text',       text: prompt },
            { type: 'image_url',  image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
          ] }]
        : [{ role: 'user', content: `${prompt}\n\nTexto do comprovante:\n${text}` }]

      const response = await client.chat.completions.create({ model, messages, temperature: 0.1, max_tokens: 500 })
      const raw      = response.choices[0]?.message?.content ?? '{}'
      const cleaned  = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim()
      extracted      = JSON.parse(cleaned)

      // Reforça categoria por palavra-chave se IA retornou null
      if (!extracted.category && text) extracted.category = detectCategory(text)
    } catch {
      extracted = extractWithRegex(text ?? '', type)
    }
  } else {
    extracted = extractWithRegex(text ?? '', type)
  }

  // ── Verifica duplicata pelo ID de transação ───────────────────────────────
  let duplicateOf: string | null = null
  if (extracted.transactionId) {
    const dup = await prisma.fastEntryDraft.findFirst({
      where: { extractedTransactionId: extracted.transactionId, status: { not: 'REJECTED' } },
      select: { id: true, status: true, createdAt: true },
    })
    if (dup) duplicateOf = dup.id
  }

  // ── Cria o draft ─────────────────────────────────────────────────────────
  const draft = await prisma.fastEntryDraft.create({
    data: {
      type,
      status:          duplicateOf ? 'DUPLICATE' : 'PENDING',
      rawText:         text,
      hadImage:        !!imageBase64,
      extractedAmount: extracted.amount ?? undefined,
      extractedCurrency:      extracted.currency ?? 'BRL',
      extractedDate:          extracted.date ? new Date(extracted.date) : undefined,
      extractedName:          extracted.name ?? undefined,
      extractedTransactionId: extracted.transactionId ?? undefined,
      extractedCategory:      extracted.category ?? detectCategory(text ?? ''),
      extractedPaymentMethod: extracted.paymentMethod ?? undefined,
      extractedDescription:   extracted.description ?? undefined,
      aiConfidence:           extracted.confidence ?? 0,
      duplicateOf,
      createdById: session.user.id,
    },
  })

  return NextResponse.json({ draft, extracted, isDuplicate: !!duplicateOf }, { status: 201 })
}

// ─── GET: histórico ──────────────────────────────────────────────────────────
export async function GET(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)

  const isAdmin = ['ADMIN', 'FINANCE', 'PURCHASING'].includes(session.user.role ?? '')
  const where: Record<string, unknown> = {}
  if (!isAdmin) where.createdById = session.user.id
  if (status)   where.status      = status

  const drafts = await prisma.fastEntryDraft.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take:    limit,
    include: { createdBy: { select: { name: true } } },
  })

  return NextResponse.json(drafts)
}
