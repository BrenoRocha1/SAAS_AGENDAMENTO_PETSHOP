# SAIP Mobile — app do petshop (equipe, TaxiDog e cliente)

App React Native (Expo) com três áreas, escolhidas pela conta que entra:
a **loja** (dono e funcionários), o **TaxiDog** e o **cliente**. É uma
aplicação separada do site (`../petshop-app`), mas do **mesmo sistema**:
mesmo Supabase, mesmo banco, mesma autenticação, mesmas permissões e
mesmos status de agendamento. Nenhuma tabela, enum ou fluxo paralelo é
criado aqui.

O que é leitura ou tem função própria no banco, o app faz direto no
Supabase. O que só existe no servidor do site (convite por e-mail,
gravações feitas como administrador, envio de foto, cotação do TaxiDog,
criar agendamento do cliente, criar e excluir conta) o app pede ao site:
`POST /api/app/acao` roda a mesma Server Action do painel, identificando
a pessoa pelo token da sessão (`src/lib/acoes.ts`). A regra continua num
lugar só.

## Rodando

```bash
cd petshop-mobile
cp .env.example .env   # preencha (ver abaixo)
npm install
npx expo start
```

Abra no **Expo Go** (celular) lendo o QR code, ou pressione `a` / `i`
para emulador Android/iOS. Também roda no navegador:
`npx expo start --web` (abre em `http://localhost:8081`).

Variáveis do `.env`:

| Mobile                          | Web                             | Obrigatória |
| ------------------------------- | ------------------------------- | ----------- |
| `EXPO_PUBLIC_SUPABASE_URL`      | `NEXT_PUBLIC_SUPABASE_URL`      | sim         |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim         |
| `EXPO_PUBLIC_SITE_URL`          | endereço do site no ar          | na prática, sim |

`EXPO_PUBLIC_SITE_URL` (ex.: `https://meu-petshop.vercel.app`, sem barra
no final) liga tudo o que passa pelo site: os cadastros e configurações
da loja, o agendamento e o cadastro do cliente, fotos, a cotação e as
rotas do TaxiDog, "Esqueci minha senha" e o link de acompanhamento nas
mensagens de WhatsApp. Sem ela o app abre e mostra os dados, mas essas
telas ficam só para leitura, com um aviso. No celular precisa ser um
endereço que o aparelho alcance (o site publicado, ou o IP do computador
na rede — `localhost` só serve para o app rodando no navegador).

A `SUPABASE_SERVICE_ROLE_KEY` e a `GOOGLE_MAPS_API_KEY` **não existem
aqui** e nunca devem existir: são chaves de servidor, e tudo no app roda
no aparelho do usuário.

## Quem entra

Login com a mesma conta do painel web (`supabase.auth`), por **e-mail e
senha** ou **Google**. O papel é resolvido igual ao `loginAction` do web
(metadata → tabelas):

- **lojista** / **funcionário ativo** → área da loja (ou do TaxiDog);
- **cliente** → área do cliente;
- conta nova vinda do Google, ainda sem cadastro → completa CPF e
  telefone e vira cliente;
- **funcionário desativado** → vê um aviso e só pode sair.

Quem ainda não tem conta cria a de **cliente** pela tela de login
("Criar conta de cliente"). A conta da loja é criada pelo site.

"Sair" encerra só a sessão deste aparelho (o site continua logado, e
sair do site não derruba o app).

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
| Clientes / Pets | Busca, ficha, cadastro e edição; "Novo agendamento" a partir do cliente                     |
| Mais → Funcionários  | Equipe e permissões; o dono ativa/desativa o acesso                                    |
| Mais → Produtos      | Catálogo e estoque; entrada/saída de estoque; ativar/desativar                         |
| Mais → Relatórios    | Faturamento do período, ticket médio, por serviço, profissional e forma de pagamento   |
| Mais → Configurações | Agendamento online, dias de funcionamento, dias fechados (feriado, folga)              |
| Mais → Perfil da loja | Dados e logo da loja                                                                  |

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

Pelo menu da loja também se cadastra e edita cliente, pet, serviço,
produto e funcionário, planos, formas de pagamento, dados da loja e a
configuração do TaxiDog — todos pela ponte com o site.

Continuam só no site: TaxiDog dentro do novo agendamento feito pela loja
e a troca de transporte de um agendamento; o painel de corridas da loja
(atribuir corrida, aprovar rota); as avaliações recebidas.

## Área do cliente

| Tela         | O que faz                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------ |
| Início       | Resumo da conta, planos ativos e próximos agendamentos                                     |
| Agendamentos | Próximos e histórico; remarcar e alterar (enquanto Pendente), cancelar, Pix da loja, avaliar |
| Novo agendamento | Loja → pet e serviço → transporte (levar ou TaxiDog) → pagamento → data e horário → confirmar, com produtos e saldo do plano |
| Pets         | Lista, cadastro, edição, foto e remover da lista                                           |
| Petshops     | Lojas com agendamento online, aberto/fechado agora, WhatsApp                               |
| Menu         | Meus planos (saldo, cobranças, usos), meu perfil, excluir a conta, sair                    |

O agendamento é criado pela mesma action do site
(`criarAgendamentoAction`): preço, conflito de horário, plano e TaxiDog
são conferidos no servidor, não no app.

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
  cadastro.tsx            criar conta de cliente
  auth.tsx                retorno do login com Google
  cliente/                área do cliente (início, agendamentos, pets, petshops, menu)
  (tabs)/                 área da equipe
    index.tsx             Início
    agendamentos/         lista por dia, [id], novo, remarcar, editar
    clientes/             lista + detalhe
    pets/                 lista + detalhe
    mais/                 serviços, produtos, funcionários, planos, relatórios, configurações, pagamentos, loja
  taxidog/                área do TaxiDog (corridas e rotas)
src/
  telas/                  telas usadas por mais de uma área (remarcar, alterar agendamento)
  components/             UI compartilhada (Card, Botao, Folha, SeletorDia, …)
  contexts/               AuthContext (sessão, papel, permissões), TaxiDogContext
  hooks/                  consultas ao Supabase por tela
  lib/                    supabase, acoes (ponte com o site), agendamentos, status, datas, formatação
  theme/                  tokens espelhados do globals.css do web
  types/                  tipos das tabelas existentes
```

## Ainda não tem

- **Notificações push** (aviso com o app fechado): precisa do projeto no
  EAS (`projectId`), de um build instalável — o Expo Go do Android não
  recebe push remoto — e de um envio pelo servidor. Hoje os avisos são
  só com o app aberto.
- Fontes da marca (Inter / Plus Jakarta Sans — hoje usa a do sistema).
