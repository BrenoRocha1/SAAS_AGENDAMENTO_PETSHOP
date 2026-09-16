# Agendamento Online — link público `/agendamento/[id_lojista]`

## 0. Levantamento antes de implementar

| Item | Já existia? | Onde |
|---|---|---|
| Toggle "Agendamento Online" por loja | ✅ Sim | `lojista.aceita_agendamento_online` (migration 020) |
| Wizard de agendamento pelo cliente | ✅ Sim, mas genérico | `/cliente/novo-agendamento` (`NovoAgendamentoWizard.tsx`) — escolhe a loja, 1 serviço só, sem escolher profissional, disponibilidade por loja inteira |
| Preço por porte/raça do pet | ✅ Sim | `servico_variacao` + `fn_calcular_preco_servico` (migration 010) |
| `agendamento.id_funcionario` | ✅ Sim, mas só o lojista preenchia depois, manualmente | migration 012 |
| Cliente ver a lista de funcionários de uma loja | ❌ Não | RLS de `funcionario` só libera pro próprio funcionário e pro lojista dono |
| Disponibilidade de horário por profissional (não só por loja) | ❌ Não | `fn_horarios_disponiveis` sempre olhava a loja inteira |
| Carrinho com vários serviços num agendamento só | ❌ Não | `fn_criar_agendamento` sempre foi 1 serviço por chamada |
| Link único por loja pra compartilhar | ❌ Não | Não existia rota pública nenhuma fora de `/cliente/...` |

Esta página **não substitui** `/cliente/novo-agendamento` — ela é a versão pensada pra ser compartilhada
(WhatsApp, Instagram, bio) com o link direto da loja, seguindo o modelo (Canva) que o lojista trouxe.

## 1. O que é genuinamente novo

- **Migration 022** (`022_agendamento_online.sql`), 3 funções novas:
  - `fn_funcionarios_publicos(p_id_lojista)` — expõe só `id_funcionario/nome/cargo` dos ativos (nunca email/telefone/permissões), pro cliente escolher quem atende.
  - `fn_horarios_disponiveis_funcionario(p_id_lojista, p_data, p_duracao, p_id_funcionario opcional)` — igual `fn_horarios_disponiveis`, mas quando um profissional é informado, o conflito é checado **só contra os agendamentos daquele profissional** (permite dois profissionais atenderem ao mesmo tempo na loja). Sem profissional ("sem preferência"), continua checando a loja inteira — igual ao comportamento de sempre.
  - `fn_criar_agendamento_multiplo(...)` — recebe um **array de serviços** e cria um agendamento por serviço, encadeados (um começa onde o anterior termina), numa transação só: ou agenda tudo, ou nada (se o 2º serviço não couber mais, os anteriores desse carrinho são desfeitos junto).
- **`atualizarClassificacaoPetAction`** — complementa só espécie/porte de um pet que já existe (sem mexer em nome/raça/sexo/data de nascimento), pra quando o pet ainda não tem essa classificação e o preço por variação precisa dela.
- **Link único por loja**: `/agendamento/[id_lojista]` — card em Configurações → Agendamentos com o link pronto pra copiar (`LinkAgendamentoOnline.tsx`).
- **`redirectTo` no login**: quem clica no link sem estar logado é mandado pro login (via `middleware.ts`, que já suportava `redirectTo` — só faltava a rota `/agendamento` entrar na lista de rotas protegidas) e volta exatamente pra essa página depois de entrar.

## 2. Fluxo (seguindo o modelo enviado)

1. **Escolha o Serviço** — grade com os serviços ativos da loja, seleção múltipla (carrinho). Preço mostrado aqui é o preço base ("a partir de").
2. **Pet** — escolhe entre os pets já cadastrados. Se o pet escolhido não tem espécie/porte, um mini-formulário completa isso ali mesmo (sem abrir a tela cheia de edição de pet). A partir daí o "Valor Total" já reflete o preço real calculado por `fn_calcular_preco_servico`.
3. **Tutor** — só exibe nome/telefone/CPF já cadastrados na conta (não pede de novo).
4. **Profissional, dia e hora** — dropdown de profissionais (ou "sem preferência") + tira de dias (próximos 30) + grade de horários, considerando a duração somada de todos os serviços do carrinho.
5. **Resumo** — todos os serviços do carrinho com preço, pet, tutor, profissional, data/hora, duração e valor total. Botão "Agendar" chama `criarAgendamentoOnlineAction`.
6. **Confirmação** — "Serviço agendado!" + botão "Enviar no Whatsapp" (`wa.me/55<telefone da loja>`, mensagem pré-preenchida com o resumo).

## 3. Segurança e multi-tenant

- `/agendamento/*` entrou na lista de rotas protegidas do `middleware.ts` — sem sessão, vai pro login (com volta automática).
- A página confere, nessa ordem: loja existe e está ativa → loja aceita agendamento online → usuário logado é `cliente` (lojista/funcionário vendo o próprio link recebem um aviso, não o wizard).
- Toda authorização de verdade continua nas RPCs (SECURITY DEFINER), não na tela: `fn_criar_agendamento_multiplo` reconfere `auth.uid()`, `aceita_agendamento_online`, se o pet pertence ao cliente, se o profissional pertence à loja, e a disponibilidade — mesmo que alguém tente forjar a chamada direto.
- `fn_funcionarios_publicos` é a única forma do cliente enxergar funcionários de uma loja — devolve só nome/cargo, nunca dado sensível.
- Todas as 3 funções novas seguem o padrão do projeto: `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated`.

## 4. Arquivos

**Criados:**
- `supabase/migrations/022_agendamento_online.sql`
- `src/app/agendamento/[id]/page.tsx`
- `src/components/cliente/AgendamentoOnlineWizard.tsx`
- `src/components/lojista/LinkAgendamentoOnline.tsx`
- `docs/AGENDAMENTO_ONLINE.md`

**Modificados:**
- `src/lib/validations.ts` — `agendamentoOnlineSchema`, `classificacaoPetSchema`.
- `src/lib/actions.ts` — `criarAgendamentoOnlineAction`, `atualizarClassificacaoPetAction`; `loginAction` passa a aceitar `redirectTo` (só de volta pra `/agendamento/*`, nunca rota arbitrária).
- `src/middleware.ts` — `/agendamento` entrou nas rotas protegidas.
- `src/app/login/page.tsx` — repassa `redirectTo` da URL como campo oculto do form.
- `src/lib/agenda.ts` — `diaSemanaBrasil()`.
- `src/components/icons/index.tsx` — `IconLink`, `IconCopy`.
- `src/app/lojista/configuracoes/agendamentos/page.tsx` — card com o link pra copiar.
- `src/app/globals.css` — classes `.agenonline-*`.

## 5. O que ficou de fora por agora

- Criar um pet novo direto no fluxo (hoje só permite escolher entre os já cadastrados, com link pra `/cliente/pets/novo` se não tiver nenhum) — evita duplicar o formulário completo de pet (que exige sexo/data de nascimento, não mostrados no modelo).
- Um seletor de data avançado tipo calendário/"(Definir)" do modelo — a tira mostra os próximos 30 dias, roláveis, o que já cobre a janela usada em `/cliente/novo-agendamento`.
- Slug amigável pro link (hoje é o UUID do lojista) — dá pra adicionar depois sem quebrar nada, é só trocar o que o link aponta.

## 6. Testes realizados

`tsc --noEmit`, `eslint` e `next build` completos, sem erros novos (route `/agendamento/[id]` aparece no build como dinâmica). Falta rodar a migration 022 no Supabase e testar manualmente: abrir o link de uma loja com agendamento online ativo, carrinho com 2 serviços, pet sem espécie/porte, escolher profissional específico e "sem preferência", conferir que os horários batem com a duração somada, confirmar e testar o botão do WhatsApp.
