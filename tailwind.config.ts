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
        // Paleta oficial ADS Ativos – Logo
        ads: {
          azul: '#15A2EB',           // Primária – botões, links, ações
          'azul-light': '#15A2EB',
          'azul-secondary': '#1F70EE', // Secundária – hover, destaques
          'azul-deep': '#235CEE',      // Profundo
          'azul-dark': '#2554EF',      // Escuro
          ciano: '#07E5E9',            // CTA forte – alertas, destaque
          offwhite: '#F8FAFC',
          antracite: '#1F2937',
          'antracite-light': '#374151',
          // Dark theme premium
          'dark-bg': '#0E1117',
          'dark-card': '#161B22',
        },
        primary: {
          DEFAULT: '#15A2EB',
          50: '#E6F6FD',
          100: '#CCEEFB',
          200: '#99DDF7',
          300: '#66CCF3',
          400: '#33BBEF',
          500: '#15A2EB',
          600: '#1F70EE',
          700: '#235CEE',
          800: '#2554EF',
          900: '#1a3d99',
        },
        accent: {
          DEFAULT: '#07E5E9',         // Ciano – CTAs estratégicos
          50: '#E6FCFC',
          100: '#CCFAF9',
          200: '#99F5F3',
          300: '#66F0ED',
          400: '#33EBE7',
          500: '#07E5E9',
          600: '#06B8BB',
          700: '#058A8C',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'ads-sm': '0 1px 2px 0 rgb(21 162 235 / 0.08)',
        'ads': '0 4px 6px -1px rgb(21 162 235 / 0.12), 0 2px 4px -2px rgb(21 162 235 / 0.08)',
        'ads-md': '0 10px 15px -3px rgb(21 162 235 / 0.1), 0 4px 6px -4px rgb(21 162 235 / 0.08)',
        'ads-lg': '0 20px 25px -5px rgb(21 162 235 / 0.1), 0 8px 10px -6px rgb(21 162 235 / 0.06)',
        'glow': '0 0 24px -4px rgb(21 162 235 / 0.3)',
        'glow-accent': '0 0 24px -4px rgb(7 229 233 / 0.35)',
        'glow-ciano': '0 0 24px -4px rgb(7 229 233 / 0.35)',
        'card-hover': '0 12px 40px -12px rgb(21 162 235 / 0.12), 0 0 0 1px rgb(21 162 235 / 0.06)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-hero': 'linear-gradient(90deg, #15A2EB 0%, #1F70EE 100%)',
        'gradient-hero-full': 'linear-gradient(135deg, #15A2EB 0%, #1F70EE 50%, #235CEE 100%)',
        'gradient-accent': 'linear-gradient(135deg, #07E5E9 0%, #15A2EB 100%)',
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
