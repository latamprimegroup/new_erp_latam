# Melhorias Implementadas — ERP Ads Ativos

Documento que lista as melhorias do `melhoria.txt` que **já foram implementadas** no projeto. Referência para auditoria e acompanhamento.

**Fonte:** `melhoria.txt` (Melhorias 02-03-26)  
**Última atualização:** Março 2026

---

## Resumo executivo

| # | Módulo melhoria.txt | Status | Arquivos principais |
|---|---------------------|--------|---------------------|
| 1 | Correções UI/UX (005 parcial) | ✅ Concluído | globals.css, ProducaoClient.tsx |
| 2 | Tabela de Produção (002) | ✅ Concluído | ProducaoClient, API producao, Suggestion |
| 3 | Plug & Play (003) | ✅ Concluído | ProductionG2, StockAccount, EstoqueClient, PesquisarContas |
| 4 | Reclassificação G2 (005) | ✅ Concluído | reclassify-to-stock, ProductionG2DetailClient |
| 5 | Perfil de Reputação (004) | ✅ Concluído | ClientProfile, reputacao admin, VendasClient |
| 6 | Área de Senha/Perfil | ✅ Concluído | change-password, perfil, avatar |
| 7 | GTM + WhatsApp (007) | ✅ Concluído | GTMProvider, providers.tsx |
| 8 | Join.Chat (008) | ✅ Concluído | JoinChatWidget, api/config/public, api/admin/config/widgets |
| 9 | ID Sequencial (009) | ✅ Concluído | client-id-sequencial, register, admin/usuarios |
| 10 | Tag Ativo Verificado (011) | ✅ Concluído | EstoqueClient.tsx |

---

## 001 — Dashboard de Gestão de Contas (MCC/AdTech)

**Status:** ⏳ **Pendente**

**Como testar:** Não aplicável (ainda não implementado).

- Integração hierarquia MCC
- Métricas: Gastando, Vendendo, Travado, Caiu
- Métricas de recuperação (Contestação, BOV)
- Tabela de Log de Contingência
- Ações rápidas: Pausar Tudo, Solicitar Reembolso
- Webhooks

**Dependência:** API Google Ads, OAuth2, credenciais

---

## 002 — Tabela de Produção (Entrada de Ativos) ✅

**Status:** ✅ **Implementado**

### O que foi feito

| Item melhoria.txt | Implementação |
|-------------------|---------------|
| **ID da Conta** (máscara 000-000-0000) | Campo com formatação automática |
| **Tipo de Moeda** | Select com BRL, USD, EUR, GBP, ARS, CLP, MXN, COP, PEN |
| **Código A2F (2FA)** | Campo texto para chave secreta |
| **Código G2 Aprovada** | Campo texto |
| **URLs:** Site, Link CNPJ BIZ | Campos URL |
| **Upload Cartão CNPJ (PDF)** | Input file, validação MIME, renomeação `cnpj_[ID].pdf` |
| **Verificação de Duplicidade** | Mensagem: "Esta conta já foi produzida por [Nome do Colaborador]" |
| **Central de Feedback** | Dois formulários: Sistema e Empresa (pode ser anônimo) |

### Arquivos

- `prisma/schema.prisma` — Campos em ProductionAccount, modelo Suggestion
- `src/app/dashboard/producao/ProducaoClient.tsx` — Formulário
- `src/app/api/producao/route.ts` — Criação e validação
- `src/app/api/producao/[id]/cnpj-pdf/route.ts` — Upload PDF
- `src/app/api/suggestions/route.ts` — Feedback
- `src/components/producao/ProductionFeedback.tsx` — UI feedback
- `src/app/dashboard/admin/sugestoes/page.tsx` — Admin visualiza sugestões

### Como testar

1. Acesse **Produção** no menu.
2. Crie uma nova conta: preencha ID (ex: `1234567890`), moeda, A2F, G2, URLs, tipo e faça upload de um PDF válido.
3. Verifique que o ID é formatado automaticamente (000-000-0000).
4. Tente cadastrar ID/e-mail/CNPJ já existente → deve aparecer a mensagem de duplicidade.
5. Use o formulário de feedback no rodapé da tela (Sistema ou Empresa).
6. Como admin, acesse **Admin → Sugestões** e confira se as sugestões aparecem.

---

## 003 — Plug & Play (Ativos de Entrega Imediata) ✅

**Status:** ✅ **Implementado**

### O que foi feito

| Item melhoria.txt | Implementação |
|-------------------|---------------|
| **Status G2** | Contas G2 já possuem codeG2 |
| **Primeira Campanha White Aprovada?** | Checkbox em ProductionG2 |
| **Validação Saldo R$ 0** | Permite envio para estoque sem restrição de saldo |
| **Badge [PLUG & PLAY]** | Badge verde em listagens (Estoque, Pesquisar Contas) |
| **Filtro "Apenas Plug & Play"** | Estoque e Pesquisar Contas |
| **Garantia de Entrega** | Texto: "Conta G2 verificada + Campanha White aprovada. Pronta para troca de domínio/criativo." |

### Arquivos

- `prisma/schema.prisma` — `firstCampaignWhiteApproved` (ProductionG2), `isPlugPlay` (StockAccount)
- `src/app/dashboard/producao-g2/[id]/ProductionG2DetailClient.tsx` — Checkbox
- `src/app/api/production-g2/[id]/plug-play/route.ts` — Toggle
- `src/app/api/production-g2/[id]/send-to-stock/route.ts` — Propaga isPlugPlay
- `src/app/dashboard/estoque/EstoqueClient.tsx` — Filtro e badge
- `src/app/dashboard/cliente/pesquisar/page.tsx` — Filtro, badge e mensagem
- `src/app/api/estoque/route.ts` — Parâmetro plugPlayOnly
- `src/app/api/cliente/catalogo/route.ts` — Parâmetro plugPlayOnly, isPlugPlay

### Como testar

1. Acesse uma conta **Produção G2** (detalhe).
2. Marque o checkbox **"Primeira Campanha White Aprovada?"** e salve.
3. Envie a conta para o estoque (mesmo com saldo R$ 0).
4. Em **Estoque**: ative o filtro "Apenas Plug & Play" e verifique o badge [PLUG & PLAY] na conta.
5. Em **Cliente → Pesquisar Contas**: use o filtro Plug & Play e confira o badge e a mensagem de garantia de entrega.

---

## 004 — Perfil de Reputação de Cliente ✅

**Status:** ✅ **Implementado**

### O que foi feito

| Item melhoria.txt | Implementação |
|-------------------|---------------|
| **Score 0–100** | Campo reputationScore em ClientProfile |
| **Badges VIP, Regular, High Risk** | VIP (80+), Regular (50–79), High Risk (&lt;50) |
| **Bloqueio G2 Premium para High Risk** | Mensagem em Vendas ao selecionar cliente High Risk |
| **refundCount, nicheTag, plugPlayErrorCount** | Campos no schema |
| **Admin edita reputação** | Página Admin → Reputação Clientes |

### Arquivos

- `prisma/schema.prisma` — Campos em ClientProfile
- `src/app/api/clientes/[id]/reputation/route.ts` — GET/PATCH
- `src/app/api/clientes/[id]/ltv/route.ts` — Inclui reputation na resposta
- `src/app/dashboard/admin/reputacao/page.tsx` — Edição por admin
- `src/app/dashboard/vendas/VendasClient.tsx` — Badge e alerta High Risk
- `src/lib/reputation.ts` — Helpers getReputationBadge, canBuyG2Premium

### Como testar

1. **Migração:** Execute `npx prisma migrate dev --name add_client_reputation`.
2. Como admin, acesse **Admin → Reputação Clientes** e edite score de um cliente.
3. Em **Vendas**, selecione o cliente → deve aparecer badge (VIP/Regular/High Risk) e alerta se High Risk.

---

## 005 — Ajustes de Interface e Correção de Bugs ✅ (parcial)

**Status:** ✅ **Parcialmente implementado**

### O que foi feito

| Item melhoria.txt | Implementação |
|-------------------|---------------|
| **Correção contraste Dark Mode** | Classe `.production-form-area`, inputs legíveis |
| **Campo TIPO com Select/Chips coloridos** | WHITE, BLACK, G2 PREMIUM, BOV PENDENTE, EM CONTESTAÇÃO, Outro |
| **Editar/Excluir produção** | Botões quando status PENDING; API PATCH e DELETE |

### Arquivos

- `src/app/globals.css` — Estilos dark mode
- `src/app/dashboard/producao/ProducaoClient.tsx` — Campo TIPO, Editar/Excluir
- `src/app/api/producao/[id]/route.ts` — PATCH e DELETE

### Reclassificação G2 ✅ (implementado)

- Botão "Mover para estoque como Google Verificação Anunciante" quando G2 está REPROVADA
- Cria StockAccount com type CONTA_VERIFICADA_ANUNCIANTE, source PRODUCTION_G2_RECLASSIFIED
- Filtro por tipo "Verif. Anunciante" no Estoque

**Arquivos:** `src/app/api/production-g2/[id]/reclassify-to-stock/route.ts`, ProductionG2DetailClient, EstoqueClient

### Pendente (005)

- Refinamento produção (RG, CNPJ sync, anti-duplicidade avançada, Cartão 5x)
- Abas de upload por tipo (Google Anunciante, G2, TikTok)

### Área de Senha / Perfil ✅ (implementado)

- **Alterar senha:** POST /api/user/change-password (senha atual + nova)
- **Editar perfil:** Nome, telefone, avatar (URL) — cliente: /api/cliente/perfil, ERP: /api/user/me
- **Avatar:** Campo photo (URL) no User

**Arquivos:** `src/app/api/user/change-password/route.ts`, `src/app/api/user/me/route.ts`, `src/app/dashboard/perfil/page.tsx`, `src/app/dashboard/cliente/perfil/page.tsx`

### Como testar

1. **Dark Mode:** Ative o tema escuro e abra a tela de Produção → os inputs devem ter contraste legível.
2. **Campo TIPO:** Na criação/edição, escolha um tipo no select → na tabela, o badge deve aparecer com a cor correspondente (WHITE, BLACK, G2 PREMIUM, etc.).
3. **Editar/Excluir:** Na listagem de Produção, para uma conta com status PENDING, use os botões Editar e Excluir e confira que a edição salva e que a exclusão remove a conta.
4. **Reclassificação G2:** Em Produção G2, reprove uma conta → use o botão "Mover para estoque como Google Verificação Anunciante".
5. **Perfil/Senha:** Cliente em Meu Perfil ou ERP em Meu Perfil → edite dados e altere a senha.

---

## 006 — Área de Treinamento & Área do Cliente

**Status:** ⏳ **Pendente**

- Treinamento com anti-pirataria
- Gerador de sites e campanhas Google Ads

**Como testar:** Não aplicável (ainda não implementado).

---

## 007 — Rastreamento de Conversão (GTM) ✅

**Status:** ✅ **Implementado**

### O que foi feito

| Item melhoria.txt | Implementação |
|-------------------|---------------|
| Script GTM no head | GTMProvider carrega script quando `NEXT_PUBLIC_GTM_ID` está no .env |
| Tag noscript após body | iframe GTM no noscript |
| Evento `whatsapp_click` no DataLayer | Listener de clique em links wa.me / api.whatsapp.com |

**Arquivos:** `src/components/GTMProvider.tsx`, `src/app/providers.tsx`, `.env.example`

**Como configurar:** Adicione `NEXT_PUBLIC_GTM_ID=GTM-XXXXXX` no `.env` e no GTM crie um Acionador personalizado para o evento `whatsapp_click`.

**Como testar:** Com GTM_ID configurado, clique em um link WhatsApp na página → no GTM em modo preview, verifique o evento `whatsapp_click` no DataLayer.

---

## 008 — Integração Join.Chat ✅

**Status:** ✅ **Implementado**

### O que foi feito

| Item melhoria.txt | Implementação |
|-------------------|---------------|
| Widget Join.Chat via CDN | JoinChatWidget carrega script quando `joinchat_id` está em SystemSetting |
| Config via Admin | Seção "Widgets" em Configurações: Join.Chat ID, WhatsApp número padrão |
| Strategy lazyOnload | Script carregado com `strategy="lazyOnload"` |

**Arquivos:** `src/components/JoinChatWidget.tsx`, `src/app/api/config/public/route.ts`, `src/app/api/admin/config/widgets/route.ts`, `src/app/dashboard/admin/config/page.tsx`, `src/app/providers.tsx`

**Como configurar:** Em Admin → Configurações, na seção "Widgets", preencha o **Join.Chat ID** (obtido no painel join.chat) e salve. O widget será carregado automaticamente em todas as páginas.

**Como testar:** Configure o Join.Chat ID em Admin → Configurações → Widgets e recarregue qualquer página → o botão de WhatsApp deve aparecer (se o ID for válido).

---

## 009 — Gerador de ID Sequencial (C289+) ✅

**Status:** ✅ **Implementado**

### O que foi feito

| Item melhoria.txt | Implementação |
|-------------------|---------------|
| Prefixo C + sequencial | `generateNextClientId()` em transação Prisma |
| Cadastro público | Register usa clientCode automático |
| Criação admin | POST usuários com role CLIENT cria ClientProfile com clientCode |

**Arquivos:** `src/lib/client-id-sequencial.ts`, `src/app/api/auth/register/route.ts`, `src/app/api/admin/usuarios/route.ts`, `src/app/api/admin/clientes/next-id/route.ts`

**Como configurar:** Não requer configuração. O clientCode é gerado automaticamente no cadastro público (register) e na criação de usuário CLIENT pelo admin.

**Como testar:** Crie um novo cliente (cadastro público ou Admin → Usuários com role CLIENT) → o clientCode deve ser C289, C290, etc. conforme o último existente. A API GET `/api/admin/clientes/next-id` retorna o próximo ID.

---

## 011 — Tag "Ativo Verificado Ads Ativos" ✅

**Status:** ✅ **Implementado**

### O que foi feito

- Tag "✓ Ativo Verificado Ads Ativos" exibida em cada conta na tabela de Estoque (coluna Tipo).

**Arquivos:** `src/app/dashboard/estoque/EstoqueClient.tsx`

**Como testar:** Acesse Dashboard → Estoque → a tag aparece em cada linha da tabela de contas.

---

## 010 — Dashboard ROI/CRM

**Status:** ⏳ **Parcial**

- Existe CustomerMetrics, LTV, dashboards
- Integração TinTim, webhooks e ROI consolidado pendentes

---

## Pendentes

- **001** — Dashboard MCC/AdTech
- **005** — Refinamento Produção: Cartão 5x, RG upload, abas de upload por tipo
- **006** — Área de Treinamento e Área do Cliente
- **010** — Dashboard ROI/CRM (integração TinTim, webhooks)

---

## Tabela de mapeamento

| melhoria.txt | Seção | Status |
|--------------|-------|--------|
| Módulo 1 Dashboard MCC | 001 | ⏳ Pendente |
| Módulo 2 Tabela Produção | 002 | ✅ Concluído |
| Módulo 2.1 Plug & Play | 003 | ✅ Concluído |
| Módulo 3 Reputação Cliente | 004 | ✅ Concluído |
| Módulo 4 UI/UX (Dark, TIPO, Editar) | 005 | ✅ Parcial |
| Módulo 2.2 Reclassificação G2 | 005 | ✅ Concluído |
| Área Senha/Perfil | 005 | ✅ Concluído |
| Módulo 2.3 Refinamento Produção | 005 | ⏳ Pendente |
| Módulo 6 Treinamento | 006 | ⏳ Pendente |
| Módulo 7 Área Cliente | 006 | ⏳ Pendente |
| Módulo 8 GTM | 007 | ✅ Concluído |
| Módulo 8 Join.Chat | 008 | ✅ Concluído |
| ID Sequencial C289+ | 009 | ✅ Concluído |
| Dashboard ROI/CRM | 010 | ⏳ Parcial |
| Tag Ativo Verificado | 011 | ✅ Concluído |
