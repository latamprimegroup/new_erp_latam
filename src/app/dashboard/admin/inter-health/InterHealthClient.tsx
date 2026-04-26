'use client'

/**
 * InterHealthClient — Painel de Saúde da Integração Banco Inter
 *
 * CEO pode em tempo real:
 *   1. Verificar se os certificados mTLS estão carregados
 *   2. Verificar se o token OAuth2 está sendo obtido com sucesso
 *   3. Ver qual URL de webhook está registrada no Inter
 *   4. Re-registrar o webhook para uma nova URL (ex: após migração de domínio)
 *   5. Monitorar os últimos 10 eventos PIX recebidos com status de processamento
 */

import { useState, useEffect, useCallback } from 'react'

const STATUS_COLORS: Record<string, string> = {
  PROCESSED:  'text-green-400',
  DUPLICATE:  'text-yellow-400',
  NOT_FOUND:  'text-orange-400',
  ERROR:      'text-red-400',
}
const STATUS_EMOJI: Record<string, string> = {
  PROCESSED:  '✅',
  DUPLICATE:  '⚠️',
  NOT_FOUND:  '❓',
  ERROR:      '❌',
}

type PixLog = {
  id:          string
  txid:        string
  e2eid:       string | null
  amount:      number | null
  status:      string
  receivedAt:  string
  processedAt: string | null
  errorMsg:    string | null
}

type Health = {
  timestamp:      string
  tokenOk:        boolean
  certsFound:     boolean
  webhookUrl:     string | null
  lastError:      string | null
  latencyMs:      number
  recentWebhooks: PixLog[]
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function InterHealthClient() {
  const [data, setData]         = useState<Health | null>(null)
  const [loading, setLoading]   = useState(true)
  const [newUrl, setNewUrl]     = useState('')
  const [regMsg, setRegMsg]     = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [regLoading, setRegLoad] = useState(false)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/inter')
    setData(await r.json().catch(() => null))
    setLoading(false)
  }, [])

  useEffect(() => { fetchHealth() }, [fetchHealth])

  async function registerWebhook() {
    if (!newUrl) return
    setRegLoad(true); setRegMsg(null)
    const r = await fetch('/api/admin/inter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callbackUrl: newUrl }),
    })
    const json = await r.json()
    if (r.ok) { setRegMsg({ type: 'ok', text: `Webhook registrado: ${json.registeredUrl}` }); fetchHealth() }
    else       { setRegMsg({ type: 'err', text: json.error ?? 'Erro ao registrar' }) }
    setRegLoad(false)
  }

  const healthy = data?.tokenOk && data?.certsFound

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">🏛️ Saúde da API Banco Inter</h1>
          <p className="text-zinc-400 text-sm mt-0.5">OAuth2 · mTLS · PIX Dinâmico · Webhook Monitor</p>
        </div>
        <button onClick={fetchHealth} disabled={loading} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 transition disabled:opacity-40">
          {loading ? '⏳ Verificando…' : '🔄 Verificar agora'}
        </button>
      </div>

      {/* Status geral */}
      <div className={`rounded-2xl border p-5 ${healthy ? 'border-green-500/40 bg-green-600/5' : 'border-red-500/40 bg-red-600/5'}`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{healthy ? '✅' : '🚨'}</span>
          <div>
            <p className="font-bold text-white text-lg">{healthy ? 'Integração Operacional' : 'Atenção: Problema Detectado'}</p>
            <p className="text-sm text-zinc-400">{data?.timestamp ? new Date(data.timestamp).toLocaleString('pt-BR') : '—'} · Latência: {data?.latencyMs ?? 0}ms</p>
          </div>
        </div>
        {data?.lastError && (
          <div className="mt-3 rounded-lg bg-red-600/10 border border-red-600/20 p-3">
            <p className="text-xs font-mono text-red-300 break-all">{data.lastError}</p>
          </div>
        )}
      </div>

      {/* Checklist de componentes */}
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          {
            label:    'Certificados mTLS',
            ok:       data?.certsFound ?? false,
            detail:   data?.certsFound ? 'certs/inter.crt + inter.key carregados' : 'Coloque inter.crt e inter.key em /certs/',
            icon:     '🔐',
          },
          {
            label:    'Token OAuth2',
            ok:       data?.tokenOk ?? false,
            detail:   data?.tokenOk ? 'Client Credentials OK' : 'Verifique INTER_CLIENT_ID e INTER_CLIENT_SECRET',
            icon:     '🔑',
          },
          {
            label:    'Webhook PIX',
            ok:       Boolean(data?.webhookUrl),
            detail:   data?.webhookUrl ?? 'Não registrado — configure abaixo',
            icon:     '📡',
          },
        ].map((c) => (
          <div key={c.label} className={`rounded-2xl border p-4 ${c.ok ? 'border-zinc-700/50 bg-zinc-900/70' : 'border-orange-500/30 bg-orange-600/5'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span>{c.icon}</span>
              <span className={`text-xs font-bold uppercase ${c.ok ? 'text-green-400' : 'text-orange-400'}`}>{c.ok ? '✓' : '✗'} {c.label}</span>
            </div>
            <p className="text-xs text-zinc-500 break-all">{c.detail}</p>
          </div>
        ))}
      </div>

      {/* Credenciais configuradas */}
      <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-5 space-y-3">
        <h2 className="text-base font-bold text-white">⚙️ Credenciais Inter (configuradas via .env)</h2>
        <div className="grid sm:grid-cols-2 gap-2 text-xs font-mono">
          {[
            ['INTER_CLIENT_ID',     data?.clientIdPreview ?? '(verificando...)'],
            ['INTER_CLIENT_SECRET', data?.tokenOk ? '✅ configurado' : '❌ não configurado ou inválido'],
            ['INTER_PIX_KEY',       data?.pixKeyConfigured ? '✅ configurada' : '❌ não configurada'],
            ['INTER_ACCOUNT_NUMBER', data?.accountConfigured ? '✅ configurado' : '❌ não configurado'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2">
              <span className="text-violet-400">{k}</span>
              <span className="text-zinc-500 truncate">{v}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-600">Para alterar as credenciais, edite o arquivo <code className="bg-zinc-800 px-1 rounded">.env</code> no servidor e reinicie o app.</p>
      </div>

      {/* Registro de Webhook */}
      <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white">📡 Registrar Webhook PIX</h2>
          <p className="text-xs text-zinc-500 mt-0.5">O Inter só aceita URLs HTTPS em produção. O webhook atual: <span className="text-violet-400">{data?.webhookUrl ?? 'não registrado'}</span></p>
        </div>
        <div className="flex gap-3">
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://seudominio.com/api/webhooks/inter/pix"
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 font-mono"
          />
          <button onClick={registerWebhook} disabled={regLoading || !newUrl} className="rounded-lg bg-violet-600 hover:bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition">
            {regLoading ? '…' : 'Registrar'}
          </button>
        </div>
        {regMsg && <p className={`text-sm font-medium ${regMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{regMsg.text}</p>}
        <div className="rounded-lg bg-blue-600/10 border border-blue-600/20 p-3">
          <p className="text-xs text-blue-300">
            <strong>Configuração automática:</strong> Após registrar, o Inter enviará notificações PIX para esta URL.<br />
            O sistema já está preparado para receber em <code className="bg-zinc-800 px-1 rounded">/api/webhooks/inter/pix</code>.
          </p>
        </div>
      </div>

      {/* Últimos eventos PIX */}
      <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-5 space-y-3">
        <h2 className="text-base font-bold text-white">📋 Últimos Eventos PIX Recebidos</h2>
        {!data?.recentWebhooks?.length ? (
          <p className="text-zinc-500 text-sm">Nenhum evento PIX registrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {data.recentWebhooks.map((log) => (
              <div key={log.id} className="rounded-xl bg-zinc-800/50 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-xl">{STATUS_EMOJI[log.status] ?? '📊'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold uppercase ${STATUS_COLORS[log.status] ?? 'text-zinc-400'}`}>{log.status}</span>
                    {log.amount && <span className="text-sm font-black text-white">{BRL.format(log.amount)}</span>}
                  </div>
                  <p className="text-xs text-zinc-500 font-mono truncate">txid: {log.txid}</p>
                  {log.e2eid && <p className="text-xs text-zinc-600 font-mono truncate">e2e: {log.e2eid}</p>}
                  {log.errorMsg && <p className="text-xs text-red-400 mt-0.5">{log.errorMsg}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-zinc-600">{new Date(log.receivedAt).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instruções de setup */}
      <div className="rounded-2xl border border-zinc-700/40 bg-zinc-900/40 p-5 space-y-2">
        <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">📖 Setup dos Certificados mTLS</h2>
        <ol className="text-xs text-zinc-500 space-y-1.5 list-decimal list-inside">
          <li>Acesse o Portal Inter Empresas → Configurações → API Banking → Certificados</li>
          <li>Gere o par de certificados (ou faça upload do seu CSR)</li>
          <li>Baixe os arquivos <code className="bg-zinc-800 px-1 rounded text-zinc-300">certificado.crt</code> e <code className="bg-zinc-800 px-1 rounded text-zinc-300">chave.key</code></li>
          <li>Renomeie para <code className="bg-zinc-800 px-1 rounded text-zinc-300">inter.crt</code> e <code className="bg-zinc-800 px-1 rounded text-zinc-300">inter.key</code></li>
          <li>Coloque os arquivos na pasta <code className="bg-zinc-800 px-1 rounded text-zinc-300">/certs/</code> na raiz do projeto</li>
          <li>Reinicie o servidor — o sistema carrega automaticamente na inicialização</li>
        </ol>
      </div>
    </div>
  )
}
