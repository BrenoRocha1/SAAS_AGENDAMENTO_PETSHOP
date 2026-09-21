# SAIP Mobile — app da equipe do petshop

App React Native (Expo) para a **equipe da loja** operar o dia a dia pelo
celular. É uma aplicação separada do dashboard web (`../petshop-app`),
mas do **mesmo sistema**: mesmo Supabase, mesmo banco, mesma
autenticação, mesmas permissões de equipe e mesmos status de
agendamento. Nenhuma tabela, enum ou fluxo paralelo é criado aqui.

## Rodando

```bash
cd petshop-mobile
cp .env.example .env   # preencha com os mesmos valores do dashboard web
npm install
npx expo start
```

Abra no **Expo Go** (celular) lendo o QR code, ou pressione `a` / `i`
para emulador Android/iOS.

As variáveis do `.env` são as mesmas do `petshop-app/.env.local`, só que
com o prefixo do Expo:

| Mobile                          | Web                             |
| ------------------------------- | ------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`      | `NEXT_PUBLIC_SUPABASE_URL`      |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

A `SUPABASE_SERVICE_ROLE_KEY` **não existe aqui** e nunca deve existir:
é uma chave de servidor, e tudo no app roda no dispositivo do usuário.

## Quem entra

Login com a mesma conta do painel web (`supabase.auth`), e o papel é
resolvido igual ao `loginAction` do web (metadata → tabelas):

- **lojista** / **funcionário ativo** → entra no app;
- **cliente** → vê um aviso de que o app é da equipe;
- **funcionário desativado** → vê um aviso e só pode sair.

As permissões de equipe (`pode_gerenciar_agenda`,
`pode_gerenciar_clientes_pets`, …) são lidas da tabela `funcionario` e
bloqueiam o conteúdo das telas, do mesmo jeito que no dashboard.

## Estrutura

```
app/                      rotas (expo-router, file-based)
  _layout.tsx             providers + gate de autenticação
  login.tsx
  (tabs)/                 as 5 abas da barra inferior
    _layout.tsx           tab bar + bloqueio por papel
    index.tsx             Início
    agendamentos.tsx
    clientes/             lista + detalhe
    pets/                 lista + detalhe
    mais/                 menu + telas estruturais
src/
  components/             UI compartilhada (Card, Avatar, StatusBadge, …)
  contexts/AuthContext    sessão + papel + permissões
  hooks/                  consultas ao Supabase por tela
  lib/                    supabase, status, datas (fuso da loja), formatação
  theme/                  tokens espelhados do globals.css do web
  types/                  tipos das tabelas existentes
```

## O que já lê dados reais

| Tela                  | Origem                                                            |
| --------------------- | ----------------------------------------------------------------- |
| Início                | `agendamento` do dia (contadores, pets na loja, próximos)          |
| Agendamentos          | `agendamento` do dia, ordenado por horário                        |
| Clientes              | RPC `fn_buscar_clientes_lojista` (migration 019)                  |
| Detalhe do cliente    | `cliente` + `pet` do tutor                                        |
| Pets                  | RPC `fn_buscar_pets_lojista` (migration 018)                      |
| Detalhe do pet        | `pet` + tutor                                                     |
| Perfil da loja        | `lojista`                                                         |

## O que ainda é estrutural

Funcionários, Produtos, Relatórios e Configurações (dentro de **Mais**)
têm rota, navegação e identidade visual prontas, e mostram um aviso de
"em construção" — **sem dado fictício de propósito**. Cada uma tem a
tabela/RPC correspondente já existindo no banco, é só ligar.

Outros pontos deixados para depois: fontes da marca (Inter / Plus Jakarta
Sans — hoje usa a fonte do sistema), ações de escrita (mudar status de
atendimento pelo celular) e filtros de espécie/porte na lista de pets
(a RPC já aceita os parâmetros).
