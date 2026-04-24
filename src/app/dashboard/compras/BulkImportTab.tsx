'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Download, CheckCircle2, XCircle, Loader2, AlertTriangle, Zap, ChevronDown, ChevronUp } from 'lucide-react'

type Vendor = { id: string; name: string; category: string }

// ─── Smart Import ─────────────────────────────────────────────────────────────

type SmartParsed = {
  realId?: string; gasto?: string; spendBRL?: number; nicho?: string
  ano?: number; paymentType?: string
}

function parseSmartText(text: string): SmartParsed {
  const t = text.trim()
  const result: SmartParsed = {}

  const idMatch  = t.match(/ID[:\s]+([0-9][\d\-]{4,})/i)
  if (idMatch) result.realId = idMatch[1].trim()

  const gastMatch = t.match(/Gastos?[:\s]+([\d]+(?:[.,]\d+)?k?)/i)
  if (gastMatch) {
    const raw = gastMatch[1].toLowerCase().replace(',', '.')
    result.gasto = raw
    result.spendBRL = raw.endsWith('k') ? parseFloat(raw) * 1000 : parseFloat(raw)
  }

  const nichoMatch = t.match(/Nicho[:\s]+([^\d][^\n\r]*?)(?=\s+(?:Ano|Pag|Gasto|$))/i)
  if (nichoMatch) result.nicho = nichoMatch[1].trim()

  const anoMatch = t.match(/Ano[:\s]+(\d{4})/i)
  if (anoMatch) result.ano = parseInt(anoMatch[1])

  const pagMatch = t.match(/Pag(?:amento)?[:\s]+(Manual|Auto)/i)
  if (pagMatch) result.paymentType = pagMatch[1]

  return result
}

type ParsedRow = {
  category: string; subCategory: string; vendorId: string; vendorName: string
  costPrice: number; salePrice: number; displayName: string; tags: string; description: string; valid: boolean; error?: string
}

const CATEGORIES = ['CONTAS','PERFIS','BM','PROXIES','SOFTWARE','INFRA','HARDWARE','OUTROS']

const TEMPLATE_CSV = `category,subCategory,vendorName,costPrice,salePrice,displayName,description,tags,vendorRef
CONTAS,Warm-up 30d,Meu Fornecedor A,50,250,Gold Account LATAM Premium,Conta aquecida 30 dias + proxy dedicado,warm-up\,gold\,proxy-dedicado,REF-001
PERFIS,Perfil Sênior,Meu Fornecedor B,20,120,Perfil Verificado Senior,Perfil com histórico 2 anos,senior\,verificado,REF-002`

function parseCsv(csv: string, vendors: Vendor[]): ParsedRow[] {
  const vendorByName = Object.fromEntries(vendors.map((v) => [v.name.toLowerCase(), v]))
  const lines = csv.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim())

  return lines.slice(1).map((line, idx) => {
    const vals  = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
    const obj   = Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
    const vendor = vendorByName[obj.vendorName?.toLowerCase()]

    const row: ParsedRow = {
      category:    obj.category,
      subCategory: obj.subCategory ?? '',
      vendorId:    vendor?.id ?? '',
      vendorName:  obj.vendorName ?? '',
      costPrice:   parseFloat(obj.costPrice) || 0,
      salePrice:   parseFloat(obj.salePrice) || 0,
      displayName: obj.displayName ?? '',
      description: obj.description ?? '',
      tags:        obj.tags ?? '',
      valid:       true,
    }

    if (!CATEGORIES.includes(row.category))       { row.valid = false; row.error = `Categoria inválida: ${row.category}` }
    else if (!vendor)                              { row.valid = false; row.error = `Fornecedor não encontrado: "${obj.vendorName}"` }
    else if (!row.costPrice || !row.salePrice)     { row.valid = false; row.error = `Preços inválidos (linha ${idx + 2})` }
    else if (!row.displayName)                     { row.valid = false; row.error = 'displayName obrigatório' }

    return row
  })
}

export function BulkImportTab() {
  const [vendors, setVendors]   = useState<Vendor[]>([])
  const [rows, setRows]         = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult]     = useState<{ created: number; failed: number; total: number; errors: {row:number;error:string}[] } | null>(null)
  const fileRef                 = useRef<HTMLInputElement>(null)

  // Smart Import
  const [showSmart, setShowSmart]         = useState(true)
  const [smartText, setSmartText]         = useState('')
  const [smartParsed, setSmartParsed]     = useState<SmartParsed | null>(null)
  const [smartVendorId, setSmartVendorId] = useState('')
  const [smartCategory, setSmartCategory] = useState('CONTAS')
  const [smartCostPrice, setSmartCostPrice] = useState('')
  const [smartSalePrice, setSmartSalePrice] = useState('')
  const [smartDisplayName, setSmartDisplayName] = useState('')
  const [smartImporting, setSmartImporting] = useState(false)
  const [smartResult, setSmartResult]     = useState<{ ok: boolean; msg: string } | null>(null)

  const handleSmartParse = () => {
    const parsed = parseSmartText(smartText)
    setSmartParsed(parsed)
    if (parsed.ano)   setSmartDisplayName(`${smartCategory} — ${parsed.nicho ?? 'Multi-nicho'} ${parsed.ano}`)
  }

  const handleSmartImport = async () => {
    if (!smartVendorId || !smartCostPrice || !smartSalePrice || !smartDisplayName) {
      setSmartResult({ ok: false, msg: 'Preencha fornecedor, custo, venda e nome comercial.' }); return
    }
    setSmartImporting(true)
    const specs: Record<string, unknown> = {}
    if (smartParsed?.ano)         specs.year        = smartParsed.ano
    if (smartParsed?.nicho)       specs.nicho       = smartParsed.nicho
    if (smartParsed?.paymentType) specs.paymentType = smartParsed.paymentType
    if (smartParsed?.spendBRL)    specs.spendBRL    = smartParsed.spendBRL
    if (smartParsed?.realId)      specs.realId      = smartParsed.realId

    const tags = [
      smartParsed?.nicho ? smartParsed.nicho.toLowerCase().replace(/\s+/g, '-') : null,
      smartParsed?.paymentType?.toLowerCase() ?? null,
      smartParsed?.ano ? `safra-${smartParsed.ano}` : null,
    ].filter(Boolean).join(',')

    const r = await fetch('/api/compras/ativos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: smartCategory, vendorId: smartVendorId,
        costPrice: parseFloat(smartCostPrice), salePrice: parseFloat(smartSalePrice),
        displayName: smartDisplayName, tags: tags || undefined,
        specs: Object.keys(specs).length ? specs : undefined,
      }),
    })
    if (r.ok) {
      const j = await r.json() as { adsId?: string }
      setSmartResult({ ok: true, msg: `Ativo ${j.adsId ?? ''} cadastrado com sucesso!` })
      setSmartText(''); setSmartParsed(null); setSmartDisplayName(''); setSmartCostPrice(''); setSmartSalePrice('')
    } else {
      const e = await r.json().catch(() => ({})) as { error?: string }
      setSmartResult({ ok: false, msg: e.error ?? 'Erro ao cadastrar.' })
    }
    setSmartImporting(false)
  }

  useEffect(() => {
    fetch('/api/compras/fornecedores?limit=200').then((r) => r.json()).then((j) => setVendors(j.vendors ?? []))
  }, [])

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setRows(parseCsv(text, vendors))
      setResult(null)
    }
    reader.readAsText(file, 'utf-8')
  }, [vendors])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const validRows   = rows.filter((r) => r.valid)
  const invalidRows = rows.filter((r) => !r.valid)

  const importRows = async () => {
    if (!validRows.length) return
    setImporting(true)
    const payload = {
      rows: validRows.map((r) => ({
        category: r.category, subCategory: r.subCategory || undefined,
        vendorId: r.vendorId, costPrice: r.costPrice, salePrice: r.salePrice,
        displayName: r.displayName, description: r.description || undefined, tags: r.tags || undefined,
      })),
    }
    const res = await fetch('/api/compras/ativos/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const j   = await res.json()
    setResult(j as typeof result)
    setImporting(false)
  }

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'template_ativos.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5 max-w-4xl">

      {/* ── Smart Import ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-primary-200 bg-primary-50 dark:bg-primary-950/10 overflow-hidden">
        <button
          onClick={() => setShowSmart((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary-600" />
            <div>
              <p className="font-bold text-sm">⚡ Cadastro Rápido por Texto (Smart Import)</p>
              <p className="text-xs text-zinc-500">Cole o texto bruto do fornecedor — o sistema preenche os campos automaticamente</p>
            </div>
          </div>
          {showSmart ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>

        {showSmart && (
          <div className="border-t border-primary-200 p-4 space-y-4">
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-3 text-xs text-zinc-500 font-mono">
              Ex: <strong>ID: 863-498-6283 Gasto: 238k Nicho: Imobiliaria Ano: 2012 Pag: Manual</strong>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold">Texto do fornecedor</label>
              <textarea
                value={smartText}
                onChange={(e) => setSmartText(e.target.value)}
                placeholder="Cole aqui o texto bruto do fornecedor..."
                rows={3}
                className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <button onClick={handleSmartParse} disabled={!smartText.trim()}
                className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 disabled:opacity-40 transition-colors">
                🔍 Analisar Texto
              </button>
            </div>

            {smartParsed && (
              <div className="space-y-3">
                {/* Preview dos campos parseados */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { label: '⚡ ID Real', value: smartParsed.realId ?? '—' },
                    { label: '💰 Gasto', value: smartParsed.spendBRL ? `R$${smartParsed.spendBRL.toLocaleString('pt-BR')}` : '—' },
                    { label: '🏭 Nicho', value: smartParsed.nicho ?? '—' },
                    { label: '🍷 Safra', value: smartParsed.ano ? String(smartParsed.ano) : '—' },
                    { label: '💳 Pag.', value: smartParsed.paymentType ?? '—' },
                  ].map((f) => (
                    <div key={f.label} className={`rounded-lg border p-2 text-center ${f.value !== '—' ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20' : 'border-zinc-200 bg-zinc-50 dark:bg-zinc-800/30'}`}>
                      <p className="text-[10px] text-zinc-500 font-semibold">{f.label}</p>
                      <p className={`text-xs font-bold truncate ${f.value !== '—' ? 'text-emerald-700' : 'text-zinc-400'}`}>{f.value}</p>
                    </div>
                  ))}
                </div>

                {/* Campos a completar */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Categoria *</label>
                    <select value={smartCategory} onChange={(e) => setSmartCategory(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Fornecedor *</label>
                    <select value={smartVendorId} onChange={(e) => setSmartVendorId(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                      <option value="">Selecionar...</option>
                      {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Custo (R$) *</label>
                    <input type="number" step="0.01" min="0" value={smartCostPrice}
                      onChange={(e) => setSmartCostPrice(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                      placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Preço Venda (R$) *</label>
                    <input type="number" step="0.01" min="0" value={smartSalePrice}
                      onChange={(e) => setSmartSalePrice(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                      placeholder="0.00" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold mb-1">Nome Comercial *</label>
                    <input value={smartDisplayName} onChange={(e) => setSmartDisplayName(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                      placeholder="Ex: Gold Account — Imobiliária 2012" />
                  </div>
                </div>

                <button onClick={handleSmartImport} disabled={smartImporting}
                  className="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                  {smartImporting ? <><Loader2 className="w-4 h-4 animate-spin" />Cadastrando...</> : <><Zap className="w-4 h-4" />Cadastrar Ativo</>}
                </button>

                {smartResult && (
                  <div className={`rounded-xl border p-3 flex items-center gap-2 text-sm ${smartResult.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                    {smartResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                    {smartResult.msg}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Coluna de fornecedores disponíveis */}
      {vendors.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3">
          <p className="text-xs font-semibold text-blue-700 mb-1">Fornecedores disponíveis (usar exatamente o nome na coluna vendorName):</p>
          <div className="flex flex-wrap gap-1">
            {vendors.map((v) => <span key={v.id} className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-blue-200 text-xs font-mono">{v.name}</span>)}
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={onDrop} onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-zinc-300 dark:border-zinc-600 rounded-2xl p-10 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-950/10 transition-colors"
      >
        <Upload className="w-8 h-8 mx-auto text-zinc-400 mb-3" />
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Arraste o arquivo CSV aqui ou <span className="text-primary-600 underline">clique para selecionar</span></p>
        <p className="text-xs text-zinc-400 mt-1">Formatos suportados: .csv (UTF-8)</p>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
      </div>

      {/* Preview */}
      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-bold">{validRows.length} válidos</span>
            {invalidRows.length > 0 && <span className="px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-bold">{invalidRows.length} com erro</span>}
            <span className="text-xs text-zinc-500">{rows.length} linhas no total</span>
          </div>

          {invalidRows.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/10 p-3 space-y-1">
              <p className="text-xs font-bold text-red-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Erros encontrados:</p>
              {invalidRows.map((r, i) => (
                <p key={i} className="text-xs text-red-600">• {r.displayName || r.vendorName || 'Linha'}: {r.error}</p>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                <tr className="text-left text-zinc-500 font-semibold">
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Nome Comercial</th>
                  <th className="px-3 py-2">Fornecedor</th>
                  <th className="px-3 py-2">Custo</th>
                  <th className="px-3 py-2">Venda</th>
                  <th className="px-3 py-2">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className={r.valid ? '' : 'bg-red-50/50 dark:bg-red-950/10'}>
                    <td className="px-3 py-2">{r.valid ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}</td>
                    <td className="px-3 py-2">{r.category}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{r.displayName}</td>
                    <td className="px-3 py-2">{r.vendorName}</td>
                    <td className="px-3 py-2">R$ {r.costPrice.toFixed(2)}</td>
                    <td className="px-3 py-2">R$ {r.salePrice.toFixed(2)}</td>
                    <td className="px-3 py-2 max-w-[120px] truncate">{r.tags}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 20 && <p className="text-center text-xs text-zinc-400 py-2">... e mais {rows.length - 20} linhas</p>}
          </div>

          {validRows.length > 0 && (
            <button onClick={importRows} disabled={importing}
              className="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importing ? 'Importando...' : `Importar ${validRows.length} ativo(s)`}
            </button>
          )}
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div className={`rounded-xl border p-4 ${result.failed === 0 ? 'border-green-200 bg-green-50 dark:bg-green-950/10' : 'border-amber-200 bg-amber-50 dark:bg-amber-950/10'}`}>
          <div className="flex items-center gap-2 mb-2">
            {result.failed === 0 ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertTriangle className="w-5 h-5 text-amber-600" />}
            <p className="font-bold">{result.created} de {result.total} ativos importados com sucesso</p>
          </div>
          {result.errors.length > 0 && (
            <div className="space-y-1">
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">• Linha {e.row}: {e.error}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
