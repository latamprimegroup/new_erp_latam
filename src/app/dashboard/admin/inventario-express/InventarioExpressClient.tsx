'use client'

import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react'
import {
  Plus,
  Trash2,
  Rocket,
  CheckCircle,
  AlertCircle,
  ClipboardList,
  ChevronDown,
  User,
  Loader2,
} from 'lucide-react'

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface Produtor {
  id: string
  name: string
  email: string
  role: string
}

interface GridRow {
  id: string
  tipoConta: string
  configuracao: string
  documentacao: string
  producerName: string   // nome do produtor selecionado
  idsText: string
}

interface ParsedRow extends GridRow {
  parsedIds: string[]
  uniqueIds: string[]
  duplicatesInternal: string[]
  isValid: boolean
  hasProducer: boolean
}

interface SubmitResult {
  ok: boolean
  totalCriadas?: number
  detalhes?: { row: number; tipoConta: string; produtor: string; criadas: number }[]
  error?: string
  duplicateIds?: string[]
}

// ─── Opções ─────────────────────────────────────────────────────────────────

const TIPO_CONTA_OPTIONS = [
  'BRL Manual',
  'BRL Robusto',
  'USD',
  'EUR',
  'GBP',
  'MXN',
  'ARS',
]

const CONFIGURACAO_OPTIONS = [
  'G2 Manual',
  'Sem G2 / Apenas Verificação',
  'Com Op. Comercial',
  'Sem Gastos',
]

const DOCUMENTACAO_OPTIONS = [
  '1º Formulário',
  '2º Formulário',
  'Ambos',
  'Sem Documentação',
]

// ─── Utilidades ─────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9) }

function parseIds(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.replace(/[\s\-\.]/g, '').trim())
    .filter(Boolean)
}

function uniqueIds(ids: string[]): string[] { return [...new Set(ids)] }

function newRow(producerName = ''): GridRow {
  return {
    id: uid(),
    tipoConta: 'BRL Manual',
    configuracao: 'G2 Manual',
    documentacao: '1º Formulário',
    producerName,
    idsText: '',
  }
}

function parseRow(row: GridRow): ParsedRow {
  const parsedIds = parseIds(row.idsText)
  const uIds = uniqueIds(parsedIds)
  const internalDupes = parsedIds.filter((id, i) => parsedIds.indexOf(id) !== i)
  return {
    ...row,
    parsedIds,
    uniqueIds: uIds,
    duplicatesInternal: [...new Set(internalDupes)],
    isValid: uIds.length > 0 && !!row.producerName,
    hasProducer: !!row.producerName,
  }
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

function SelectField({
  value, onChange, options, tabIndex, onKeyDown, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  tabIndex?: number
  onKeyDown?: (e: KeyboardEvent<HTMLSelectElement>) => void
  placeholder?: string
}) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
        className="w-full appearance-none bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 pr-8 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
    </div>
  )
}

function ProdutorSelect({
  value, onChange, produtores, loading, tabIndex, onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  produtores: Produtor[]
  loading: boolean
  tabIndex?: number
  onKeyDown?: (e: KeyboardEvent<HTMLSelectElement>) => void
}) {
  const isEmpty = !value

  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
        disabled={loading}
        className={`w-full appearance-none bg-white dark:bg-zinc-800 border rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer transition-colors ${
          isEmpty
            ? 'border-amber-300 dark:border-amber-600 text-zinc-400'
            : 'border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
        }`}
      >
        <option value="">— Selecionar produtor —</option>
        {produtores.map((p) => (
          <option key={p.id} value={p.name}>
            {p.name} {p.role === 'ADMIN' ? '(Admin)' : p.role === 'PRODUCTION_MANAGER' ? '(Gerente)' : '(Produtor)'}
          </option>
        ))}
      </select>
      {loading
        ? <Loader2 className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 animate-spin" />
        : <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
      }
    </div>
  )
}

function CountBadge({ unique, dupes }: { unique: number; dupes: number }) {
  if (unique === 0) return <span className="text-zinc-400 text-xs">—</span>
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
        dupes > 0
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
          : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
      }`}>
        {unique} ID{unique !== 1 ? 's' : ''}
      </span>
      {dupes > 0 && (
        <span className="text-[11px] text-amber-600 dark:text-amber-400">
          {dupes} dupl. removida{dupes !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}

// ─── Componente Principal ───────────────────────────────────────────────────

export default function InventarioExpressClient() {
  const [rows, setRows] = useState<GridRow[]>([newRow()])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [produtores, setProdutores] = useState<Produtor[]>([])
  const [produtoresLoading, setProdutoresLoading] = useState(true)

  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  // Carrega lista de produtores ao montar
  useEffect(() => {
    fetch('/api/admin/inventario-express/produtores')
      .then((r) => r.json())
      .then((d) => setProdutores(Array.isArray(d.produtores) ? d.produtores : []))
      .catch(() => setProdutores([]))
      .finally(() => setProdutoresLoading(false))
  }, [])

  // Quando produtores carregarem, pré-preenche o primeiro se só tiver 1 linha vazia
  useEffect(() => {
    if (produtores.length === 0) return
    setRows((prev) =>
      prev.map((r) => (r.producerName ? r : { ...r, producerName: '' }))
    )
  }, [produtores])

  const addRow = useCallback(() => {
    setRows((prev) => {
      const lastProducer = prev[prev.length - 1]?.producerName ?? ''
      return [...prev, newRow(lastProducer)]
    })
  }, [])

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.length === 1 ? prev : prev.filter((r) => r.id !== id))
  }, [])

  const updateRow = useCallback((id: string, field: keyof GridRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }, [])

  const handleSelectKeyDown = useCallback(
    (e: KeyboardEvent<HTMLSelectElement>, rowId: string) => {
      if (e.key === 'Enter') { e.preventDefault(); textareaRefs.current[rowId]?.focus() }
    },
    []
  )

  const parsedRows = rows.map(parseRow)
  const totalIds = parsedRows.reduce((acc, r) => acc + r.uniqueIds.length, 0)
  const allValid = parsedRows.every((r) => r.isValid)
  const hasAnyIds = totalIds > 0
  const missingProducer = parsedRows.some((r) => !r.hasProducer && r.uniqueIds.length > 0)

  async function handleSubmit() {
    setConfirmOpen(false)
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/inventario-express', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: parsedRows.map((r) => ({
            tipoConta:    r.tipoConta,
            configuracao: r.configuracao,
            documentacao: r.documentacao,
            producerName: r.producerName,
            ids:          r.uniqueIds,
          })),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setResult({ ok: false, error: data.error, duplicateIds: data.duplicateIds })
      } else {
        setResult({ ok: true, ...data })
        setRows([newRow()])
      }
    } catch {
      setResult({ ok: false, error: 'Erro de conexão. Tente novamente.' })
    } finally {
      setLoading(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  // Colunas: Tipo/Moeda | Config G2 | Doc | Produtor | Total | IDs | Lixo
  const COLS = 'grid-cols-[140px_160px_140px_180px_72px_1fr_36px]'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/30">
            <Rocket className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="heading-1 text-lg">Inventário Express</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Lançamento em massa · Produtor obrigatório · IDs por linha ou vírgula
            </p>
          </div>
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Adicionar Linha
        </button>
      </div>

      {/* Alerta: produtor faltando */}
      {missingProducer && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-center gap-3">
          <User className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Selecione o <strong>Produtor</strong> em todas as linhas antes de confirmar.
          </p>
        </div>
      )}

      {/* Resultado sucesso */}
      {result?.ok && (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800 dark:text-green-300">
              {result.totalCriadas} conta{result.totalCriadas !== 1 ? 's' : ''} criada{result.totalCriadas !== 1 ? 's' : ''} com sucesso!
            </p>
            <ul className="mt-1 space-y-0.5">
              {result.detalhes?.map((d) => (
                <li key={d.row} className="text-sm text-green-700 dark:text-green-400">
                  · {d.tipoConta} — Produtor: <strong>{d.produtor}</strong> — {d.criadas} conta{d.criadas !== 1 ? 's' : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Resultado erro */}
      {result && !result.ok && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800 dark:text-red-300">{result.error}</p>
            {result.duplicateIds && result.duplicateIds.length > 0 && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-1 font-mono">
                {result.duplicateIds.slice(0, 8).join(', ')}
                {result.duplicateIds.length > 8 && ` + ${result.duplicateIds.length - 8} mais`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-x-auto shadow-sm">
        {/* Cabeçalho */}
        <div className={`bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-700 grid ${COLS} min-w-[900px]`}>
          {['Tipo / Moeda', 'Configuração G2', 'Documentação', 'Produtor *', 'IDs', 'IDs das Contas (Google Ads ID)', ''].map((col) => (
            <div
              key={col}
              className="px-3 py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide border-r border-zinc-200 dark:border-zinc-700 last:border-r-0"
            >
              {col === 'Produtor *'
                ? <span className="flex items-center gap-1"><User className="w-3 h-3" />{col}</span>
                : col
              }
            </div>
          ))}
        </div>

        {/* Linhas */}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 min-w-[900px]">
          {parsedRows.map((row, idx) => (
            <div
              key={row.id}
              className={`grid ${COLS} items-start group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors`}
            >
              {/* Tipo / Moeda */}
              <div className="px-2 py-2 border-r border-zinc-100 dark:border-zinc-800">
                <SelectField
                  value={row.tipoConta}
                  onChange={(v) => updateRow(row.id, 'tipoConta', v)}
                  options={TIPO_CONTA_OPTIONS}
                  tabIndex={(idx * 5) + 1}
                  onKeyDown={(e) => handleSelectKeyDown(e, row.id)}
                />
              </div>

              {/* Configuração */}
              <div className="px-2 py-2 border-r border-zinc-100 dark:border-zinc-800">
                <SelectField
                  value={row.configuracao}
                  onChange={(v) => updateRow(row.id, 'configuracao', v)}
                  options={CONFIGURACAO_OPTIONS}
                  tabIndex={(idx * 5) + 2}
                  onKeyDown={(e) => handleSelectKeyDown(e, row.id)}
                />
              </div>

              {/* Documentação */}
              <div className="px-2 py-2 border-r border-zinc-100 dark:border-zinc-800">
                <SelectField
                  value={row.documentacao}
                  onChange={(v) => updateRow(row.id, 'documentacao', v)}
                  options={DOCUMENTACAO_OPTIONS}
                  tabIndex={(idx * 5) + 3}
                  onKeyDown={(e) => handleSelectKeyDown(e, row.id)}
                />
              </div>

              {/* Produtor */}
              <div className="px-2 py-2 border-r border-zinc-100 dark:border-zinc-800">
                <ProdutorSelect
                  value={row.producerName}
                  onChange={(v) => updateRow(row.id, 'producerName', v)}
                  produtores={produtores}
                  loading={produtoresLoading}
                  tabIndex={(idx * 5) + 4}
                  onKeyDown={(e) => handleSelectKeyDown(e, row.id)}
                />
                {!row.producerName && row.uniqueIds.length > 0 && (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Obrigatório</p>
                )}
              </div>

              {/* Total */}
              <div className="px-2 py-2 border-r border-zinc-100 dark:border-zinc-800 flex items-center justify-center min-h-[52px]">
                <CountBadge unique={row.uniqueIds.length} dupes={row.duplicatesInternal.length} />
              </div>

              {/* IDs */}
              <div className="px-2 py-2 border-r border-zinc-100 dark:border-zinc-800">
                <textarea
                  ref={(el) => { textareaRefs.current[row.id] = el }}
                  value={row.idsText}
                  onChange={(e) => updateRow(row.id, 'idsText', e.target.value)}
                  tabIndex={(idx * 5) + 5}
                  placeholder={'Cole os IDs aqui — um por linha ou separados por vírgula\nEx: 1234567890\n     0987654321'}
                  rows={3}
                  className="w-full resize-y text-xs font-mono bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[72px]"
                />
                {row.uniqueIds.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-zinc-400 font-mono truncate">
                    {row.uniqueIds.slice(0, 4).join(' · ')}
                    {row.uniqueIds.length > 4 && ` +${row.uniqueIds.length - 4}`}
                  </p>
                )}
              </div>

              {/* Remover */}
              <div className="px-1 py-2 flex items-start justify-center pt-3">
                <button
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length === 1}
                  title="Remover linha"
                  className="p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 dark:hover:text-red-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rodapé */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-zinc-400" />
          <div className="text-sm space-y-0.5">
            <div>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">{totalIds} conta{totalIds !== 1 ? 's' : ''}</span>
              <span className="text-zinc-500"> em {rows.length} linha{rows.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {parsedRows.filter((r) => r.uniqueIds.length > 0).map((r) => (
                <span key={r.id} className="text-xs text-zinc-400">
                  {r.tipoConta}
                  {r.producerName ? ` / ${r.producerName.split(' ')[0]}` : ''}
                  : {r.uniqueIds.length}
                </span>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!hasAnyIds || !allValid || loading || missingProducer}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Rocket className="w-4 h-4" />
          {loading ? 'Salvando…' : `Confirmar Lançamento (${totalIds})`}
        </button>
      </div>

      {/* Modal de confirmação */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-ads-lg w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/30">
                <Rocket className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h2 className="font-bold text-zinc-900 dark:text-zinc-100 text-lg">Confirmar Lançamento</h2>
                <p className="text-sm text-zinc-500">Esta ação é irreversível</p>
              </div>
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 space-y-2">
              {parsedRows.filter((r) => r.uniqueIds.length > 0).map((r) => (
                <div key={r.id} className="flex items-start justify-between text-sm gap-2">
                  <div>
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">{r.tipoConta}</span>
                    <span className="text-zinc-400 mx-1">·</span>
                    <span className="text-zinc-500">{r.configuracao}</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <User className="w-3 h-3 text-zinc-400" />
                      <span className="text-xs text-zinc-400">{r.producerName}</span>
                    </div>
                  </div>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                    {r.uniqueIds.length} conta{r.uniqueIds.length !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 mt-2 flex justify-between font-bold text-sm">
                <span className="text-zinc-700 dark:text-zinc-200">Total</span>
                <span className="text-primary-600 dark:text-primary-400">{totalIds} contas → DISPONÍVEL</span>
              </div>
            </div>

            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              As contas ficarão visíveis imediatamente no estoque com as informações de produtor, tipo e configuração.
            </p>

            <div className="flex gap-3">
              <button onClick={() => setConfirmOpen(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleSubmit} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <Rocket className="w-4 h-4" /> Lançar Agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
