import { getServerSession } from 'next-auth/next'
import { cookies } from 'next/headers'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ClienteAreaShell } from './ClienteAreaShell'
import { DashboardWrapper } from '@/components/cliente/DashboardWrapper'
import { ProfileSelector } from '@/components/cliente/ProfileSelector'
import type { ClientProfileType } from '@prisma/client'

export default async function ClienteLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  // Lê profileType, activeModules e ownedProfiles — do token se disponível, senão do DB
  let profileType    = (session?.user as { profileType?: string } | undefined)?.profileType ?? 'TRADER_WHATSAPP'
  let activeModules: string[]          = (session?.user as { activeModules?: string[] } | undefined)?.activeModules ?? []
  let ownedProfiles: ClientProfileType[] = []

  // Busca sempre do DB para ter ownedProfiles, subscriptions e paywall atualizado
  let subscriptionBlocked = false
  let blockedPlanName: string | null = null

  if (session?.user?.id) {
    const cp = await prisma.clientProfile.findUnique({
      where:  { userId: session.user.id },
      select: {
        profileType:   true,
        activeModules: true,
        ownedProfiles: true,
        subscriptions: {
          where:   { status: { in: ['ACTIVE', 'TRIAL'] } },
          select:  { status: true, planName: true, profileType: true },
          take:    1,
        },
      },
    }).catch(() => null)

    if (cp) {
      if (!profileType || profileType === 'TRADER_WHATSAPP') {
        profileType   = cp.profileType ?? 'TRADER_WHATSAPP'
        activeModules = Array.isArray(cp.activeModules) ? (cp.activeModules as string[]) : []
      }
      ownedProfiles = Array.isArray(cp.ownedProfiles)
        ? (cp.ownedProfiles as ClientProfileType[])
        : [profileType as ClientProfileType]

      // Verifica bloqueio por inadimplência (LOCAL_BUSINESS ou qualquer perfil com assinatura)
      const requiresSub = ['LOCAL_BUSINESS', 'INFRA_PARTNER', 'RENTAL_USER', 'MENTORADO']
      if (requiresSub.includes(profileType)) {
        const hasActiveSub = (cp.subscriptions ?? []).length > 0
        if (!hasActiveSub) {
          // Busca a assinatura inadimplente para exibir detalhes
          const pastDueSub = await prisma.subscription.findFirst({
            where:  { clientId: cp as unknown as string, status: { in: ['PAST_DUE', 'CANCELLED'] } },
            select: { planName: true },
          }).catch(() => null)
          // Apenas bloqueia se há alguma assinatura (não bloqueia novos clientes sem sub)
          const anySub = await prisma.subscription.findFirst({
            where:  { status: 'PAST_DUE' },
            select: { planName: true },
          }).catch(() => null)
          if (anySub) {
            subscriptionBlocked = true
            blockedPlanName     = pastDueSub?.planName ?? anySub?.planName ?? 'Assinatura'
          }
        }
      }
    }
  }

  // Garante que o perfil primário está em ownedProfiles
  if (!ownedProfiles.includes(profileType as ClientProfileType)) {
    ownedProfiles = [profileType as ClientProfileType, ...ownedProfiles]
  }

  // ── CEO God View — impersonação de perfil pelo Admin ─────────────────────
  const cookieStore = await cookies()
  const godViewCookie = cookieStore.get('god_view_profile')
  const isGodView = !!godViewCookie?.value
  const godViewData = isGodView
    ? (() => {
        try { return JSON.parse(godViewCookie!.value) as { profileType: string; label: string } }
        catch { return null }
      })()
    : null

  if (isGodView && godViewData) {
    profileType   = godViewData.profileType
    activeModules = []
  }

  // ── Seleção de perfil pelo cliente (multi-perfil) ─────────────────────────
  const selectedProfileCookie = cookieStore.get('selected_profile')?.value as ClientProfileType | undefined
  // Aplica o perfil selecionado se for um dos perfis que o cliente possui
  if (!isGodView && selectedProfileCookie && ownedProfiles.includes(selectedProfileCookie)) {
    profileType = selectedProfileCookie
  }

  // ── Renderização ──────────────────────────────────────────────────────────
  const hasMultipleProfiles = !isGodView && ownedProfiles.length > 1
  const needsSelection      = hasMultipleProfiles && !selectedProfileCookie

  // ── Paywall: redireciona para pagamento pendente se inadimplente ─────────────
  if (subscriptionBlocked && !isGodView) {
    const { PaywallGate } = await import('@/components/cliente/PaywallGate')
    return (
      <ClienteAreaShell>
        <DashboardWrapper
          profileType={profileType}
          customModules={[]}
          isGodView={false}
        >
          <PaywallGate planName={blockedPlanName ?? 'Assinatura'} />
        </DashboardWrapper>
      </ClienteAreaShell>
    )
  }

  return (
    <ClienteAreaShell>
      <DashboardWrapper
        profileType={isGodView && godViewData ? godViewData.profileType : profileType}
        customModules={activeModules}
        isGodView={isGodView}
        godViewLabel={godViewData?.label}
      >
        {needsSelection ? (
          // Exibe seletor quando há múltiplos perfis e nenhum foi escolhido
          <ProfileSelector
            ownedProfiles={ownedProfiles}
            currentProfile={profileType as ClientProfileType}
            clientName={session?.user?.name}
          />
        ) : (
          <>
            {hasMultipleProfiles && (
              // Botão flutuante para trocar de perfil (já há um selecionado)
              <ProfileSwitchBanner
                ownedProfiles={ownedProfiles}
                currentProfile={profileType as ClientProfileType}
                clientName={session?.user?.name}
              />
            )}
            {children}
          </>
        )}
      </DashboardWrapper>
    </ClienteAreaShell>
  )
}

// ─── Banner para trocar de perfil (quando já selecionado) ──────────────────────

import { ProfileSwitchBanner } from '@/components/cliente/ProfileSwitchBanner'
