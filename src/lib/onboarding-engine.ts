/**
 * Ads Ativos Global — Motor de Onboarding Automático
 *
 * Quando um pagamento é aprovado, este motor:
 *  1. Encontra ou cria a conta do comprador
 *  2. Atribui o profileType correto com base no produto comprado
 *  3. Registra o perfil em ownedProfiles (suporte multi-perfil)
 *  4. Envia WhatsApp com link do painel específico do perfil
 *  5. Dispara e-mail de boas-vindas com credenciais se conta nova
 *
 * Hierarquia de perfis (maior = mais recursos):
 *   TRADER_WHATSAPP < LOCAL_BUSINESS < RENTAL_USER
 *   < DIRECT_RESPONSE_SCALE < INFRA_PARTNER < MENTORADO
 */
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { BRAND } from '@/lib/brand'
import {
  sendWhatsApp,
  sendWhatsAppEliteDelivery,
} from '@/lib/notifications/channels/whatsapp'
import { sendEmail, buildWelcomeEmail } from '@/lib/notifications/channels/email'
import type { ClientProfileType } from '@prisma/client'

// ─── Hierarquia de perfis ─────────────────────────────────────────────────────

const PROFILE_TIER: Record<ClientProfileType, number> = {
  TRADER_WHATSAPP:       1,
  LOCAL_BUSINESS:        2,
  RENTAL_USER:           3,
  DIRECT_RESPONSE_SCALE: 4,
  INFRA_PARTNER:         5,
  MENTORADO:             6,
}

function higherTier(a: ClientProfileType, b: ClientProfileType): ClientProfileType {
  return (PROFILE_TIER[a] ?? 0) >= (PROFILE_TIER[b] ?? 0) ? a : b
}

// ─── URL de destino por perfil ────────────────────────────────────────────────

export const PROFILE_DASHBOARD_PATH: Record<ClientProfileType, string> = {
  TRADER_WHATSAPP:       '/dashboard/cliente',
  LOCAL_BUSINESS:        '/dashboard/cliente',
  MENTORADO:             '/dashboard/cliente',
  DIRECT_RESPONSE_SCALE: '/dashboard/cliente',
  INFRA_PARTNER:         '/dashboard/cliente',
  RENTAL_USER:           '/dashboard/cliente',
}

function getDashboardUrl(profileType: ClientProfileType): string {
  const base = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${base}${PROFILE_DASHBOARD_PATH[profileType]}`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generatePassword(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase() +
         Math.floor(Math.random() * 100)
}

// ─── Motor principal ──────────────────────────────────────────────────────────

export type OnboardingParams = {
  /** E-mail do comprador (obrigatório para criar conta) */
  email:          string | null
  name:           string
  whatsapp:       string
  /** Perfil que este produto concede (ProductListing.destinationProfile) */
  destinationProfile: ClientProfileType
  /** ID do produto/listing para referência no log */
  productTitle:   string
  productRef?:    string
  checkoutId:     string
  /** Credenciais do ativo (rawData) para incluir na entrega */
  credentials?:   Record<string, unknown> | null
  warrantyEndsAt?: Date | null
}

export type OnboardingResult = {
  isNewUser:       boolean
  userId:          string
  profileType:     ClientProfileType
  ownedProfiles:   ClientProfileType[]
  tempPassword?:   string
  profileUpgraded: boolean
}

/**
 * Ponto de entrada principal do Motor de Onboarding.
 * Chame este método nos webhooks de pagamento após confirmar o PIX/Cripto.
 */
export async function handlePostPaymentOnboarding(
  params: OnboardingParams,
): Promise<OnboardingResult | null> {
  if (!params.email) return null
  const emailNorm = params.email.trim().toLowerCase()

  // ── Busca ou cria usuário ─────────────────────────────────────────────────
  const existing = await prisma.user.findUnique({
    where:   { email: emailNorm },
    include: { clientProfile: { select: { id: true, profileType: true, ownedProfiles: true } } },
  })

  let userId:       string
  let isNewUser:    boolean
  let tempPassword: string | undefined
  let profileType:  ClientProfileType
  let ownedProfiles: ClientProfileType[]
  let profileUpgraded = false

  if (existing) {
    // Conta existente — atualiza/faz upgrade de perfil
    userId   = existing.id
    isNewUser = false

    const cp = existing.clientProfile
    const currentProfile  = cp?.profileType ?? 'TRADER_WHATSAPP'
    const currentOwned    = Array.isArray(cp?.ownedProfiles)
      ? (cp!.ownedProfiles as ClientProfileType[])
      : [currentProfile]

    // Adiciona novo perfil se ainda não possui
    ownedProfiles = currentOwned.includes(params.destinationProfile)
      ? currentOwned
      : [...currentOwned, params.destinationProfile]

    // Faz upgrade ao perfil mais alto entre o atual e o novo
    const newPrimary = higherTier(currentProfile, params.destinationProfile)
    profileType     = newPrimary
    profileUpgraded = newPrimary !== currentProfile

    if (cp) {
      await prisma.clientProfile.update({
        where: { id: cp.id },
        data: {
          profileType:   newPrimary,
          ownedProfiles: ownedProfiles as never,
        },
      }).catch((e) => console.error('[Onboarding] Falha ao atualizar perfil:', e))
    }

  } else {
    // Conta nova — cria User + ClientProfile
    tempPassword        = generatePassword()
    const passwordHash  = await hash(tempPassword, 10)
    isNewUser           = true
    profileType         = params.destinationProfile
    ownedProfiles       = [params.destinationProfile]

    const newUser = await prisma.user.create({
      data: {
        email:        emailNorm,
        name:         params.name,
        phone:        params.whatsapp,
        role:         'CLIENT',
        status:       'ACTIVE',
        passwordHash,
        emailVerified: new Date(),
        clientProfile: {
          create: {
            whatsapp:        params.whatsapp,
            notifyEmail:     true,
            notifyWhatsapp:  true,
            profileType:     params.destinationProfile,
            ownedProfiles:   [params.destinationProfile] as never,
          },
        },
      },
      select: { id: true },
    })
    userId = newUser.id
  }

  // ── Notificações pós-onboarding (fire-and-forget) ─────────────────────────
  const dashUrl = getDashboardUrl(profileType)

  // WhatsApp de entrega (com credenciais se disponíveis)
  sendWhatsAppEliteDelivery({
    whatsapp:      params.whatsapp,
    buyerName:     params.name,
    productTitle:  params.productTitle,
    checkoutId:    params.checkoutId,
    credentials:   params.credentials ?? null,
    warrantyEndsAt: params.warrantyEndsAt ?? null,
    memberAreaUrl:  dashUrl,
  }).catch((e) => console.error('[Onboarding] WhatsApp delivery error:', e))

  // E-mail de boas-vindas para novos usuários (com credenciais do painel)
  if (isNewUser && tempPassword) {
    const wEmail = buildWelcomeEmail({
      buyerName:    params.name,
      buyerEmail:   emailNorm,
      tempPassword,
      panelUrl:     dashUrl,
    })
    sendEmail({ to: emailNorm, ...wEmail })
      .catch((e) => console.error('[Onboarding] Welcome email error:', e))
  }

  // WhatsApp de upgrade de perfil para usuários existentes
  if (!isNewUser && profileUpgraded) {
    const upgradeMsg = buildProfileUpgradeMessage({
      name:        params.name,
      productTitle: params.productTitle,
      profileType,
      dashUrl,
      checkoutId:  params.checkoutId,
    })
    sendWhatsApp({ phone: params.whatsapp, message: upgradeMsg })
      .catch((e) => console.error('[Onboarding] Profile upgrade WA error:', e))
  }

  return { isNewUser, userId, profileType, ownedProfiles, tempPassword, profileUpgraded }
}

// ─── Mensagem de upgrade de perfil ───────────────────────────────────────────

import { PROFILE_THEMES } from '@/lib/client-profile-config'
import { detectLanguage } from '@/lib/brand'

function buildProfileUpgradeMessage(p: {
  name:         string
  productTitle: string
  profileType:  ClientProfileType
  dashUrl:      string
  checkoutId:   string
}): string {
  const theme = PROFILE_THEMES[p.profileType]
  const lang  = detectLanguage('') // fallback PT

  if (lang === 'en') {
    return [
      `🚀 *PROFILE UPGRADED — ${BRAND.name}*`,
      ``,
      `Hello *${p.name}*! Your access level has been upgraded.`,
      ``,
      `${theme.emoji} *New Profile: ${theme.label}*`,
      `${theme.description}`,
      ``,
      `🔗 Access your updated dashboard:`,
      p.dashUrl,
      ``,
      `_Order: #${p.checkoutId}_`,
      `_${BRAND.name} · ${BRAND.taglineEN}_`,
    ].join('\n')
  }

  return [
    `🚀 *PERFIL ATUALIZADO — ${BRAND.name}*`,
    ``,
    `Olá, *${p.name}*! Seu nível de acesso foi atualizado com sucesso.`,
    ``,
    `${theme.emoji} *Novo Perfil: ${theme.label}*`,
    `${theme.description}`,
    ``,
    `🔗 *Acesse seu novo painel:*`,
    p.dashUrl,
    ``,
    `_Pedido: #${p.checkoutId}_`,
    `_${BRAND.name} · ${BRAND.taglinePT}_`,
  ].join('\n')
}
