'use client'

import { useCallback, useRef, useState } from 'react'
import {
  ClipboardPaste, Loader2, CheckCircle2, AlertTriangle, Copy, CheckCheck,
  ChevronDown, ChevronUp, Pencil, Trash2, Plus, RefreshCw, ShieldAlert, Package
} from 'lucide-react'
import type { ParsedAssetRow } from '@/lib/asset-parser'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type Platform  = 'GOOGLE' | 'META' | 'TIKTOK' | 'TWITTER' | 'GENERIC'
type SpendClass = 'HS' | 'MS' | 'LS' | 'DS'

type Row = ParsedAssetRow & {
  customAdsId?: string
  credentials?: Record<string, string>
  _editing?: boolean
}

type ParseResult = { rows: Row[]; count: number; warnings: number; catalog: string; nextStartSeq: number }
type ConfirmResult = { created: number; errors: number; errorDetails: string[]; purchaseOrderId: string; catalog: string; message: string }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const TIER_BADGE: Record<SpendClass, string> = { HS: 'bg-violet-100 text-violet-700', MS: 'bg-amber-100 text-amber-700', LS: 'bg-zinc-100 text-zinc-600', DS: 'bg-green-100 text-green-700' }
const TIER_LABEL: Record<SpendClass, string> = { HS: '💎 Diamond', MS: '🥇 Gold', LS: '🥈 Silver', DS: '💵 Dollar' }
const PLATFORM_COLORS: Record<Platform, string> = { GOOGLE: 'text-blue-600', META: 'text-indigo-600', TIKTOK: 'text-pink-600', TWITTER: 'text-sky-600', GENERIC: 'text-zinc-500' }

// ─── Exemplo de texto para placeholder ────────────────────────────────────────
const EXAMPLE_TEXT = `Gasto: 238k | Nicho: Imobiliária | Ano: 2012 | Faturamento: CNPJ | Verificação: 2FA | Aquecimento: 30 dias
Gasto: $3.2k | Nicho: Hyundai | Ano: 2017 | Faturamento: CNPJ | Verificação: Email
Gasto: 150k | Nicho: Desentupidora | Ano: 2019 | Faturamento: CPF | Verificação: 2FA | Pagamento: Boleto`

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export function AssetIntakeTab() {
  // ── Estado da pasta ───────────────────────────────────────────────────────
  const [text, setText]         = useState('')
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [parsing, setParsing]   = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [rows, setRows]         = useState<Row[]>([])

  // ── Estado de confirmação ─────────────────────────────────────────────────
  const [vendorName, setVendorName]       = useState('')
  const [vendorWA, setVendorWA]           = useState('')
  const [costPerAsset, setCostPerAsset]   = useState('')
  const [markupPct, setMarkupPct]         = useState('50')
  const [minMarginPct, setMinMarginPct]   = useState('20')
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [confirming, setConfirming]       = useState(false)
  const [result, setResult]               = useState<ConfirmResult | null>(null)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showCatalog, setShowCatalog]   = useState(false)
  const [copiedCat, setCopiedCat]       = useState(false)
  const [editingIdx, setEditingIdx]     = useState<number | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  // ─── Parse ─────────────────────────────────────────────────────────────────
  const handleParse = useCallback(async () => {
    if (!text.trim()) return
    setParsing(true); setParseResult(null); setResult(null)
    const r = await fetch('/api/compras/ativos/intake', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({ action: 'parse', text, platform: platform || undefined }),
    })
    if (r.ok) {
      const data = await r.json() as ParseResult
      setParseResult(data)
      setRows(data.rows.map((row) => ({ ...row })))
    } else {
      const err = await r.json().catch(() => ({})) as { error?: string }
      alert(err.error ?? 'Erro ao processar texto')
    }
    setParsing(false)
  }, [text, platform])

  // ─── Edição inline de linha ────────────────────────────────────────────────
  const updateRow = (idx: number, field: string, value: unknown) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx))

  // ─── Confirmar e importar ─────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!vendorName.trim()) return alert('Informe o nome do fornecedor')
    if (!costPerAsset || parseFloat(costPerAsset) <= 0) return alert('Informe o custo por ativo')
    if (rows.length === 0) return alert('Nenhuma linha para importar')
    setConfirming(true)
    const r = await fetch('/api/compras/ativos/intake', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({
        action: 'confirm', vendorName: vendorName.trim(),
        vendorWhatsapp: vendorWA || undefined,
        costPerAsset:   parseFloat(costPerAsset),
        markupPct:      parseFloat(markupPct),
        minMarginPct:   parseFloat(minMarginPct),
        purchaseNotes:  purchaseNotes || undefined,
        rows: rows.map((row) => ({
          adsId:          row.adsId, customAdsId: row.customAdsId,
          displayName:    row.displayName, description: row.description,
          spendValue:     row.spendValue, currency:    row.currency,
          spendClass:     row.spendClass, platform:    row.platform,
          year:           row.year, rawNiche:     row.rawNiche,
          faturamento:    row.faturamento, verificacao: row.verificacao,
          aquecimento:    row.aquecimento, tags:        row.tags,
          suggestedPrice: row.suggestedPrice, credentials: row.credentials,
        })),
      }),
    })
    if (r.ok) {
      const data = await r.json() as ConfirmResult
      setResult(data)
      setShowCatalog(true)
    } else {
      const err = await r.json().catch(() => ({})) as { error?: string }
      alert(err.error ?? 'Erro ao confirmar importação')
    }
    setConfirming(false)
  }

  const copyCatalog = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedCat(true); setTimeout(() => setCopiedCat(false), 3000)
  }

  const reset = () => { setText(''); setParseResult(null); setRows([]); setResult(null) }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Aviso de segurança */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/10 p-3 text-xs text-amber-800 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
        <span>O nome do fornecedor e o preço de custo ficam <strong>visíveis apenas para Compras e Admin</strong>. O Comercial verá apenas o ID, nome comercial e preço sugerido.</span>
      </div>

      {/* Resultado de sucesso */}
      {result && (
        <div className="rounded-2xl border border-green-300 bg-green-50 dark:bg-green-950/10 p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-bold text-lg">
            <CheckCircle2 className="w-5 h-5" />
            {result.created} ativos importados com sucesso!
          </div>
          <p className="text-sm text-green-700">{result.message}</p>
          {result.errors > 0 && (
            <div className="text-sm text-red-600">
              <p className="font-bold">⚠️ {result.errors} erro(s):</p>
              <ul className="list-disc pl-4">{result.errorDetails.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}

          <div>
            <button onClick={() => setShowCatalog((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold text-green-700">
              {showCatalog ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showCatalog ? 'Ocultar' : 'Ver'} Catálogo Gerado
            </button>
            {showCatalog && (
              <div className="mt-2 space-y-2">
                <button onClick={() => copyCatalog(result.catalog)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm ${copiedCat ? 'bg-green-600 text-white' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                  {copiedCat ? <><CheckCheck className="w-4 h-4" />Copiado!</> : <><Copy className="w-4 h-4" />Copiar para WhatsApp/Telegram</>}
                </button>
                <textarea readOnly value={result.catalog} className="w-full h-48 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs font-mono resize-none focus:outline-none" />
              </div>
            )}
          </div>
          <button onClick={reset} className="btn-secondary text-sm flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" />Novo Intake</button>
        </div>
      )}

      {!result && (
        <>
          {/* ── Etapa 1: Colar Texto ─────────────────────────────────────── */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold flex items-center gap-2"><ClipboardPaste className="w-4 h-4 text-primary-500" />Etapa 1 — Colar Lista do Fornecedor</h3>
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500">Plataforma:</label>
                <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform | '')} className="input-field py-1.5 text-sm">
                  <option value="">Auto-detectar</option>
                  <option value="GOOGLE">Google</option>
                  <option value="META">Meta / Facebook</option>
                  <option value="TIKTOK">TikTok</option>
                  <option value="TWITTER">Twitter/X</option>
                  <option value="GENERIC">Genérico</option>
                </select>
              </div>
            </div>

            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Cole aqui a lista do WhatsApp. Exemplos:\n\n${EXAMPLE_TEXT}`}
              className="w-full h-44 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
            />

            <div className="flex gap-2 flex-wrap">
              <button onClick={handleParse} disabled={parsing || !text.trim()} className="btn-primary flex items-center gap-2 px-6">
                {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                Processar Lista
              </button>
              {text && <button onClick={() => { setText(EXAMPLE_TEXT); setTimeout(handleParse, 100) }} className="btn-secondary text-xs">Usar exemplo</button>}
            </div>
          </div>

          {/* ── Etapa 2: Revisão ─────────────────────────────────────────── */}
          {parseResult && rows.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-bold flex items-center gap-2">
                  ✅ Etapa 2 — Revisar {rows.length} ativo{rows.length > 1 ? 's' : ''} extraídos
                  {parseResult.warnings > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">{parseResult.warnings} aviso{parseResult.warnings > 1 ? 's' : ''}</span>}
                </h3>
                <button onClick={() => setShowCatalog((v) => !v)} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                  {showCatalog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showCatalog ? 'Ocultar' : 'Ver'} catálogo prévia
                </button>
              </div>

              {/* Preview do catálogo */}
              {showCatalog && (
                <div className="space-y-2">
                  <button onClick={() => copyCatalog(parseResult.catalog)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs ${copiedCat ? 'bg-green-600 text-white' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                    {copiedCat ? <><CheckCheck className="w-3 h-3" />Copiado!</> : <><Copy className="w-3 h-3" />Copiar Catálogo Prévia</>}
                  </button>
                  <textarea readOnly value={parseResult.catalog} className="w-full h-36 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs font-mono resize-none focus:outline-none" />
                </div>
              )}

              {/* Tabela de revisão */}
              <div className="overflow-x-auto -mx-2">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500 font-semibold bg-zinc-50 dark:bg-zinc-800/50">
                      <th className="px-3 py-2">ID Gerado</th>
                      <th className="px-3 py-2">Nome Comercial</th>
                      <th className="px-3 py-2">Gasto</th>
                      <th className="px-3 py-2">Tier</th>
                      <th className="px-3 py-2">Ano</th>
                      <th className="px-3 py-2">Fat.</th>
                      <th className="px-3 py-2">Preço Sugerido</th>
                      <th className="px-3 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {rows.map((row, idx) => (
                      <tr key={idx} className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/50 ${row.warnings.length > 0 ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}`}>
                        <td className="px-3 py-2">
                          {editingIdx === idx
                            ? <input defaultValue={row.customAdsId ?? row.adsId} onBlur={(e) => updateRow(idx, 'customAdsId', e.target.value)} className="input-field text-xs font-mono w-36 py-1" autoFocus />
                            : <span className={`font-mono text-xs font-bold ${PLATFORM_COLORS[row.platform]}`}>{row.customAdsId ?? row.adsId}</span>
                          }
                          {row.warnings.length > 0 && (
                            <span title={row.warnings.join(', ')}><AlertTriangle className="inline w-3 h-3 ml-1 text-amber-500" /></span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editingIdx === idx
                            ? <input defaultValue={row.displayName} onBlur={(e) => updateRow(idx, 'displayName', e.target.value)} className="input-field text-xs w-48 py-1" />
                            : <span className="font-medium text-xs">{row.displayName}</span>
                          }
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          <span className={row.currency === 'USD' ? 'text-green-600 font-semibold' : ''}>
                            {row.currency === 'USD' ? '$' : 'R$'}{(row.spendValue / 1000).toFixed(0)}k
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_BADGE[row.spendClass]}`}>{TIER_LABEL[row.spendClass]}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-500">{row.year ?? '—'}</td>
                        <td className="px-3 py-2 text-xs">{row.faturamento ?? '—'}</td>
                        <td className="px-3 py-2 text-xs font-semibold text-primary-600">
                          {editingIdx === idx
                            ? <input type="number" defaultValue={row.suggestedPrice} onBlur={(e) => updateRow(idx, 'suggestedPrice', parseFloat(e.target.value))} className="input-field text-xs w-24 py-1" />
                            : brl(row.suggestedPrice)
                          }
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button onClick={() => setEditingIdx(editingIdx === idx ? null : idx)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Editar">
                              <Pencil className="w-3.5 h-3.5 text-zinc-500" />
                            </button>
                            <button onClick={() => removeRow(idx)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20" title="Remover">
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Etapa 3: Dados do Fornecedor e Financeiro ──────────────── */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-500" />Etapa 3 — Dados Internos (Fornecedor + Custo)</h4>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Fornecedor *</label>
                    <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Ex: João Titanium" className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">WhatsApp do Fornecedor</label>
                    <input value={vendorWA} onChange={(e) => setVendorWA(e.target.value)} placeholder="+55 11 9..." className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Custo Unitário (R$) *</label>
                    <input type="number" step="0.01" value={costPerAsset} onChange={(e) => setCostPerAsset(e.target.value)} placeholder="Ex: 150.00" className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Markup Sugerido (%)</label>
                    <input type="number" value={markupPct} onChange={(e) => setMarkupPct(e.target.value)} className="input-field" />
                    <p className="text-[10px] text-zinc-400 mt-1">Preço sugerido = custo × (1 + markup%)</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Margem Mínima — Floor (%)</label>
                    <input type="number" value={minMarginPct} onChange={(e) => setMinMarginPct(e.target.value)} className="input-field" />
                    <p className="text-[10px] text-zinc-400 mt-1">Venda abaixo do piso exige aprovação CEO</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Notas da Compra</label>
                    <input value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} placeholder="Ex: Lote 01 — Abril 2026" className="input-field" />
                  </div>
                </div>

                {/* Resumo financeiro */}
                {costPerAsset && parseFloat(costPerAsset) > 0 && (
                  <div className="mt-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div><p className="text-zinc-400">Ativos</p><p className="font-bold text-lg">{rows.length}</p></div>
                    <div><p className="text-zinc-400">Custo Total</p><p className="font-bold text-red-600">{brl(parseFloat(costPerAsset) * rows.length)}</p></div>
                    <div><p className="text-zinc-400">Receita Estimada</p><p className="font-bold text-primary-600">{brl(rows.reduce((s, r) => s + r.suggestedPrice, 0))}</p></div>
                    <div><p className="text-zinc-400">Margem Estimada</p><p className="font-bold text-green-600">{brl(rows.reduce((s, r) => s + r.suggestedPrice, 0) - parseFloat(costPerAsset) * rows.length)}</p></div>
                  </div>
                )}

                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/10 p-3 text-xs text-blue-700 flex items-start gap-2">
                  <Plus className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Ativos serão importados com status <strong>Em Triagem</strong>. O Financeiro precisa confirmar o pagamento ao fornecedor para liberá-los ao estoque disponível.</span>
                </div>

                <button onClick={handleConfirm} disabled={confirming || !vendorName.trim() || !costPerAsset || rows.length === 0}
                  className="mt-4 w-full py-3.5 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white font-bold text-base transition-colors flex items-center justify-center gap-2">
                  {confirming ? <><Loader2 className="w-5 h-5 animate-spin" />Importando...</> : <><CheckCircle2 className="w-5 h-5" />Confirmar e Importar {rows.length} Ativo{rows.length > 1 ? 's' : ''}</>}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
