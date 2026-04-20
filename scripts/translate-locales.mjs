#!/usr/bin/env node
/**
 * Tradução automática inicial dos JSON de locale (pt-BR → en-US, es).
 * Usa OpenAI se OPENAI_API_KEY estiver definida; caso contrário, imprime instruções.
 *
 * Uso: node scripts/translate-locales.mjs
 */
import { readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'src', 'locales', 'client', 'pt-BR.json')

async function main() {
  const pt = JSON.parse(await readFile(src, 'utf8'))
  const key = process.env.OPENAI_API_KEY?.trim()

  if (!key) {
    console.log(
      'Defina OPENAI_API_KEY para gerar en-US.json e es.json a partir de pt-BR.json.\n' +
        'Edição manual: ajuste termos técnicos (Warm-up, Lander, Contingency) em src/locales/client/'
    )
    process.exit(0)
  }

  const body = {
    model: process.env.OPENAI_TRANSLATE_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are a professional translator for a SaaS ads/traffic platform. Translate JSON values only; keep keys identical. Preserve placeholders like {name}. Output valid JSON only, no markdown.',
      },
      {
        role: 'user',
        content: `Translate this JSON from Brazilian Portuguese to American English. Return only the JSON object:\n${JSON.stringify(pt)}`,
      },
    ],
    temperature: 0.2,
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`OpenAI error ${res.status}: ${t}`)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Resposta OpenAI vazia')

  const en = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''))
  await writeFile(join(root, 'src', 'locales', 'client', 'en-US.json'), JSON.stringify(en, null, 2) + '\n')

  const bodyEs = {
    ...body,
    messages: [
      body.messages[0],
      {
        role: 'user',
        content: `Translate this JSON from Brazilian Portuguese to Spanish (neutral LATAM). Return only the JSON object:\n${JSON.stringify(pt)}`,
      },
    ],
  }

  const resEs = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyEs),
  })

  if (!resEs.ok) {
    const t = await resEs.text()
    throw new Error(`OpenAI ES error ${resEs.status}: ${t}`)
  }

  const dataEs = await resEs.json()
  const textEs = dataEs.choices?.[0]?.message?.content?.trim()
  if (!textEs) throw new Error('Resposta OpenAI ES vazia')

  const es = JSON.parse(textEs.replace(/^```json\s*|\s*```$/g, ''))
  await writeFile(join(root, 'src', 'locales', 'client', 'es.json'), JSON.stringify(es, null, 2) + '\n')

  console.log('Atualizado: src/locales/client/en-US.json e es.json')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
