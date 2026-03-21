# Melhorias — Item a Item (melhoria.txt vs Implementação)

Documento que lista **cada item do melhoria.txt** como está descrito no arquivo original e, logo abaixo, **o que foi implementado e como**.

**Fonte:** `melhoria.txt` (Melhorias 02-03-26)  
**Última atualização:** Março 2026

---

## 001 — Dashboard de Gestão de Contas (MCC/AdTech)

### Como está no melhoria.txt

- **Wireframe:** Campo de busca, nome do usuário, Admin, notificações
- **Título:** "Dashboard de Gestão de Contas" — "Monitoramento de contas integradas ao Google Ads"
- **Cards de Status:** Total de Contas, Gastando, Vendendo, Travado, Caiu
- **Tabs:** Dashboard, Contas, Ranking, Aquecimento, Contingência
- **Métricas de Recuperação:** Em Contestação, Recuperadas (Appeals), Pausadas (BOV), Recuperadas (BOV)
- **Tabela de Log de Contingência:** ID da Conta, Data da Queda, Motivo, Status Atual, Tempo de Recuperação
- **Ações Rápidas:** Pausar Tudo, Solicitar Reembolso
- **Alertas:** Disparidade CTR/CPC, Gráfico de pizza de motivos de queda
- **Integração:** Hierarquia MCC, GAQL, OAuth2, Webhooks, lógica Diff (ontem vs hoje)

### O que foi implementado

**Nada.** Módulo não implementado. Depende de API Google Ads, OAuth2 e credenciais.

---

## 002 — Tabela de Produção (Entrada de Ativos)

### Como está no melhoria.txt

- **Formulário:** ID da Conta (máscara 000-000-0000), Tipo de Moeda (select), Código A2F (2FA), Código G2 Aprovada, Site (URL), Link CNPJ BIZ, Cartão CNPJ (upload PDF)
- **Validação:** Mensagem "Esta conta já foi produzida por [Nome do Colaborador]" se ID existir
- **Persistência:** Renomear PDF para `cnpj_[ID_DA_CONTA].pdf`
- **Central de Feedback:** Sugestões de Melhoria (Sistema) e Sugestões de Melhoria (Empresa) — Título/Descrição, pode ser anônimo

### O que foi implementado

| Item do documento | Implementação | Arquivo/onde |
|-------------------|---------------|--------------|
| ID da Conta (máscara 000-000-0000) | Campo com formatação automática | `ProducaoClient.tsx`, `googleAdsCustomerId` |
| Tipo de Moeda | Select com BRL, USD, EUR, GBP, ARS, CLP, MXN, COP, PEN | `ProducaoClient.tsx`, campo `currency` |
| Código A2F (2FA) | Campo texto | `ProducaoClient.tsx`, `a2fCode` |
| Código G2 Aprovada | Campo texto | `ProducaoClient.tsx`, `g2ApprovalCode` |
| Site (URL) | Campo URL | `ProducaoClient.tsx`, `siteUrl` |
| Link CNPJ BIZ | Campo URL | `ProducaoClient.tsx`, `cnpjBizLink` |
| Cartão CNPJ (PDF) | Input file, validação MIME, renomeação | `cnpj-pdf/route.ts`, `cnpj_[id].pdf` |
| Verificação de Duplicidade | Mensagem por ID, e-mail e CNPJ | `api/producao/route.ts` |
| Central de Feedback | Dois formulários Sistema + Empresa | `ProductionFeedback.tsx`, `api/suggestions` |
| Admin visualiza sugestões | Página Admin | `dashboard/admin/sugestoes/page.tsx` |

---

## 003 — Plug & Play (Ativos de Entrega Imediata)

### Como está no melhoria.txt

- **Badge:** [PLUG & PLAY] em verde neon ou roxo
- **Status G2:** Indicador de que a conta tem G2 Aprovado
- **Checkbox:** "Primeira Campanha White Aprovada?"
- **Validação de Saldo:** Permitir envio para estoque com saldo R$ 0,00
- **Filtro:** "Apenas Contas Prontas (Plug & Play)"
- **Garantia de Entrega:** "Conta G2 verificada + Campanha White aprovada. Pronta para troca de domínio/criativo."
- **Menus de Feedback:** Sistema e Empresa no sidebar

### O que foi implementado

| Item do documento | Implementação | Arquivo/onde |
|-------------------|---------------|--------------|
| Badge [PLUG & PLAY] | Badge verde nas listagens | `EstoqueClient.tsx`, `pesquisar/page.tsx` |
| Status G2 | Contas G2 já possuem `codeG2` | `ProductionG2` |
| Checkbox "Primeira Campanha White Aprovada?" | Checkbox em ProductionG2 | `ProductionG2DetailClient.tsx`, `firstCampaignWhiteApproved` |
| Saldo R$ 0 | Permite envio para estoque | `send-to-stock/route.ts` (sem checagem de saldo) |
| Filtro Plug & Play | Checkbox "Apenas Plug & Play" | `EstoqueClient.tsx`, `pesquisar/page.tsx` |
| Garantia de Entrega | Texto ao selecionar conta Plug & Play | `pesquisar/page.tsx` |
| Feedback | Central de Feedback já no 002 | `ProductionFeedback.tsx` |
| Campo is_plug_play | Boolean no StockAccount | `prisma/schema.prisma` |

---

## 004 — Perfil de Reputação de Cliente (Customer Health Score)

### Como está no melhoria.txt

- **Score:** 0 a 100 com gráfico/barra
- **Indicadores:** Taxa de Queda, Histórico de Reembolso, Frequência de Pagamento, Nível de Nicho
- **Badges:** 🟢 VIP/Safe (80–100), 🟡 Regular (50–79), 🔴 High Risk (&lt;50)
- **Ação:** Bloquear venda de G2 Premium para High Risk
- **Garantia Reversa:** 3 erros Plug & Play = blacklist, alerta ao Administrador
- **Campos:** reputation_score, average_account_lifetime, refund_count, niche_tag

### O que foi implementado

| Item do documento | Implementação | Arquivo/onde |
|-------------------|---------------|--------------|
| Score 0–100 | Campo `reputationScore` em ClientProfile | `prisma/schema.prisma` |
| average_account_lifetime | Campo `averageAccountLifetimeDays` | `prisma/schema.prisma` |
| refund_count | Campo `refundCount` | `prisma/schema.prisma` |
| niche_tag | Campo `nicheTag` (WHITE, BLACK, NUTRA, CASINO) | `prisma/schema.prisma` |
| plugPlayErrorCount | Campo para Garantia Reversa | `prisma/schema.prisma` |
| Badges VIP/Regular/High Risk | Cores e labels na UI | `VendasClient.tsx`, `reputation.ts` |
| Bloqueio G2 Premium | Mensagem de alerta ao selecionar cliente High Risk | `VendasClient.tsx` |
| Admin edita reputação | Página com tabela editável | `admin/reputacao/page.tsx` |
| API GET/PATCH reputação | Endpoint por cliente | `api/clientes/[id]/reputation/route.ts` |

---

## 005 — Ajustes de Interface e Correção de Bugs (UI/UX)

### Como está no melhoria.txt

**A) Correção de Contraste Dark Mode**
- Inputs invisíveis na aba produção
- Correção: color white, border rgba(255,255,255,0.2), placeholder legível

**B) Campo TIPO**
- Substituir input livre por Select/Chips
- Cores: WHITE (#10b981), BLACK (#3b82f6), G2 PREMIUM (#8b5cf6), BOV PENDENTE (#f59e0b), EM CONTESTAÇÃO (#f97316)

**C) Reclassificação Automática de Ativos**
- Botão "G2 Rejeitada" com modal de confirmação
- Mover para estoque como "Google Verificação Anunciante"
- Limpar g2_approval_code, categoria GOOGLE_VERIFIED_ADS
- Estoque diferenciado, tag de origem

**D) Refinamento e Segurança da Produção**
- Botões Editar e Excluir na produção (apenas EM_PRODUCAO)
- Campos: RG, E-mail, Senha, Recovery, 2FA, Cartão CNPJ (PDF), ID Único
- CNPJ: busca por nicho/CNAE, sincronização Receita Federal/CNPJ Biz

**E) Módulo 5 Segurança Anti-Duplicidade**
- Validação em tempo real em toda base
- Cartão Simples: máximo 5 vinculações

**F) Módulo 6 Abas de Upload**
- Google Anunciante, Google+G2, Google+G2+Op.Comercial, TikTok Ads

**G) Módulo 7 Produção Individual e Logs**
- Importação/exportação CSV/Excel
- Aba de upload/visualização de documentos

**H) Área de Senha**
- Usuário logado editar perfil e alterar senha
- Avatar

### O que foi implementado

| Item do documento | Implementação | Arquivo/onde |
|-------------------|---------------|--------------|
| Contraste Dark Mode | Classe `.production-form-area`, inputs legíveis | `globals.css` |
| Campo TIPO Select/Cores | Select com WHITE, BLACK, G2 PREMIUM, BOV PENDENTE, EM CONTESTAÇÃO, Outro e badges coloridos | `ProducaoClient.tsx` |
| Editar/Excluir produção | Botões quando status PENDING; API PATCH e DELETE | `ProducaoClient.tsx`, `api/producao/[id]/route.ts` |
| G2 Rejeitada → Verificação Anunciante | Botão na tela G2 REPROVADA, cria StockAccount type CONTA_VERIFICADA_ANUNCIANTE | `reclassify-to-stock/route.ts`, `ProductionG2DetailClient.tsx` |
| Estoque diferenciado | Filtro por tipo "Verif. Anunciante" | `EstoqueClient.tsx` |
| Tag de origem | `source: PRODUCTION_G2_RECLASSIFIED` | `reclassify-to-stock/route.ts` |
| RG, CNPJ sync, busca CNAE | **Não implementado** | — |
| Cartão 5x | **Não implementado** | — |
| Abas de upload por tipo | **Não implementado** | — |
| Produção Individual / CSV | **Não implementado** (há importação em outro fluxo) | — |
| Editar perfil | Nome, telefone; cliente e ERP | `api/cliente/perfil`, `api/user/me` |
| Alterar senha | POST com senha atual + nova | `api/user/change-password/route.ts` |
| Avatar | Campo photo (URL) no User | `User.photo`, formulários de perfil |
| Páginas de perfil | Cliente: `/dashboard/cliente/perfil`; ERP: `/dashboard/perfil` | `cliente/perfil/page.tsx`, `perfil/page.tsx` |

---

## 006 — Área de Treinamento & Área do Cliente

### Como está no melhoria.txt

**Área de Treinamento:**
- Repositório de vídeos e PDFs
- Anti-pirataria: bloqueio clique direito, F12, watermark nos vídeos
- Login com controle Colaborador vs Gerente

**Área do Cliente:**
- Gerador de Site Local (Compliance)
- Gerador de Campanhas Google Ads Search (4 estruturas, keywords, negativas, RSA)
- Botão Copiar para Área de Transferência
- Avisos de conformidade

### O que foi implementado

**Nada.** Módulo não implementado.

---

## 007 — Rastreamento de Conversão & Tags (GTM)

### Como está no melhoria.txt

- Script GTM no `<head>`, variável dinâmica client_config.gtm_id
- Tag noscript após `<body>`
- Rastreamento de cliques WhatsApp: evento `whatsapp_click` no DataLayer
- Acionador personalizado no GTM

### O que foi implementado

| Item do documento | Implementação | Arquivo/onde |
|-------------------|---------------|--------------|
| Script GTM no head | GTMProvider carrega script quando `NEXT_PUBLIC_GTM_ID` no .env | `GTMProvider.tsx`, `providers.tsx` |
| Tag noscript | iframe GTM após body | `GTMProvider.tsx` |
| Evento whatsapp_click | Listener de clique em links wa.me / api.whatsapp.com | `GTMProvider.tsx` |
| Variável GTM | `NEXT_PUBLIC_GTM_ID` no .env | `.env.example` |

---

## 008 — Integração Dinâmica Join.Chat

### Como está no melhoria.txt

- Widget Join.Chat via CDN
- Variáveis config.joinchat_id / config.whatsapp_number
- Campo "Custom Scripts" no admin
- Integração com Next.js (Script strategy="lazyOnload")

### O que foi implementado

| Item do documento | Implementação | Arquivo/onde |
|-------------------|---------------|--------------|
| Widget via CDN | JoinChatWidget carrega script cdn.join.chat/bundle/{id}.js | `JoinChatWidget.tsx` |
| config.joinchat_id | SystemSetting joinchat_id, API pública /api/config/public | `api/config/public/route.ts` |
| config.whatsapp_number | SystemSetting whatsapp_number em widgets | `api/admin/config/widgets/route.ts` |
| Config no admin | Seção Widgets em Configurações | `admin/config/page.tsx` |
| Strategy lazyOnload | Script com strategy="lazyOnload" | `JoinChatWidget.tsx` |

---

## 009 — Gerador de ID Sequencial Customizado (C288+)

### Como está no melhoria.txt

- Prefixo fixo 'C'
- Sequencialidade: busca último ID, incrementa
- Formatação com zeros à esquerda
- Trava para concorrência
- Campo ID pré-preenchido (read-only) no formulário de novo cliente

### O que foi implementado

| Item do documento | Implementação | Arquivo/onde |
|-------------------|---------------|--------------|
| Prefixo C | Sempre C + número | `client-id-sequencial.ts` |
| Sequencialidade | Busca todos clientCode, extrai números, max+1 | `client-id-sequencial.ts` |
| Trava concorrência | Transação Prisma $transaction | `client-id-sequencial.ts` |
| Cadastro público | Register usa generateNextClientId | `api/auth/register/route.ts` |
| Criação admin | POST usuários CLIENT cria ClientProfile com clientCode | `api/admin/usuarios/route.ts` |
| API próximo ID | GET /api/admin/clientes/next-id | `api/admin/clientes/next-id/route.ts` |
| Campo pré-preenchido | Opcional; API disponível | — |

---

## 010 — Dashboard de ROI & CRM ADS ATIVOS

### Como está no melhoria.txt

- Integração TinTim + ERP (Webhook/API)
- Chave de cruzamento: Telefone ou E-mail
- Cards: ROI Real, LTV, CPA Real
- Gráfico comparativo: Investimento vs Faturamento
- Tabela de clientes: Nome, Contato, Origem, Status
- Botão Re-marketing
- Design Dark (#09090b), Recharts

### O que foi implementado

**Parcial.** Existe CustomerMetrics, LTV, dashboards. Integração TinTim e ROI consolidado não implementados.

---

## 011 — Sistema de Gestão de Estoque de Ativos

### Como está no melhoria.txt

- Upload bulk via CSV
- Campos: ID, Plataforma, Tipo, Moeda, Spend, Custo, Preço de Venda
- Margem fixa %
- Tag "Ativo Verificado Ads Ativos"
- Gerador de Copy (3 variações)
- Botão "Lançar na Comunidade" (Telegram/WhatsApp)
- Contador de vendas e estoque por categoria

### O que foi implementado

| Item do documento | Implementação | Arquivo/onde |
|-------------------|---------------|--------------|
| Upload bulk CSV | Importação existente | Módulo Estoque |
| Campos, filtros, arquivamento | Existentes | `EstoqueClient.tsx`, `api/estoque` |
| Tag "Ativo Verificado Ads Ativos" | Badge em cada conta na tabela | `EstoqueClient.tsx` |
| Gerador de Copy | **Não implementado** | — |
| Lançar na Comunidade | **Não implementado** | — |

---

## Resumo de Status

| # | Módulo | Status |
|---|--------|--------|
| 001 | Dashboard MCC | ⏳ Pendente |
| 002 | Tabela de Produção | ✅ Implementado |
| 003 | Plug & Play | ✅ Implementado |
| 004 | Perfil de Reputação | ✅ Implementado |
| 005 | UI/UX, Reclassificação, Editar/Excluir, Perfil/Senha | ✅ Parcial |
| 005 | Refinamento (RG, CNPJ, Cartão 5x, Abas) | ⏳ Pendente |
| 006 | Treinamento e Área do Cliente | ⏳ Pendente |
| 007 | GTM + whatsapp_click | ✅ Implementado |
| 008 | Join.Chat | ✅ Implementado |
| 009 | ID Sequencial C289+ | ✅ Implementado |
| 010 | Dashboard ROI/CRM | ⏳ Parcial |
| 011 | Tag Ativo Verificado | ✅ Implementado |
| 011 | Gerador Copy, Lançar Comunidade | ⏳ Pendente |
