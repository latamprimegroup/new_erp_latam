# Módulo de Onboarding de Clientes

Agenda integrada com Google Calendar para reuniões de onboarding. Participantes recebem push no celular.

## Funcionalidades

- **Agendar reuniões** com cliente, data, participantes
- **Integração Google Calendar** – eventos criados no calendário configurado
- **Push para colaboradores** – participantes recebem notificação no celular ao serem incluídos
- **Listar agenda** – próximas reuniões

## Acesso

- Menu: **Onboarding Clientes** (visível para ADMIN, COMMERCIAL, DELIVERER, PRODUCER, FINANCE, MANAGER, PRODUCTION_MANAGER)
- URL: `/dashboard/onboarding`

## Configuração Google Calendar

### 1. Projeto no Google Cloud

1. Acesse [Google Cloud Console](https://console.cloud.google.com)
2. Crie ou escolha um projeto
3. Habilite a **Google Calendar API**
4. Em Credenciais → Criar credenciais → Cliente OAuth 2.0
5. Tipo: Aplicativo da Web
6. URIs de redirecionamento autorizados: `https://seudominio.com/api/auth/callback/google` (ou use o fluxo OAuth Playground para obter o refresh token)

### 2. Obter Refresh Token

Use o [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/):

1. Scope: `https://www.googleapis.com/auth/calendar`
2. Autorize e troque o código por tokens
3. Copie o **Refresh token**

### 3. Variáveis de ambiente (.env)

```env
GOOGLE_CALENDAR_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=xxx
GOOGLE_CALENDAR_REFRESH_TOKEN=xxx
GOOGLE_CALENDAR_CALENDAR_ID=primary
```

- `primary` = calendário principal da conta usada no OAuth

## Push no celular

Colaboradores precisam **ativar notificações push** na tela de Onboarding:

1. Adicione o ERP à tela inicial (PWA)
2. Clique em "Ativar no celular"
3. Aceite a permissão

Recomendado: iPhone iOS 16.4+ com PWA instalado.

## APIs

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/onboarding/meetings | Listar reuniões (filtros: from, to, clientId) |
| POST | /api/onboarding/meetings | Criar reunião |
| GET | /api/onboarding/meetings/[id] | Detalhe da reunião |
| PATCH | /api/onboarding/meetings/[id] | Atualizar |
| DELETE | /api/onboarding/meetings/[id] | Remover |
| GET | /api/onboarding/colaboradores | Listar colaboradores para participantes |
