# SAIP Mobile — app da equipe do petshop

App React Native (Expo) para a **equipe da loja** operar o dia a dia pelo
celular. É uma aplicação separada do dashboard web (`../petshop-app`),
mas do **mesmo sistema**: mesmo Supabase, mesmo banco, mesma
autenticação, mesmas permissões de equipe e mesmos status de
agendamento. Nenhuma tabela, enum ou fluxo paralelo é criado aqui — as
ações chamam as mesmas funções do banco que o painel web chama.

## Rodando

```bash
cd petshop-mobile
cp .env.example .env   # preencha (ver abaixo)
npm install
npx expo start
```

Abra no **Expo Go** (celular) lendo o QR code, ou pressione `a` / `i`
para emulador Android/iOS.

Variáveis do `.env`:

| Mobile                          | Web                             | Obrigatória |
| ------------------------------- | ------------------------------- | ----------- |
| `EXPO_PUBLIC_SUPABASE_URL`      | `NEXT_PUBLIC_SUPABASE_URL`      | sim         |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim         |
| `EXPO_PUBLIC_SITE_URL`          | endereço do site no ar          | não         |

`EXPO_PUBLIC_SITE_URL` (ex.: `https://meu-petshop.vercel.app`, sem barra
no final) liga o que depende do site: o link "Esqueci minha senha", o
link de acompanhamento nas mensagens de WhatsApp e a distância/tempo das
rotas do TaxiDog. Sem ela o resto do app funciona igual.

A `SUPABASE_SERVICE_ROLE_KEY` e a `GOOGLE_MAPS_API_KEY` **não existem
aqui** e nunca devem existir: são chaves de servidor, e tudo no app roda
no aparelho do usuário.

## Quem entra

Login com a mesma conta do painel web (`supabase.auth`), por **e-mail e
senha** ou **Google**. O papel é resolvido igual ao `loginAction` do web
(metadata → tabelas):

- **lojista** / **funcionário ativo** → entra no app;
- **cliente** (ou conta sem loja) → vê um aviso de que o app é da equipe;
- **funcionário desativado** → vê um aviso e só pode sair.

As permissões de equipe (`pode_gerenciar_agenda`,
`pode_gerenciar_clientes_pets`, …) são lidas da tabela `funcionario` e
bloqueiam o conteúdo das telas, do mesmo jeito que no dashboard.

### Login com Google — configuração única no Supabase

O Google devolve a pessoa para o app por um endereço próprio. Em
**Supabase → Authentication → URL Configuration → Redirect URLs**,
adicione:

- `saip://**` — app instalado (o `scheme` do `app.json`);
- `exp://**` — só para testar pelo Expo Go.

Sem isso, o Google abre o site em vez de voltar para o app.

"Esqueci minha senha" abre a tela de redefinição do site (o link que
chega por e-mail é o do painel web).

## Área da loja

| Tela            | O que faz                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------- |
| Início          | Resumo do dia, próximos agendamentos, atalho para novo agendamento                          |
| Agendamentos    | Agenda por dia (setas para outros dias) e **Novo** agendamento                              |
| Agendamento     | Aceitar / iniciar / finalizar, remarcar, alterar serviço ou pet, cancelar, pagamento, profissional, ligar / WhatsApp |
| Clientes / Pets | Busca e ficha (leitura); "Novo agendamento" a partir do cliente                             |
| Mais → Funcionários  | Equipe e permissões; o dono ativa/desativa o acesso                                    |
| Mais → Produtos      | Catálogo e estoque; entrada/saída de estoque; ativar/desativar                         |
| Mais → Relatórios    | Faturamento do período, ticket médio, por serviço, profissional e forma de pagamento   |
| Mais → Configurações | Agendamento online, dias de funcionamento, dias fechados (feriado, folga)              |
| Mais → Perfil da loja | Dados da loja (leitura)                                                               |

Regras que valem igual ao painel web (estão no banco, não no app):

- o status não volta; iniciar e finalizar só a partir do dia do agendamento;
- iniciar/finalizar com a busca do TaxiDog pendente **avisa** e pergunta
  (cliente trouxe o pet / seguir mesmo assim);
- remarcar muda o pedido inteiro e respeita loja fechada, conflito e TaxiDog
  (`fn_remarcar_agendamento`);
- alterar serviço ou pet só em Pendente ou Aceito (`fn_editar_agendamento`);
- novo agendamento da loja nasce Aceito, com forma de pagamento
  (`fn_criar_agendamento_lojista_com_pagamento`) e, se o pet tiver plano,
  pode usar o benefício.

Alguns botões só aparecem para o **dono da conta** (ativar funcionário,
agendamento online, dias da semana): a RLS só deixa o dono gravar nessas
tabelas — no site, o administrador grava pelo servidor.

Continuam só no painel web: cadastro de cliente, pet, serviço, produto e
funcionário; planos; TaxiDog e produtos dentro de um novo agendamento;
formas de pagamento, link de agendamento e demais configurações.

## TaxiDog

Funcionário com a função **TaxiDog** (`funcionario.pode_taxidog`,
migration 042 — marcada em Equipe no painel web) entra direto na área de
corridas, com abas próprias. Quem também tem permissões da loja troca de
área em **Mais** (a escolha fica salva no aparelho).

- Dados vêm de `fn_listar_corridas` / `fn_listar_rotas` (só o que é do
  próprio TaxiDog — sem abrir RLS de cliente/pet pra ele).
- Cada botão chama `fn_avancar_corrida` / as funções de rota, que só
  aceitam a próxima etapa válida.
- Avisos dentro do app (corrida nova, pet pronto para entrega, rota
  atribuída/aprovada/alterada) via Supabase Realtime
  (`src/contexts/TaxiDogContext`). O canal só é assinado depois de a
  sessão estar carregada (`src/lib/realtime.ts`) — antes disso ele entra
  como anônimo e a RLS descarta tudo em silêncio.
- Distância e tempo da rota: o app pede o cálculo ao site
  (`POST /api/rotas/recalcular`, com o token da sessão); precisa de
  `EXPO_PUBLIC_SITE_URL` aqui e de `GOOGLE_MAPS_API_KEY` no servidor.

## Gerar o app instalável (EAS)

O `eas.json` já tem dois perfis: `preview` (APK para instalar direto no
Android) e `production` (pacote da loja). Uma vez:

```bash
npm install -g eas-cli
eas login
eas init            # cria o projeto na sua conta Expo e grava o projectId no app.json
```

Depois cadastre no EAS as mesmas variáveis do `.env` (o `.env` não é
enviado para o build): em **expo.dev → projeto → Environment variables**,
crie `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` e
`EXPO_PUBLIC_SITE_URL` nos ambientes **preview** e **production**, com
visibilidade "Plain text". E então:

```bash
eas build --platform android --profile preview
```

O identificador do app é `com.saip.petshop.equipe` (`app.json`, Android
e iOS). Dá para trocar à vontade **antes** da primeira publicação na
loja; depois de publicado, ele não muda mais.

## Estrutura

```
app/                      rotas (expo-router, file-based)
  _layout.tsx             providers + gate de autenticação
  login.tsx               e-mail/senha, Google, esqueci minha senha
  auth.tsx                retorno do login com Google
  (tabs)/                 área da equipe (5 abas)
    index.tsx             Início
    agendamentos/         lista por dia, [id], novo, remarcar, editar
    clientes/             lista + detalhe
    pets/                 lista + detalhe
    mais/                 menu, funcionários, produtos, relatórios, configurações, perfil
  taxidog/                área do TaxiDog (corridas e rotas)
src/
  components/             UI compartilhada (Card, Botao, Folha, SeletorDia, …)
  contexts/               AuthContext (sessão, papel, permissões), TaxiDogContext
  hooks/                  consultas ao Supabase por tela
  lib/                    supabase, agendamentos (ações), status, datas, formatação
  theme/                  tokens espelhados do globals.css do web
  types/                  tipos das tabelas existentes
```

## Ainda não tem

- **Notificações push** (aviso com o app fechado): precisa do projeto no
  EAS (`projectId`), de um build instalável — o Expo Go do Android não
  recebe push remoto — e de um envio pelo servidor. Hoje os avisos são
  só com o app aberto.
- **Área do cliente**: o app é da equipe; o cliente usa o site.
- Fontes da marca (Inter / Plus Jakarta Sans — hoje usa a do sistema).
