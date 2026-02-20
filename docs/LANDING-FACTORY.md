# Fábrica de Landing Pages & Ads

Módulo na Área do Cliente para geração de landing pages e preparação para campanhas Google Ads.

## Schema (Prisma)

- **LandingBriefing** – nicho, público, dor, solução, oferta, WhatsApp
- **LandingPage** – HTML gerado, conversion ID/label
- **LandingDomain** – domínio, Cloudflare (futuro)
- **LandingDeployment** – deploy, URL, Hospeda Info (futuro)

## Módulo 1: Briefing + Gerador

- Formulário de briefing na área do cliente
- Sanitização de inputs (anti-injection)
- Geração de HTML via IA (OpenAI ou Anthropic) ou template estático
- Preview + copiar HTML

### Variáveis de ambiente

```env
OPENAI_API_KEY=sk-...   # Para geração via GPT-4o-mini
# ou
ANTHROPIC_API_KEY=...   # Para geração via Claude
```

Se nenhuma estiver definida, usa template HTML estático com Tailwind.

## Próximos módulos

- **Módulo 2**: Cloudflare DNS, SSL, Hospeda Info
- **Módulo 3**: Google Ads Copywriter (títulos, descrições, keywords)
- **Módulo 4**: Tracking WhatsApp + GTM, gtag_report_conversion
