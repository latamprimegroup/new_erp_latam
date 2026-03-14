# Roadmap de Melhorias — ERP Ads Ativos

Documento baseado no `melhoria.txt` e na estrutura atual do projeto. Contém o que já foi implementado e os próximos passos planejados.

---

## Visão geral

| Passo | Módulo | Status | Prioridade |
|-------|--------|--------|------------|
| 1 | Correções Rápidas (UI/UX) | ✅ Concluído | — |
| 2 | Módulo Produção (completo) | ⏳ Pendente | Alta |
| 3 | Plug & Play | ⏳ Pendente | Média |
| 4 | Reclassificação G2 | ⏳ Pendente | Alta |
| 5 | Perfil de Reputação do Cliente | ⏳ Pendente | Média |
| 6 | Dashboard MCC (Google Ads) | ⏳ Pendente | Inovação |

---

## Passo 1 — Correções Rápidas (Concluído)

**Data:** Março 2026

### 1.1 Contraste no Dark Mode
- Classe `.production-form-area` em `globals.css` para garantir contraste em inputs, selects e textareas
- Placeholders legíveis em modo escuro
- Container do formulário de produção com `dark:bg-ads-dark-card/80`

### 1.2 Campo TIPO com Select e Cores
- Substituição do input livre por select com opções pré-definidas
- Categorias e cores:

| Valor | Label | Cor (Hex) |
|-------|-------|-----------|
| WHITE | WHITE | #10b981 (Verde) |
| BLACK | BLACK | #3b82f6 (Azul) |
| G2_PREMIUM | G2 Premium | #8b5cf6 (Roxo) |
| BOV_PENDENTE | BOV Pendente | #f59e0b (Âmbar) |
| EM_CONTESTACAO | Em Contestação | #f97316 (Laranja) |
| __OUTRO__ | Outro (digitar) | #6b7280 (Cinza) |

- Badge colorido na tabela de listagem

### 1.3 Editar e Excluir Produção
- **API:** `PATCH /api/producao/[id]` e `DELETE /api/producao/[id]`
- Regra: apenas contas com status **PENDING** (em produção)
- Permissão: produtor dono da conta ou admin
- Exclusão: soft delete (campo `deletedAt`)
- Interface: botões Editar/Excluir com edição inline (plataforma e tipo)

---

## Passo 2 — Módulo Produção (Completo) ✅

**Status:** Implementado em Março 2026

### Objetivo
Completar o formulário de cadastro de produção com campos adicionais, upload de documentos e central de feedback.

### 2.1 Campos Extras no Cadastro
- **ID da Conta:** máscara `000-000-0000`
- **Tipo de Moeda:** select com moedas globais (BRL, USD, EUR, etc.) — usar lib `iso-country-currency` ou similar
- **Código A2F (2FA):** chave secreta de autenticação de dois fatores
- **Código G2 Aprovada:** ID de aprovação da G2
- **URLs de Referência:**
  - Site: URL da landing page
  - Link CNPJ BIZ: consulta rápida

### 2.2 Upload de Documentos
- **Cartão CNPJ:** input de arquivo restrito a PDF
- Validação de MIME type no backend
- Renomeação automática: `cnpj_[ID_DA_CONTA].pdf`
- Storage: bucket S3 ou Supabase Storage

### 2.3 Validação de Duplicidade
- Mensagem: *"Esta conta já foi produzida por [Nome do Colaborador]"*
- Verificação em tempo real ao salvar
- Bloqueio de salvamento se duplicado

### 2.4 Central de Feedback e Melhoria Contínua
- **Sugestões de Melhoria (Sistema):** formulário Título/Descrição para bugs ou novas funções
- **Sugestões de Melhoria (Empresa):** canal para processos, cultura ou operação (pode ser anônimo)
- Destino: backlog TI (sistema) e direção (empresa)

### Estrutura de Dados Sugerida
| Campo | Tipo | Descrição |
|-------|------|-----------|
| account_id | String (PK) | ID único da conta Google Ads |
| currency | Enum | Moeda selecionada |
| a2f_code | String | Chave 2FA |
| g2_approval_code | String | Código G2 |
| cnpj_pdf_url | String | Link do PDF no storage |
| created_by | FK | Colaborador que produziu |

---

## Passo 3 — Plug & Play ✅

**Status:** Implementado em Março 2026

### Objetivo
Identificar contas de alta confiabilidade (G2 + campanha White aprovada) com badge exclusivo e fluxo de venda rápida.

### 3.1 Atributos da Conta Plug & Play
- Status G2: código G2 Aprovado vinculado
- Checkbox obrigatório: "Primeira Campanha White Aprovada?"
- Validação de saldo: permitir envio para estoque com saldo R$ 0,00
- Badge visual: [PLUG & PLAY] em verde neon ou roxo

### 3.2 Fluxo de Inventário
- Filtro: "Apenas Contas Prontas (Plug & Play)" na tela de vendas/entrega
- Garantia de entrega: resumo "Conta G2 verificada + Campanha White aprovada. Pronta para troca de domínio/criativo."

### 3.3 Estrutura de Dados
| Campo | Tipo | Descrição |
|-------|------|-----------|
| is_plug_play | Boolean | Passou pela 1ª aprovação White |
| campaign_status | Enum | PENDING, APPROVED, REJECTED |
| balance_status | Boolean | true = com saldo / false = sem saldo |

---

## Passo 4 — Reclassificação G2 (Logística Reversa)

**Prioridade:** Alta | **Esforço:** Baixo | **Dependência:** Nenhuma

### Objetivo
Redirecionar contas com falha na G2 para venda como "Google Verificação Anunciante", evitando desperdício.

### 4.1 Gatilho de Rejeição G2
- Botão "G2 Rejeitada" na linha da conta
- Modal de confirmação com opção: "Mover para estoque como: Google Verificação Anunciante"
- Automação: limpar `g2_approval_code`, alterar categoria para `GOOGLE_VERIFIED_ADS`

### 4.2 Visibilidade no Setor de Vendas
- Estoque diferenciado: aba ou categoria separada
- Tag de origem: "Reclassificação G2" para auditoria

### Transição de Estado
| Status Anterior | Ação | Novo Status | Categoria |
|-----------------|------|-------------|-----------|
| PRODUZINDO_G2 | Marcar Rejeitada | DISPONIVEL | CONTA_VERIFICADA_ANUNCIANTE |

---

## Passo 5 — Perfil de Reputação do Cliente

**Prioridade:** Média | **Esforço:** Médio | **Dependência:** Nenhuma

### Objetivo
"Serasa interno" — analisar histórico do cliente para decidir se pode receber contas G2 Premium ou precisa de restrições.

### 5.1 Indicadores (KPIs)
- Taxa de queda: tempo médio de vida das contas vendidas
- Histórico de reembolso/substituição
- Frequência de pagamento
- Nível de nicho: WHITE, BLACK, NUTRA, CASINO

### 5.2 Categorização Visual (Badges)
| Score | Nível | Cor | Regra |
|-------|-------|-----|-------|
| 80–100 | VIP / Safe | Verde | Prioridade para Plug & Play |
| 50–79 | Regular | Amarelo | Estoque comum |
| < 50 | High Risk | Vermelho | Bloquear G2 Premium |

### 5.3 Garantia Reversa
- Blacklist automática: 3 erros em contas Plug & Play seguidas → alerta para Admin auditar
- Função `updateCustomerScore` disparada quando Entrega registra "Problema na Conta"

### Estrutura de Dados
| Campo | Tipo | Descrição |
|-------|------|-----------|
| reputation_score | Integer | 0–100 |
| average_account_lifetime | Float | Dias médios de vida das contas |
| refund_count | Integer | Total de solicitações de substituição |
| niche_tag | Enum | WHITE, BLACK, NUTRA, CASINO |

---

## Passo 6 — Dashboard MCC (Google Ads)

**Prioridade:** Inovação | **Esforço:** Alto | **Dependência:** API Google Ads, OAuth2, credenciais

### Objetivo
Dashboard de gestão de contingência integrado à API do Google Ads, com métricas em tempo real e ações rápidas.

### 6.1 Integração MCC
- Ler conta mestre (Manager Account)
- Iterar sobre `customer_client`
- API Routes como proxy (credenciais nunca no frontend)

### 6.2 Métricas de Status
| Métrica | Lógica |
|---------|--------|
| Total | Count de todas as contas vinculadas |
| Gastando | ENABLED + impressions > 0 |
| Vendendo | conversions > 0 |
| Travado | customer.status = SUSPENDED |
| Caiu | Anúncios reprovados ou saldo zerado |

### 6.3 Métricas de Recuperação
- Em Contestação: SUSPENDED + ticket aberto (registro manual no DB)
- Recuperadas (Appeals): SUSPENDED → ENABLED
- Pausadas (BOV): Verificação de Operações Comerciais
- Recuperadas (BOV): BOV concluído com sucesso

### 6.4 Lógica de Diff
- Comparar estado ontem vs. hoje
- Detectar transições SUSPENDED → ENABLED para incrementar contadores

### 6.5 Ações Rápidas
- Pausar Tudo (Kill Switch): PAUSED para todas as contas do grupo
- Solicitar Reembolso: atalho para cancelamento e reembolso

### 6.6 Dependências Técnicas
- Developer Token, Client ID, Client Secret no `.env`
- OAuth2 flow
- GAQL (Google Ads Query Language)

---

## Referências

- **Fonte:** `melhoria.txt` (documento original)
- **Wireframe:** `WIREFRAME-MELHORIAS.md`
- **Migração:** `MIGRACAO-MELHORIAS.md`
