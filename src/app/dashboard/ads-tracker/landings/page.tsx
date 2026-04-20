import { LandingVaultClient } from './LandingVaultClient'

export default function LandingVaultPage() {
  return (
    <div className="space-y-4 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Cofre de landings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Módulo 04 — destinos, métricas de resposta HTTP, tokens de redirecionamento e registo de migrações de domínio.
          Não há entrega de conteúdo diferente por visitante a partir deste ERP; cumprir sempre as políticas do Google Ads
          e leis aplicáveis.
        </p>
      </div>
      <LandingVaultClient />
    </div>
  )
}
