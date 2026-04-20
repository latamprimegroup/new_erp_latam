'use client'

import { useState } from 'react'
import Link from 'next/link'

export function AdsCoreRgAbastecimentoClient() {
  const [fileKey, setFileKey] = useState(0)
  const [frentes, setFrentes] = useState<File[]>([])
  const [versos, setVersos] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [detail, setDetail] = useState<string[]>([])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    setDetail([])
    if (frentes.length === 0 || frentes.length !== versos.length) {
      setMsg('Selecione o mesmo número de arquivos para frente e verso (pareamento por ordem de seleção).')
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      for (const f of frentes) fd.append('frente', f)
      for (const f of versos) fd.append('verso', f)
      const res = await fetch('/api/ads-core/rg-stock/bulk', { method: 'POST', body: fd })
      const j = (await res.json()) as {
        ok?: boolean
        created?: number
        failed?: number
        errors?: string[]
        error?: string
      }
      if (!res.ok) {
        setMsg(j.error || 'Falha no envio.')
        return
      }
      setMsg(`Importados ${j.created ?? 0} par(es). Falhas: ${j.failed ?? 0}.`)
      if (Array.isArray(j.errors) && j.errors.length) setDetail(j.errors)
      setFrentes([])
      setVersos([])
      setFileKey((k) => k + 1)
    } catch {
      setMsg('Erro de rede.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="heading-1 mb-1">Abastecimento de identidades (RG)</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Envie pares de imagens (frente + verso) na mesma ordem. Cada par vira um registro <code className="text-xs">DISPONIVEL</code>{' '}
          no estoque; o colaborador sorteia na esteira. Metadados EXIF são removidos no servidor antes do armazenamento.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Frente — múltiplos arquivos (ordem = par 1, par 2, …)</label>
          <input
            key={`f-${fileKey}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="block w-full text-sm"
            onChange={(e) => setFrentes(e.target.files ? [...e.target.files] : [])}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Verso — mesma quantidade e ordem</label>
          <input
            key={`v-${fileKey}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="block w-full text-sm"
            onChange={(e) => setVersos(e.target.files ? [...e.target.files] : [])}
          />
        </div>
        <p className="text-[11px] text-gray-500">
          Limite por requisição definido no servidor (até 80 pares). PDF não é aceito neste fluxo.
        </p>
        <button type="submit" disabled={busy} className="btn-primary text-sm">
          {busy ? 'Enviando…' : 'Processar abastecimento'}
        </button>
      </form>

      {msg && (
        <p className={`text-sm ${msg.startsWith('Importados') ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-300'}`}>
          {msg}
        </p>
      )}
      {detail.length > 0 && (
        <ul className="text-xs font-mono text-gray-600 dark:text-gray-400 space-y-1 max-h-40 overflow-y-auto">
          {detail.map((x, i) => (
            <li key={`${i}-${x.slice(0, 24)}`}>{x}</li>
          ))}
        </ul>
      )}

      <Link href="/dashboard/ads-core" className="text-sm text-primary-600 dark:text-primary-400 hover:underline inline-block">
        ← Voltar ao ADS CORE
      </Link>
    </div>
  )
}
