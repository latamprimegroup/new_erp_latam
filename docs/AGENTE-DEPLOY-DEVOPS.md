# Agente de IA Deploy Automático — ERP Ads Ativos

> Visão de Engenheiro de Sistemas + Arquiteto DevOps + Especialista em Automação

---

## 1. Visão Estratégica

O Agente de Deploy opera como um **DevOps Autônomo Integrado ao ERP**:

- **Pensa** antes de executar
- **Valida** antes de alterar
- **Salva** (backup) antes de atualizar
- **Testa** antes de publicar

**Objetivo principal:** transformar deploy técnico complexo em processo guiado, automatizado e à prova de erro, permitindo que qualquer pessoa sem conhecimento técnico coloque o ERP no ar.

---

## 2. Arquitetura do Agente

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     AGENTE DEPLOY AUTOMÁTICO                             │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Verificação │  │  Config BD   │  │  Deploy      │  │  Validação   │ │
│  │  Inicial     │→ │  Automático  │→ │  Sistema     │→ │  Pós-Deploy  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Atualização │  │  Backup      │  │  Diagnóstico │  │  Monitoramento│ │
│  │  Automática  │  │  Automático  │  │  Inteligente │  │  Contínuo    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Componentes

| Componente | Função | Responsabilidade |
|------------|--------|------------------|
| **Deploy Orchestrator** | Orquestra o fluxo completo | Etapas sequenciais, rollback, estado |
| **Diagnostics** | Detecção de problemas | Conexão, permissões, versão, integridade |
| **Version Control** | Controle de versão do ERP | Histórico, rollback, compatibilidade |
| **Backup Manager** | Backup e restauração | Diário, pré-atualização, restauração |
| **Health Monitor** | Monitoramento pós-deploy | Disponibilidade, erros críticos, alertas |

---

## 3. Modos de Operação

### 3.1 Modo "Publicar ERP" (Primeira Instalação)

| Etapa | Ação | Validação |
|-------|------|-----------|
| 1 | Verificar credenciais (DATABASE_URL, NEXTAUTH_SECRET, etc.) | Explicar em linguagem simples se faltar algo |
| 2 | Criar/atualizar banco (Prisma migrate / db push) | Validar estrutura, aplicar migrações |
| 3 | Criar admin padrão (seed) | Senha segura gerada |
| 4 | Deploy do sistema (arquivos já publicados via hosting) | Validar rotas, login, permissões |
| 5 | Checklist de integridade | Marcar "Produção Ativa" |

### 3.2 Modo "Atualização Automática"

| Etapa | Ação |
|-------|------|
| 1 | Backup automático do banco e arquivos |
| 2 | Validação de compatibilidade |
| 3 | Migração inteligente (novas colunas, índices, sem apagar dados) |
| 4 | Rollback automático se falhar |
| 5 | Registro de versão aplicada |

### 3.3 Modo "Criança de 10 Anos"

- Interface: **um único botão** — "Colocar ERP no Ar"
- Barra de progresso visual
- Mensagens simples e didáticas
- Indicadores verdes/vermelhos
- Sem termos técnicos

Exemplos de mensagens:
- ✔ Conectando ao servidor…
- ✔ Criando banco de dados…
- ✔ Instalando sistema…
- ✔ Testando funcionamento…
- 🎉 ERP está no ar com sucesso!

---

## 4. Sistema de Diagnóstico Inteligente

| Problema | Detecção | Sugestão |
|----------|----------|----------|
| Erro de conexão | Falha ao conectar ao DB | Verificar DATABASE_URL no .env |
| Falha no banco | Migração falhou | Backup + rollback sugerido |
| Permissão insuficiente | Erro Prisma ao criar tabelas | Verificar usuário do banco |
| Conflito de versão | Schema desatualizado | Aplicar migração |
| NEXTAUTH_SECRET ausente | Variável não definida | Gerar chave automaticamente |

---

## 5. Backup Automático

- **Diário:** via CRON (CRON_SECRET)
- **Pré-atualização:** automático antes de qualquer migração
- **Histórico:** últimos N backups armazenados
- **Restauração:** 1 clique (Admin → Backup → Restaurar)

---

## 6. Segurança

- Geração automática de chaves seguras (NEXTAUTH_SECRET, ENCRYPTION_KEY)
- Proteção de rotas de deploy (apenas ADMIN)
- Rate limiting em ações críticas
- Criptografia de dados sensíveis em backup

---

## 7. Controle de Versão do ERP

- Registro em `SystemSetting`: `erp_version`, `erp_deploy_at`, `erp_last_migration`
- Histórico em `DeployLog` (opcional)
- Informar quando houver atualização disponível (futuro: compara com releases)

---

## 8. Variáveis de Ambiente

| Variável | Obrigatória | Uso |
|----------|-------------|-----|
| DATABASE_URL | Sim | Conexão com PostgreSQL |
| NEXTAUTH_SECRET | Sim | Sessões e tokens |
| NEXTAUTH_URL | Sim | URL base do ERP |
| ENCRYPTION_KEY | Recomendado | Criptografia de credenciais |
| CRON_SECRET | Recomendado | Backup automático |
| SETUP_TOKEN | Opcional | Permite migrate/seed sem login quando 0 admins |

---

## 9. Escopo Técnico vs Hosting

O agente opera **dentro do ERP** e **no contexto de hospedagem já provisionada**:

| Dentro do ERP | Fora do ERP (Manual/CI) |
|---------------|-------------------------|
| Verificar .env | Provisionar servidor |
| Rodar Prisma migrate/push | Configurar Vercel/Railway/etc |
| Criar admin padrão | Deploy via Git push |
| Backup/restauração | DNS, SSL |
| Diagnóstico | Escalar recursos |

O usuário final: **copia o repositório → conecta ao banco → acessa /dashboard/admin/deploy → clica "Colocar ERP no Ar"**.

Em ambientes Vercel + Supabase/Railway: o usuário configura DATABASE_URL uma vez; o resto é automático.

---

## 10. Fluxo Simplificado

```
[Usuário acessa /admin/deploy]
        ↓
[Botão "Colocar ERP no Ar"]
        ↓
[Etapa 1] Verificar ambiente → DATABASE_URL, NEXTAUTH_SECRET
        ↓
[Etapa 2] Criar/atualizar banco → prisma db push
        ↓
[Etapa 3] Seed admin (se vazio) → criar usuário inicial
        ↓
[Etapa 4] Validação → health check, login teste
        ↓
[✅ Produção Ativa]
```

---

## 11. Stack de Implementação

- **Lib:** `src/lib/agent/deploy.ts`, `diagnostics.ts`, `version.ts`
- **API:** `/api/admin/deploy/*`, `/api/health`
- **UI:** `/dashboard/admin/deploy` — wizard + modo simples
- **Schema:** `DeployLog` (histórico), `SystemSetting` (versão)
