'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { ConsultaCnpjResult } from '@/lib/receita-cnpj-types'
import { ADS_CORE_DUPLICATE_MSG, formatCnpjDisplay, normalizeAdsCoreCnpj } from '@/lib/ads-core-utils'

type Niche = {
  id: string
  name: string
  allowedCnaeCodes: string[]
  congruenceKeywords: string[]
}

export function AdsCoreGerenteClient() {
  const [niches, setNiches] = useState<Niche[]>([])
  const [producers, setProducers] = useState<
    { id: string; name: string | null; email: string | null; adsCoreOpenCount?: number }[]
  >([])
  const [cnpjInput, setCnpjInput] = useState('')
  const [consulta, setConsulta] = useState<ConsultaCnpjResult | null>(null)
  const [consultLoading, setConsultLoading] = useState(false)
  const [consultError, setConsultError] = useState('')
  const [cnpjUniqueState, setCnpjUniqueState] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle')
  const [cnpjUniqueMsg, setCnpjUniqueMsg] = useState('')

  const [nicheId, setNicheId] = useState('')
  const [verificationTrack, setVerificationTrack] = useState<'G2_ANUNCIANTE' | 'ANUNCIANTE_COMERCIAL'>(
    'G2_ANUNCIANTE'
  )
  const [siteUrl, setSiteUrl] = useState('')
  /** Representante legal — conferência com RG (campos `nome_socio` / `cpf_socio`). */
  const [nomeRepresentante, setNomeRepresentante] = useState('')
  const [cpfRepresentante, setCpfRepresentante] = useState('')
  const [producerId, setProducerId] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)
  const [confirmIncongruent, setConfirmIncongruent] = useState(false)
  const [pendingG2, setPendingG2] = useState(false)
  const [siteCheck, setSiteCheck] = useState<'idle' | 'checking' | 'ok' | 'bad'>('idle')
  const [siteMsg, setSiteMsg] = useState('')

  const [csvText, setCsvText] = useState('')
  const [csvBusy, setCsvBusy] = useState(false)
  const [csvError, setCsvError] = useState('')
  const [csvImportResult, setCsvImportResult] = useState<{
    imported: number
    failed: number
    errors: { line: number; error: string }[]
  } | null>(null)
  const [producerLoadHint, setProducerLoadHint] = useState<string | null>(null)

  const loadNiches = useCallback(async () => {
    const nRes = await fetch('/api/ads-core/niches')
    const nData = await nRes.json()
    if (nRes.ok && Array.isArray(nData)) {
      setNiches(
        nData.map((x: Niche & { allowedCnaeCodes?: string[] }) => ({
          id: x.id,
          name: x.name,
          allowedCnaeCodes: x.allowedCnaeCodes ?? [],
          congruenceKeywords: x.congruenceKeywords ?? [],
        }))
      )
    }
  }, [])

  const loadProducersForNiche = useCallback(async (nid: string) => {
    const url = nid.trim()
      ? `/api/admin/producers?adsCoreNicheId=${encodeURIComponent(nid.trim())}`
      : '/api/admin/producers'
    const pRes = await fetch(url)
    const pJson = (await pRes.json()) as {
      users?: { id: string; name: string | null; email: string | null }[]
      message?: string
    }
    if (pRes.ok && pJson?.users) {
      setProducers(pJson.users)
      setProducerLoadHint(pJson.message ?? null)
    }
  }, [])

  useEffect(() => {
    void loadNiches()
  }, [loadNiches])

  useEffect(() => {
    const digits = normalizeAdsCoreCnpj(cnpjInput)
    if (digits.length !== 14) {
      setCnpjUniqueState('idle')
      setCnpjUniqueMsg('')
      return
    }
    setCnpjUniqueState('checking')
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/ads-core/assets/check-unique?cnpj=${encodeURIComponent(digits)}`)
          const j = (await res.json()) as { available?: boolean; message?: string }
          if (j.available === false) {
            setCnpjUniqueState('taken')
            setCnpjUniqueMsg(j.message || 'CNPJ indisponível.')
          } else {
            setCnpjUniqueState('ok')
            setCnpjUniqueMsg('')
          }
        } catch {
          setCnpjUniqueState('idle')
          setCnpjUniqueMsg('')
        }
      })()
    }, 450)
    return () => window.clearTimeout(t)
  }, [cnpjInput])

  useEffect(() => {
    void loadProducersForNiche(nicheId)
  }, [nicheId, loadProducersForNiche])

  useEffect(() => {
    if (!producerId) return
    if (!producers.some((p) => p.id === producerId)) setProducerId('')
  }, [producers, producerId])

  async function consultarReceita() {
    setConsultError('')
    setConsulta(null)
    setConfirmIncongruent(false)
    setPendingG2(false)
    const digits = normalizeAdsCoreCnpj(cnpjInput)
    if (digits.length !== 14) {
      setConsultError('Informe um CNPJ com 14 dígitos.')
      return
    }
    setConsultLoading(true)
    try {
      const res = await fetch('/api/ads-core/assets/consulta-cnpj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: digits }),
      })
      const j = (await res.json()) as ConsultaCnpjResult & { error?: string; code?: string }
      if (!res.ok) {
        setConsultError(j.error || 'Não foi possível consultar o CNPJ.')
        return
      }
      setConsulta(j as ConsultaCnpjResult)
    } catch {
      setConsultError('Falha de rede ao consultar o CNPJ.')
    } finally {
      setConsultLoading(false)
    }
  }

  async function checkSiteBlur() {
    const raw = siteUrl.trim()
    if (!raw) {
      setSiteCheck('idle')
      setSiteMsg('')
      return
    }
    setSiteCheck('checking')
    setSiteMsg('')
    const q = new URLSearchParams()
    q.set('siteUrl', raw)
    const res = await fetch(`/api/ads-core/assets/check-unique?${q.toString()}`)
    const j = (await res.json()) as { available?: boolean; message?: string }
    const ok = res.ok && j.available
    if (!ok) {
      const msg = j.message || ADS_CORE_DUPLICATE_MSG
      setSiteUrl('')
      setSiteCheck('idle')
      setSiteMsg(msg)
      return
    }
    setSiteCheck('ok')
    setSiteMsg('')
  }

  async function criarAtivo() {
    if (!consulta) {
      setConsultError('Consulte o CNPJ na Receita antes de criar o ativo.')
      return
    }
    const digits = normalizeAdsCoreCnpj(cnpjInput)
    if (digits.length !== 14) {
      setConsultError('CNPJ inválido.')
      return
    }
    if (!nicheId) {
      setConsultError('Selecione um nicho.')
      return
    }
    const cpfDigits = cpfRepresentante.replace(/\D/g, '')
    if (cpfRepresentante.trim() && cpfDigits.length !== 11) {
      setConsultError('CPF do representante: informe 11 dígitos ou deixe em branco.')
      return
    }
    setSubmitLoading(true)
    setConsultError('')
    try {
      const res = await fetch('/api/ads-core/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nicheId,
          cnpj: digits,
          siteUrl: siteUrl.trim() || undefined,
          producerId: producerId || null,
          verificationTrack,
          confirmIncongruent: pendingG2 ? confirmIncongruent : undefined,
          nomeSocio: nomeRepresentante.trim() || undefined,
          cpfSocio: cpfDigits.length === 11 ? cpfRepresentante : undefined,
        }),
      })
      const j = (await res.json()) as { error?: string; code?: string }
      if (!res.ok) {
        if (j.code === 'CNAE_INCONGRUENTE') {
          setPendingG2(true)
          setConsultError(j.error || '')
          return
        }
        setConsultError(j.error || 'Não foi possível criar o ativo.')
        return
      }
      setCnpjInput('')
      setConsulta(null)
      setSiteUrl('')
      setNomeRepresentante('')
      setCpfRepresentante('')
      setProducerId('')
      setNicheId('')
      setVerificationTrack('G2_ANUNCIANTE')
      setConfirmIncongruent(false)
      setPendingG2(false)
      setSiteCheck('idle')
      setSiteMsg('')
      alert('Ativo criado com sucesso.')
    } catch {
      setConsultError('Erro ao enviar o cadastro.')
    } finally {
      setSubmitLoading(false)
    }
  }

  function downloadCsvTemplate() {
    const header =
      'nicheId,cnpj,razaoSocial,nomeFantasia,endereco,emailEmpresa,telefone,cnae,cnaeDescricao,cnaeSecundarios,statusReceita,siteUrl,producerId,statusProducao,verificationTrack'
    const nid = niches[0]?.id ?? 'SUBSTITUA_PELO_ID_REAL_DO_NICHO'
    const example = `${nid},00000000000191,Empresa Exemplo LTDA,Marca,"Av. Paulista, 1000",contato@exemplo.com.br,11999999999,4711302,Comércio varejista,"",ATIVA,,,DISPONIVEL,G2_ANUNCIANTE`
    const blob = new Blob([`${header}\n${example}\n`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'ads-core-ativos-modelo.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importarCsv() {
    const t = csvText.trim()
    if (t.length < 10) {
      setCsvError('Cole ou envie um CSV com cabeçalho e ao menos uma linha de dados.')
      return
    }
    setCsvBusy(true)
    setCsvError('')
    setCsvImportResult(null)
    try {
      const res = await fetch('/api/ads-core/assets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: t }),
      })
      const j = (await res.json()) as {
        error?: string
        imported?: number
        failed?: number
        errors?: { line: number; error: string }[]
      }
      if (!res.ok) {
        setCsvError(j.error || 'Não foi possível importar.')
        return
      }
      setCsvImportResult({
        imported: j.imported ?? 0,
        failed: j.failed ?? 0,
        errors: Array.isArray(j.errors) ? j.errors : [],
      })
    } catch {
      setCsvError('Falha de rede ao importar.')
    } finally {
      setCsvBusy(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
    <div className="card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-primary-600 mb-1">Preparação de ativo (entrada única)</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Automatização anti-erro: ao consultar o CNPJ, a Receita preenche razão social, fantasia, endereço, e-mail,
          telefone e situação cadastral. O cadastro só prossegue com situação <strong>ativa</strong>. Em seguida informe
          o site (único no banco), o representante para bater com o RG e, se aplicável, o produtor. Envio de{' '}
          <strong>Cartão CNPJ / RG frente / verso</strong> continua na tela de{' '}
          <Link href="/dashboard/ads-core/atribuicao" className="text-primary-600 dark:text-primary-400 hover:underline">
            estoque e atribuição
          </Link>{' '}
          (miniatura/preview na subida).
        </p>
      </div>

      <div className="rounded-lg border border-sky-500/25 bg-sky-950/15 px-3 py-2 text-[11px] text-sky-100/90 leading-snug">
        <p className="font-medium text-sky-200 mb-1">Status no ERP (segurança e segregação)</p>
        <ul className="list-disc list-inside space-y-0.5 text-sky-100/85">
          <li>
            <strong>Disponível</strong> — <code className="text-[10px]">DISPONIVEL</code>: no estoque (com ou sem
            produtor atribuído).
          </li>
          <li>
            <strong>Em uso</strong> — <code className="text-[10px]">EM_PRODUCAO</code>: colaborador abriu o ativo;
            documentos e texto só para o dono (<code className="text-[10px]">producer_id</code>).
          </li>
          <li>
            <strong>G2 / verificação</strong> — <code className="text-[10px]">VERIFICACAO_G2</code> até conclusão.
          </li>
          <li>
            <strong>Utilizado / G2 OK</strong> — <code className="text-[10px]">APROVADO</code> (reprovados:{' '}
            <code className="text-[10px]">REPROVADO</code>).
          </li>
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">CNPJ</label>
          <input
            className="input-field w-full font-mono text-sm"
            value={cnpjInput}
            onChange={(e) => setCnpjInput(e.target.value)}
            placeholder="00.000.000/0001-00"
            inputMode="numeric"
          />
        </div>
        <button
          type="button"
          disabled={consultLoading}
          onClick={() => void consultarReceita()}
          className="btn-primary text-sm shrink-0"
        >
          {consultLoading ? 'Consultando…' : 'Consultar Receita'}
        </button>
      </div>

      {cnpjUniqueState === 'checking' && normalizeAdsCoreCnpj(cnpjInput).length === 14 && (
        <p className="text-xs text-gray-500">Verificando unicidade do CNPJ…</p>
      )}
      {cnpjUniqueState === 'ok' && normalizeAdsCoreCnpj(cnpjInput).length === 14 && (
        <p className="text-xs text-green-700 dark:text-green-400">CNPJ disponível para novo cadastro (não há duplicidade no banco).</p>
      )}
      {cnpjUniqueState === 'taken' && cnpjUniqueMsg && (
        <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
          {cnpjUniqueMsg}
        </p>
      )}

      {consultError && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {consultError}
        </p>
      )}

      {consulta && (
        <div className="rounded-lg border border-gray-200 dark:border-white/10 p-3 space-y-1 text-sm bg-gray-50/80 dark:bg-white/5">
          <p className="text-xs font-medium text-gray-500 mb-2">Pré-visualização (Receita Federal)</p>
          <p>
            <span className="text-gray-500">Razão social:</span> {consulta.razaoSocial || '—'}
          </p>
          <p>
            <span className="text-gray-500">Nome fantasia:</span> {consulta.nomeFantasia || '—'}
          </p>
          <p>
            <span className="text-gray-500">Endereço:</span> {consulta.endereco || '—'}
          </p>
          <p>
            <span className="text-gray-500">E-mail:</span> {consulta.emailEmpresa || '—'}
          </p>
          <p>
            <span className="text-gray-500">Telefone:</span> {consulta.telefone || '—'}
          </p>
          <p>
            <span className="text-gray-500">CNAE:</span>{' '}
            <span className="font-mono">{consulta.cnae || '—'}</span>
            {consulta.cnaeDescricao ? ` — ${consulta.cnaeDescricao}` : ''}
          </p>
          <p>
            <span className="text-gray-500">Situação cadastral:</span>{' '}
            <span className="font-medium text-gray-800 dark:text-gray-100">{consulta.statusReceita}</span>
            <span className="text-[11px] text-gray-500"> — cadastro bloqueado se não estiver ativa</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Nicho</label>
          <select
            className="input-field w-full text-sm"
            value={nicheId}
            onChange={(e) => {
              setNicheId(e.target.value)
              setConfirmIncongruent(false)
              setPendingG2(false)
              setProducerId('')
            }}
          >
            <option value="">Selecione…</option>
            {niches.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Responsável pela execução (opcional)
          </label>
          <select
            className="input-field w-full text-sm"
            value={producerId}
            onChange={(e) => setProducerId(e.target.value)}
          >
            <option value="">—</option>
            {producers.map((u) => {
              const label = (u.name || u.email || u.id).trim()
              const n = u.adsCoreOpenCount ?? 0
              return (
                <option key={u.id} value={u.id}>
                  {label} — {n} {n === 1 ? 'demanda na esteira' : 'demandas na esteira'}
                </option>
              )
            })}
          </select>
          {producerLoadHint && (
            <p className="text-[11px] text-gray-500 mt-1 leading-snug">{producerLoadHint}</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Meta de verificação (tipo de demanda)</label>
        <select
          className="input-field w-full text-sm"
          value={verificationTrack}
          onChange={(e) =>
            setVerificationTrack(e.target.value as 'G2_ANUNCIANTE' | 'ANUNCIANTE_COMERCIAL')
          }
        >
          <option value="G2_ANUNCIANTE">G2 + Verificação de Anunciante</option>
          <option value="ANUNCIANTE_COMERCIAL">Verificação de Anunciante + Operações Comerciais</option>
        </select>
        <p className="text-[11px] text-gray-500 mt-1">
          O produtor vê esta meta em destaque na esteira; use para alinhar expectativa com a verificação exigida pela
          plataforma.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Site / domínio (editável)</label>
        <input
          type="url"
          className="input-field w-full text-sm"
          value={siteUrl}
          onChange={(e) => {
            setSiteUrl(e.target.value)
            setSiteCheck('idle')
            setSiteMsg('')
          }}
          onBlur={() => void checkSiteBlur()}
          placeholder="https://..."
        />
        {siteCheck === 'checking' && <p className="text-xs text-gray-500 mt-1">Verificando unicidade…</p>}
        {siteCheck === 'ok' && siteUrl.trim() && (
          <p className="text-xs text-green-700 dark:text-green-400 mt-1">URL disponível.</p>
        )}
        {siteMsg && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1" role="status">
            {siteMsg}
          </p>
        )}
        <p className="text-[11px] text-gray-500 mt-1">
          Ao sair do campo, verificamos unicidade e histórico de URLs (footprint). Se o domínio for recusado, o
          campo é limpo automaticamente. Na verificação G2, o rodapé do site deve refletir CNPJ e razão social conforme o
          cartão — o produtor recebe o texto sugerido para colar.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Representante legal (nome no RG)
          </label>
          <input
            className="input-field w-full text-sm"
            value={nomeRepresentante}
            onChange={(e) => setNomeRepresentante(e.target.value)}
            placeholder="Nome completo"
            maxLength={200}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">CPF do representante</label>
          <input
            className="input-field w-full text-sm font-mono"
            value={cpfRepresentante}
            onChange={(e) => setCpfRepresentante(e.target.value)}
            placeholder="000.000.000-00"
            inputMode="numeric"
            maxLength={18}
          />
          <p className="text-[11px] text-gray-500 mt-1">Opcional no cadastro; usado para cruzar com RG frente/verso.</p>
        </div>
      </div>

      {pendingG2 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 space-y-2">
          <p className="text-sm text-amber-200">
            O CNAE / atividade não bate com o nicho configurado. Para gravar mesmo assim, confirme abaixo
            (auditoria).
          </p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={confirmIncongruent}
              onChange={(e) => setConfirmIncongruent(e.target.checked)}
            />
            Confirmo que assumo o risco de reprovação G2 e autorizo o cadastro.
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={
            submitLoading ||
            !consulta ||
            !nicheId ||
            (pendingG2 && !confirmIncongruent) ||
            cnpjUniqueState === 'taken' ||
            cnpjUniqueState === 'checking'
          }
          onClick={() => void criarAtivo()}
          className="btn-primary text-sm"
        >
          {submitLoading ? 'Salvando…' : 'Criar ativo'}
        </button>
        {consulta && (
          <span className="text-xs text-gray-500 self-center">
            CNPJ na fila: {formatCnpjDisplay(normalizeAdsCoreCnpj(cnpjInput))}
          </span>
        )}
      </div>
    </div>

    <div className="card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-primary-600 mb-1">Alimentação em lote (CSV)</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Importe vários ativos de uma vez (milhares de linhas: o backend deduplica antes de gravar). Planilhas no Google
          Drive: exporte como CSV UTF-8 e use <strong className="text-gray-300">Carregar arquivo</strong>. Congruência
          CNAE × nicho como no cadastro manual. CNPJ e <code className="text-[11px]">siteUrl</code> checados — duplicidade:{' '}
          <span className="text-gray-500">{ADS_CORE_DUPLICATE_MSG}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary text-sm" onClick={downloadCsvTemplate}>
          Baixar modelo (.csv)
        </button>
        <label className="btn-secondary text-sm cursor-pointer inline-flex items-center">
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const reader = new FileReader()
              reader.onload = () => {
                setCsvText(String(reader.result ?? ''))
                setCsvError('')
                setCsvImportResult(null)
              }
              reader.readAsText(f, 'UTF-8')
              e.target.value = ''
            }}
          />
          Carregar arquivo…
        </label>
      </div>

      {niches.length > 0 && (
        <details className="rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-white/5 text-xs">
          <summary className="cursor-pointer px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
            IDs de nicho (use na coluna nicheId)
          </summary>
          <ul className="px-3 pb-3 pt-0 space-y-1 font-mono text-[11px] text-gray-700 dark:text-gray-300">
            {niches.map((n) => (
              <li key={n.id}>
                <span className="text-primary-600 dark:text-primary-400">{n.id}</span> — {n.name}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Conteúdo CSV (UTF-8)</label>
        <textarea
          className="input-field w-full text-xs font-mono min-h-[160px]"
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value)
            setCsvError('')
            setCsvImportResult(null)
          }}
          placeholder="nicheId,cnpj,razaoSocial,..."
          spellCheck={false}
        />
      </div>

      {csvError && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {csvError}
        </p>
      )}

      {csvImportResult && (
        <div
          className="rounded-lg border border-gray-200 dark:border-white/10 p-3 text-sm space-y-2"
          role="status"
        >
          <p>
            Importados: <strong className="text-green-600 dark:text-green-400">{csvImportResult.imported}</strong> ·
            Linhas com erro: <strong className="text-amber-600 dark:text-amber-400">{csvImportResult.failed}</strong>
          </p>
          {csvImportResult.errors.length > 0 && (
            <ul className="max-h-40 overflow-y-auto text-xs font-mono space-y-1 text-gray-600 dark:text-gray-400">
              {csvImportResult.errors.slice(0, 50).map((err, idx) => (
                <li key={`${err.line}-${idx}-${err.error.slice(0, 24)}`}>
                  Linha {err.line}: {err.error}
                </li>
              ))}
              {csvImportResult.errors.length > 50 && (
                <li className="text-amber-600">… e mais {csvImportResult.errors.length - 50} erro(s)</li>
              )}
            </ul>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={csvBusy || !csvText.trim()}
        onClick={() => void importarCsv()}
        className="btn-primary text-sm"
      >
        {csvBusy ? 'Importando…' : 'Processar importação'}
      </button>
      <p className="text-[11px] text-gray-500">
        Colunas opcionais: producerId (id do usuário produtor), siteUrl, verificationTrack (
        <code className="text-[10px]">G2_ANUNCIANTE</code> ou{' '}
        <code className="text-[10px]">ANUNCIANTE_COMERCIAL</code>), statusProducao (
        <code className="text-[10px]">DISPONIVEL</code> padrão). Documentos (CNPJ/RG) continuam na tela de{' '}
        <Link href="/dashboard/ads-core/atribuicao" className="text-primary-600 dark:text-primary-400 hover:underline">
          estoque e atribuição
        </Link>
        .
      </p>
    </div>
    </div>
  )
}
