# Dashboard do Lojista

Documentação da implementação da Dashboard em `/lojista/dashboard`, feita com base
numa referência visual (layout split: sidebar + topbar + cards + agenda do dia +
painel lateral com detalhes e fila de espera), adaptada à stack e ao design system
já existentes no projeto (Next.js App Router, Supabase, CSS puro em `globals.css`,
tema escuro roxo/âmbar).

## 1. Arquivos criados

| Arquivo | Papel |
|---|---|
| `src/components/icons/index.tsx` | Ícones de linha em SVG inline (sem lib externa, sem emoji) usados na sidebar e na Dashboard. |
| `src/components/lojista/DashboardClient.tsx` | Componente cliente principal da Dashboard: topbar, cards, agenda (dia/semana/mês), painel de detalhes, fila de espera. |
| `src/components/lojista/NovoAgendamentoModal.tsx` | Modal "Novo Agendamento": cliente → pet → serviço → data/horário → observações → confirmação. |
| `supabase/migrations/008_fn_criar_agendamento_lojista.sql` | Nova função `SECURITY DEFINER` que autoriza o **lojista** a criar um agendamento (ver seção 8/9). |
| `docs/DASHBOARD_LOJISTA.md` | Este documento. |

## 2. Arquivos modificados

| Arquivo | O que mudou | Por quê |
|---|---|---|
| `src/app/lojista/dashboard/page.tsx` | Reescrito. Continua Server Component, mas agora busca métricas de hoje/ontem, agenda do dia selecionado (via `?data=`), horários livres, fila de espera (pendentes) e a base de clientes/pets/serviços para o modal, e repassa tudo para `DashboardClient`. | A dashboard antiga só mostrava 4 métricas fixas e uma tabela do dia — sem navegação, sem ação de criar agendamento. |
| `src/components/layout/LojistaSidebar.tsx` | Ícones emoji trocados por SVG (`src/components/icons`). Nenhum item de menu, rota ou comportamento mudou. | Requisito explícito: "sem emojis ou emotes" na interface. |
| `src/app/globals.css` | Acrescentada a seção `DASHBOARD DO LOJISTA` (topbar, busca, linha do tempo, painel lateral, fila de espera, agregados de semana/mês, picker do modal) + regras responsivas correspondentes. Nada existente foi removido ou renomeado. | Não havia classes para os elementos novos (linha do tempo, painel lateral, etc.); o resto do app (dark mode, roxo, cards, tabelas, badges) foi **reaproveitado**, não recriado. |
| `src/lib/actions.ts` | Nova action `criarAgendamentoLojistaAction`, adicionada **depois** de `criarAgendamentoAction`, sem alterar nenhuma action existente. | Ver seção 9 — o lojista precisava de um caminho próprio para criar agendamento. |
| `src/lib/validations.ts` | Novo schema `agendamentoLojistaSchema = agendamentoSchema.extend({ id_cliente })` + tipo `AgendamentoLojistaData`. `agendamentoSchema` original não foi tocado. | Mesma razão acima — estende em vez de duplicar. |

Nenhuma classe, interface, tipo, tabela, policy de RLS ou função existente foi
removida ou teve sua assinatura/contrato alterado.

## 3. Componentes criados/alterados — visão funcional

- **Topbar** (`DashboardClient`): busca (filtra a agenda do dia e a fila de espera
  por nome de cliente/pet/serviço, em tempo real, no que já foi carregado),
  emblema da loja (nome do lojista, com link para `/lojista/perfil`), sino de
  notificações (mostra a contagem real de pendentes vinda do banco, com link para
  `/lojista/agendamentos`) e o botão **"Novo Agendamento"**.
- **Cards de métricas** (sempre referentes a **hoje**, independente do dia que a
  agenda abaixo está mostrando — igual à referência):
  - **Agendamentos hoje** — com selo comparando a ontem.
  - **Pets em atendimento** — pets cujo agendamento **Confirmado** de hoje está
    em andamento neste exato momento (hora atual entre início e fim do serviço).
  - **Faturamento do dia** — soma dos valores dos agendamentos de hoje (exceto
    cancelados), com selo comparando a ontem.
  - **Horários livres hoje** — quantidade de slots livres hoje e o próximo
    horário disponível.
- **Agenda** com abas **Dia / Semana / Mês**:
  - *Dia* (padrão): linha do tempo dos agendamentos do dia selecionado, com
    navegação `<` `>` e atalho "Hoje". Clicar num item abre os detalhes.
  - *Semana* / *Mês*: grade com um cartão por dia (contagem de agendamentos),
    carregada sob demanda; clicar num dia volta para a visão "Dia" naquela data.
- **Painel lateral**: **Detalhes** do item selecionado (cliente, pet, serviço,
  horário, valor, status) com ações reais de **Confirmar / Concluir / Cancelar**;
  e **Fila de espera**, com os agendamentos `Pendente` (qualquer data), também
  clicáveis.
- **Modal "Novo Agendamento"**: fluxo cliente → pet → serviço → data → horário →
  observações → confirmar, com loading, erro e sucesso tratados (ver seção 5).

## 4. Adaptações conscientes em relação à referência visual

A referência foi seguida na organização geral, mas três pontos foram
deliberadamente adaptados ao que o projeto **realmente** suporta, em vez de
fingir uma funcionalidade que não existe:

1. **Colunas por funcionário na agenda** — a referência mostra uma coluna por
   funcionário (Tosador, Banhista, Recepcionista...). A tabela `agendamento`
   **não tem** `id_funcionario` (nenhum agendamento é atribuído a um funcionário
   específico hoje). Implementar isso exigiria uma migration nova de schema +
   RLS + UI de atribuição — fora do escopo pedido. Optei por uma **linha do
   tempo única**, ordenada por horário, com toda a informação real disponível.
2. **Seletor de loja** ("Loja Vila Bocaina ▾") — o modelo de dados é 1 conta de
   lojista = 1 loja (não existe conceito de múltiplas lojas por conta). Por isso
   o emblema da loja é um link para o perfil, não um dropdown com várias lojas
   fictícias.
3. **"Meta" no card de faturamento** — não existe campo de meta/objetivo no
   banco. Troquei por um comparativo real (hoje vs. ontem).
4. **Item "Financeiro" na sidebar** — a referência tem esse item, mas não existe
   nenhuma tela/rota de financeiro no projeto. Não foi adicionado (evitar link
   morto ou tela com dados inventados). Fica como sugestão de próxima etapa.

## 5. Fluxo de criação de agendamento (passo a passo)

1. Lojista clica em **"+ Novo Agendamento"** (topbar) → abre `NovoAgendamentoModal`.
2. Escolhe um **cliente** (lista + busca) — apenas clientes que **já têm histórico
   de agendamento com este lojista** aparecem (mesma regra de RLS que já existia
   para a tela `/lojista/clientes`).
3. Escolhe um **pet** daquele cliente (só pets que já foram atendidos aqui).
4. Escolhe um **serviço ativo** do próprio catálogo do lojista.
5. Escolhe **data** e, ao carregar, os **horários disponíveis** (reaproveita a
   RPC existente `fn_horarios_disponiveis`, a mesma usada no agendamento do
   cliente — nenhuma lógica de slot foi duplicada).
6. Observações (opcional).
7. **Confirmar agendamento** → chama a server action `criarAgendamentoLojistaAction`
   → RPC `fn_criar_agendamento_lojista` (nova, ver seção 8/9) → grava na tabela
   `agendamento` com status `Confirmado`.
8. Estados tratados:
   - **Loading**: botão mostra "Agendando..." e desabilita o formulário.
   - **Erro**: alerta vermelho inline com a mensagem (horário indisponível,
     serviço inativo, etc.), sem fechar o modal — o lojista pode corrigir e
     tentar de novo.
   - **Sucesso**: alerta verde "Agendamento criado e confirmado com sucesso",
     modal fecha sozinho em ~1,2s.
9. O novo agendamento aparece **imediatamente** na linha do tempo (atualização
   otimista) **e** a página é revalidada (`router.refresh()` + `revalidatePath`
   no server), então os cards de métrica e a fila de espera também ficam corretos
   após o refresh.

## 6. Estruturas existentes reutilizadas (não duplicadas)

- **RPCs**: `fn_metricas_lojista`, `fn_agenda_dia`, `fn_horarios_disponiveis` —
  usadas exatamente como já eram, sem alterar assinatura.
- **Actions**: `atualizarStatusAgendamentoAction`, `cancelarAgendamentoAction` —
  usadas sem modificação nos botões de Confirmar/Concluir/Cancelar do painel de
  detalhes.
- **Schemas Zod**: `agendamentoSchema` é a base de `agendamentoLojistaSchema`
  (`.extend()`, não uma cópia).
- **Classes CSS**: `.card`, `.btn*`, `.badge*`, `.form-*`, `.slots-grid` / `.slot`,
  `.modal*`, `.alert*`, `.stat-card*`, `.empty-state*`, `.grid-4` — todas
  reaproveitadas tal como definidas para o resto do sistema.
- **Padrão de dados do modal**: a lógica de agrupar "clientes que já agendaram
  com este lojista + seus pets" replica a mesma consulta/agrupamento já usado em
  `/lojista/clientes/page.tsx` (mesmas tabelas, mesmas políticas de RLS).

## 7. Classes, interfaces e tipos preservados

Nada foi removido. Em particular, para uso futuro do backend/outras telas:

- Todas as `interface`/`type` de `src/lib/validations.ts` anteriores continuam
  intactas (`agendamentoSchema`, `AgendamentoData`, etc.) — `agendamentoLojistaSchema`
  é uma extensão nova, adicionada ao final do arquivo, junto de seu tipo
  `AgendamentoLojistaData`.
- Todas as actions em `src/lib/actions.ts` continuam com a mesma assinatura e
  comportamento (incluindo `criarAgendamentoAction`, usada pelo cliente, que
  **não foi tocada**).
- O enum `status_agendamento`, a tabela `agendamento` e todas as suas colunas,
  índices e triggers (migrations 001–007) continuam exatamente como estavam —
  a migration 008 só **adiciona** uma função nova.
- `LojistaSidebar` manteve os mesmos `navItems`/rotas; só o ícone mudou de
  emoji para SVG.

## 8. Integrações com backend utilizadas

Tudo já existente no Supabase foi usado via `@/lib/supabase/server` (Server
Components e Server Actions) e `@/lib/supabase/client` (buscas client-side de
horários/semana/mês, exatamente como o resto do app já faz):

- Tabelas: `agendamento`, `cliente`, `pet`, `servico`, `lojista` — sempre
  through RLS (nenhuma consulta usa `service_role`/admin client nesta feature).
- RPCs existentes: `fn_metricas_lojista`, `fn_agenda_dia`, `fn_horarios_disponiveis`.
- RPC **nova**: `fn_criar_agendamento_lojista` (migration 008).

## 9. O que ainda depende de você (pendências reais de backend)

**Isto é o ponto mais importante: sem o passo abaixo, o botão "Novo Agendamento"
mostra a UI completa, mas o "Confirmar agendamento" retorna um erro tratado
("Função fn_criar_agendamento_lojista não encontrada no banco...") em vez de
salvar.**

1. **Rodar a migration 008** no seu projeto Supabase (SQL Editor ou
   `supabase db push`): [`supabase/migrations/008_fn_criar_agendamento_lojista.sql`](../supabase/migrations/008_fn_criar_agendamento_lojista.sql).

   **Por que essa migration foi necessária** (não dava para reaproveitar o que
   já existia): a RPC `fn_criar_agendamento` (migration 003) tem
   `IF p_id_cliente != auth.uid() THEN RAISE EXCEPTION 'Acesso não autorizado'`
   — ou seja, **só o próprio cliente autenticado** pode criar o seu agendamento.
   E a policy de RLS `"agendamento: cliente insere"` (migration 002) também
   exige `id_cliente = auth.uid() AND auth_role() = 'cliente'`. Não existe,
   hoje, **nenhum caminho** (nem RPC, nem RLS) para um lojista inserir um
   agendamento em nome de um cliente. A migration 008 replica a mesma lógica de
   `fn_criar_agendamento` (checagem de conflito de horário com lock, validação
   de serviço ativo, bloqueio de data passada), mas autoriza `auth.uid() =
   p_id_lojista` em vez do cliente, e garante que o pet informado pertence a
   um cliente que já tem histórico com aquele lojista.

2. **Limitação de produto herdada do modelo atual** (não é bug, é como o app já
   funciona): o picker de cliente do modal só lista clientes que **já têm pelo
   menos um agendamento não cancelado** com aquele lojista — porque não existe
   uma "lista de clientes do lojista" independente de agendamento (mesma regra
   que já limita a tela `/lojista/clientes`). Ou seja: **um lojista novo, sem
   nenhum agendamento ainda, não consegue criar o primeiro agendamento manual**
   pelo modal — o primeiro agendamento de cada cliente precisa vir do próprio
   cliente, pelo fluxo normal (`/cliente/novo-agendamento`). Se isso for um
   problema real de uso, a solução é um novo conceito de "cliente avulso/convidado"
   cadastrado pelo lojista — não implementado aqui por ser uma mudança de
   modelo de dados maior, fora do pedido original.

3. **Semana/Mês** mostram contagem de agendamentos por dia; não mostram
   faturamento agregado na UI (o dado já vem calculado no `aggDias`, é só uma
   questão de exibir, se quiser — deixei o campo `total` pronto no estado).

4. **"Financeiro"** na sidebar da referência não foi criado (sem tela/dados
   correspondentes hoje — ver seção 4).

## 10. Como rodar e testar

```bash
cd petshop-app
npm install        # se ainda não tiver feito
npm run dev
```

1. Abra `http://localhost:3000/login` e entre com uma conta **lojista**.
2. Você já cai em `/lojista/dashboard`.
3. **Sem rodar a migration 008**: tudo renderiza normalmente (cards, agenda,
   fila de espera, navegação de dia/semana/mês, detalhes, confirmar/cancelar
   pendentes) — só o **salvar** do modal "Novo Agendamento" vai mostrar o erro
   tratado pedindo para rodar a migration.
4. **Depois de rodar a migration 008** (Supabase → SQL Editor → cole o
   conteúdo do arquivo → Run):
   - Se o lojista já tiver pelo menos um cliente com histórico (ou seja, algum
     cliente já agendou com ele antes pelo fluxo normal), o modal completo
     funciona: cliente → pet → serviço → data → horário → confirmar → o
     agendamento aparece na hora na agenda do dia, com status **Confirmado**.
   - Teste também os botões **Confirmar / Concluir / Cancelar** no painel de
     detalhes, clicando em qualquer item da agenda ou da fila de espera.
   - Teste a busca da topbar digitando um nome de pet ou cliente.
   - Teste a navegação **Dia** (`<`/`>`/"Hoje") e as abas **Semana**/**Mês**.
5. Responsividade: abaixo de 1024px o painel lateral desce para baixo da
   agenda; abaixo de 768px a busca ocupa a linha toda.
