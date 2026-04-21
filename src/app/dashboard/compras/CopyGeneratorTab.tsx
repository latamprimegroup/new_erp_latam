'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Copy, CheckCheck, RefreshCw, Zap, Loader2 } from 'lucide-react'

type Asset = {
  id: string; adsId: string; category: string; subCategory: string | null
  status: string; salePrice: number; displayName: string; description: string | null; tags: string | null
}

const CATEGORY_EMOJI: Record<string, string> = {
  CONTAS: '💳', PERFIS: '👤', BM: '🏢', PROXIES: '🌐',
  SOFTWARE: '💻', INFRA: '⚙️', HARDWARE: '🖥️', OUTROS: '📦',
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function buildCopy(asset: Asset, template: string, extra: string): string {
  const tags = asset.tags ? asset.tags.split(',').map((t) => `#${t.trim().replace(/\s+/g,'')}`) : []
  const tagsLine = tags.length ? `\n${tags.join(' ')}` : ''

  if (template === 'standard') {
    return `📢 *NOVIDADE NO ESTOQUE ADS ATIVOS*

🆔 *ID:* \`${asset.adsId}\`
${CATEGORY_EMOJI[asset.category] ?? '📦'} *Tipo:* ${asset.category}${asset.subCategory ? ` — ${asset.subCategory}` : ''}
🏷️ *Nome:* ${asset.displayName}
📝 *Descrição:* ${asset.description ?? 'Ativo premium com qualidade garantida'}
📦 *Disponibilidade:* Pronta Entrega
💰 *Valor:* ${brl(asset.salePrice)}
${extra ? `\n📌 ${extra}\n` : ''}
👉 Interessados chamar no privado com o ID acima.${tagsLine}`
  }

  if (template === 'telegram') {
    return `🚀 *ATIVO EXCLUSIVO ADS ATIVOS — ${asset.adsId}*

🔹 *TIPO:* ${asset.category}
🔹 *DESCRIÇÃO:* ${asset.displayName}
🔹 *ESPECIFICAÇÃO:* ${asset.description ?? 'Alta performance e qualidade certificada'}
💰 *VALOR:* ${brl(asset.salePrice)}
${extra ? `📌 ${extra}` : ''}

✅ Pronta entrega | Suporte 24h
💬 Contato com o ID: *${asset.adsId}*${tagsLine}`
  }

  // template === 'vip'
  return `━━━━━━━━━━━━━━━━━━━━
🥇 *ASSET VIP — ADS ATIVOS*
━━━━━━━━━━━━━━━━━━━━

🆔 \`${asset.adsId}\`
🏷️ ${asset.displayName}

${CATEGORY_EMOJI[asset.category] ?? '📦'} *Categoria:* ${asset.category}
📝 *Specs:* ${asset.description ?? 'Premium — testado e aprovado pela equipe Ads Ativos'}
${extra ? `📌 *Obs:* ${extra}` : ''}

💰 *Investimento:* ${brl(asset.salePrice)}

_Estoque limitado. Prioridade para quem chamar primeiro com o ID acima._${tagsLine}`
}

export function CopyGeneratorTab() {
  const [assets, setAssets]     = useState<Asset[]>([])
  const [loading, setLoading]   = useState(false)
  const [q, setQ]               = useState('')
  const [selected, setSelected] = useState<Asset | null>(null)
  const [template, setTemplate] = useState<'standard' | 'telegram' | 'vip'>('standard')
  const [extra, setExtra]       = useState('')
  const [copied, setCopied]     = useState(false)
  const textareaRef             = useRef<HTMLTextAreaElement>(null)

  const search = useCallback(async (query: string) => {
    if (!query.trim() && query.length < 2) { setAssets([]); return }
    setLoading(true)
    const r = await fetch(`/api/compras/ativos?q=${encodeURIComponent(query)}&status=AVAILABLE&limit=10`)
    if (r.ok) { const j = await r.json(); setAssets(j.assets ?? []) }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => search(q), 350)
    return () => clearTimeout(timer)
  }, [q, search])

  const copy = async () => {
    if (!selected) return
    const text = buildCopy(selected, template, extra)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  const copyText = selected ? buildCopy(selected, template, extra) : ''

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
        <Zap className="w-4 h-4 shrink-0 mt-0.5" />
        <span>O <strong>Copy Generator</strong> usa apenas dados comerciais (ID Ads Ativos, nome e preço de venda). Nenhum dado de fornecedor é exposto no texto gerado.</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Lado esquerdo — seleção */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Buscar Ativo Disponível</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="ID (AA-CONT-000001) ou nome..."
                className="input-field pl-8 py-2" />
            </div>
          </div>

          {loading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-zinc-400" /></div>}

          {assets.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {assets.map((a) => (
                <button key={a.id} onClick={() => setSelected(a)}
                  className={`w-full text-left rounded-xl border p-3 transition-all ${selected?.id === a.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary-600">{a.adsId}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{a.category}</span>
                  </div>
                  <p className="text-sm font-medium mt-0.5 truncate">{a.displayName}</p>
                  <p className="text-xs text-zinc-500">{a.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                </button>
              ))}
            </div>
          )}

          {/* Template */}
          {selected && (
            <div>
              <label className="block text-xs font-semibold mb-2">Modelo de Copy</label>
              <div className="grid grid-cols-3 gap-2">
                {(['standard','telegram','vip'] as const).map((t) => (
                  <button key={t} onClick={() => setTemplate(t)}
                    className={`py-2 rounded-xl border text-xs font-semibold capitalize transition-colors ${template === t ? 'bg-primary-600 text-white border-primary-600' : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
                    {t === 'standard' ? '📣 Padrão' : t === 'telegram' ? '✈️ Telegram' : '🥇 VIP'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selected && (
            <div>
              <label className="block text-xs font-semibold mb-1">Observação adicional (opcional)</label>
              <input value={extra} onChange={(e) => setExtra(e.target.value)}
                placeholder="Ex: Proxy dedicado incluso | Suporte 30 dias"
                className="input-field" />
            </div>
          )}
        </div>

        {/* Lado direito — preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold">Preview da Copy</label>
            {selected && (
              <button onClick={copy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                {copied ? <><CheckCheck className="w-3.5 h-3.5" />Copiado!</> : <><Copy className="w-3.5 h-3.5" />Copiar</>}
              </button>
            )}
          </div>

          <textarea ref={textareaRef} readOnly value={copyText || 'Selecione um ativo para visualizar...'}
            className="w-full h-96 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-4 text-sm font-mono resize-none focus:outline-none"
          />

          {selected && (
            <div className="flex gap-2">
              <button onClick={copy} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-primary-600 hover:bg-primary-700 text-white'}`}>
                {copied ? <><CheckCheck className="w-4 h-4" />Copiado para Área de Transferência!</> : <><Copy className="w-4 h-4" />Copiar para Área de Transferência</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
