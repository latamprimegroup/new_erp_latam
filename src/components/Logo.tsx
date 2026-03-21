'use client'

import Image from 'next/image'

/** Variantes de logo disponíveis em /logos */
export type LogoVariant = 'azul-branco' | 'azul-azul' | 'branco-branco' | 'darkGray'

const LOGO_PATHS: Record<LogoVariant, string> = {
  'azul-branco': '/logos/ads-azul-ativos-branco.png',
  'azul-azul': '/logos/ads-azul-ativos-azul.png',
  'branco-branco': '/logos/ads-branco-ativos-branco.png',
  darkGray: '/logos/ads-darkGray-ativos-darkGray-.png',
}

export function Logo({
  variant = 'azul-branco',
  width = 140,
  height = 40,
  className = '',
  priority = false,
}: {
  variant?: LogoVariant
  width?: number
  height?: number
  className?: string
  priority?: boolean
}) {
  return (
    <Image
      src={LOGO_PATHS[variant]}
      alt="ADS Ativos"
      width={width}
      height={height}
      className={`h-auto object-contain ${className}`}
      priority={priority}
    />
  )
}
