import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Style Guide ADS - Paleta primária
        ads: {
          navy: '#0D1B2A',           // Dark Navy - sidebar, fundos escuros
          'navy-light': '#1B263B',
          royal: '#2563EB',           // Royal Blue - ações principais
          'royal-light': '#3B82F6',   // Bright blue - quarter circle, hovers
          cyan: '#06B6D4',
          // Escala de cinzas
          charcoal: '#374151',
          'charcoal-light': '#6B7280',
          grey: '#9CA3AF',
          'grey-light': '#D1D5DB',
          'grey-pale': '#F3F4F6',
          white: '#FFFFFF',
          black: '#000000',
          // Accent palette (alerts, status, CTAs)
          green: '#22C55E',
          yellow: '#EAB308',
          orange: '#F97316',
          red: '#EF4444',
          // Legacy / compatibilidade
          azul: '#2563EB',
          'azul-light': '#3B82F6',
          antracite: '#1F2937',
          'antracite-light': '#374151',
          'dark-bg': '#0D1B2A',
          'dark-card': '#151d2e',
          offwhite: '#F8FAFC',
        },
        primary: {
          DEFAULT: '#2563EB',
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        accent: {
          DEFAULT: '#22C55E',
          50: '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      spacing: {
        // Style Guide ADS - 8px grid
        'ads-1': '8px',
        'ads-2': '16px',
        'ads-3': '24px',
        'ads-4': '32px',
        'ads-5': '40px',
        'ads-6': '48px',
      },
      borderRadius: {
        'ads': '8px',
        'ads-lg': '12px',
        'ads-xl': '16px',
      },
      boxShadow: {
        'ads-sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'ads': '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
        'ads-md': '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)',
        'ads-lg': '0 20px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.04)',
        'glow': '0 0 24px -4px rgb(37 99 235 / 0.25)',
        'glow-accent': '0 0 24px -4px rgb(34 197 94 / 0.3)',
        'card-hover': '0 12px 40px -12px rgb(0 0 0 / 0.08), 0 0 0 1px rgb(0 0 0 / 0.04)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-hero': 'linear-gradient(90deg, #2563EB 0%, #1D4ED8 100%)',
        'gradient-hero-full': 'linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)',
        'gradient-accent': 'linear-gradient(135deg, #22C55E 0%, #2563EB 100%)',
        'gradient-card': 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.95) 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.35s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16,1,0.3,1)',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
export default config
