'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Download, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react'

type Vendor = { id: string; name: string; category: string }

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold">Importação em Lote</h2>
          <p className="text-sm text-zinc-500">Faça upload de um CSV com até 2.000 ativos de uma vez</p>
        </div>
        <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
          <Download className="w-4 h-4" />Baixar Template
        </button>
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
