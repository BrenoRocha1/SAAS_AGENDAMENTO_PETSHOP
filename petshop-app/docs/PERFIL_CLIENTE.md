# Perfil do Cliente — `/lojista/clientes/[id]`

## 0. Tradução do pedido

O pedido veio em termos genéricos (`company_id`/`store_id`, roles Admin/
Atendente/Caixa, "módulo Financeiro" separado). Nada disso existe neste
projeto — é Next.js + Supabase (RLS), tenant único por `lojista.id_lojista
= auth.uid()`, sem módulo Financeiro dedicado (a definição de faturamento
já vivia em `fn_metricas_lojista` e depois no Relatório de Vendas — ver
`docs/RELATORIOS_VENDAS.md`). Tudo abaixo foi implementado reaproveitando
essa arquitetura real, incluindo os dois recursos mais recentes (Pets e
Relatórios de Vendas), não em cima do vocabulário genérico do pedido.

## 1. O que já existia (não recriado)

- **Listagem de Clientes** (`/lojista/clientes`) — mantida: mesmas colunas
  (Cliente, Contato, Pets, Agendamentos), mesmo visual. Só ganhou busca,
  paginação e uma coluna de Ações.
- **Cadastro de cliente** (`cadastrarClienteLojistaAction` + `fn_registrar_
  cliente_lojista`, migration 014) — reaproveitado como está, sem duplicar.
- **Cadastro/edição de pet** (`PetFormModal`, `criarPetLojistaAction`/
  `editarPetLojistaAction`, migration 018) — reaproveitado pra "Adicionar
  Pet" no perfil, só ganhou um modo "tutor fixo" (ver seção 4).
- **Modal de novo agendamento** (`NovoAgendamentoModal`) — reaproveitado
  pra "Novo Agendamento" no perfil, mesmo esquema (tutor fixo).
- **Definição de faturamento/venda/pendente** (`status = 'Concluído'` /
  `'Pendente'+'Confirmado'`) — a mesma do Relatório de Vendas, reaplicada
  aqui sem reinventar regra nenhuma.

## 2. O que foi adicionado

### Listagem (evolução, não recriação)
Busca por nome/telefone/e-mail e paginação, ambas resolvidas no banco
(`fn_buscar_clientes_lojista`, migration 019) — a página antes carregava
TODOS os clientes da loja pra agrupar em JS, sem busca nenhuma. Agora é
uma única função com `ILIKE` + `COUNT(*) OVER()`, mesmo padrão já usado em
`fn_buscar_pets_lojista` (migration 018). Cada linha ganhou uma coluna
Ações (👁 ver perfil, ✏️ editar) e o nome do cliente virou link pro perfil.

### Perfil do cliente (`/lojista/clientes/[id]`, novo)
Uma página só, sem abas — cards de resumo no topo, depois seções em grid
de 2 colunas, depois duas listas full-width, seguindo a organização
sugerida no pedido. Tudo com os componentes que já existem: `.stat-card`,
`.card`, `.dash-detail-row`, `.table`, `.badge-*`, `.relatorio-lista*`
(estas últimas já criadas para o Relatório de Vendas).

**A decisão técnica mais importante desta página**: ela busca UMA vez
todos os agendamentos deste cliente neste petshop (até 200, ordenados do
mais recente) e computa tudo em JavaScript a partir desse único array —
resumo financeiro, ranking de serviços, estatística por pet, último/
próximo agendamento, linha do tempo. Isso NÃO é o anti-padrão "carregar
tudo pra agregar no browser" que o pedido pede pra evitar — aquele
anti-padrão é sobre carregar a LOJA INTEIRA (todos os clientes, todos os
agendamentos); aqui o conjunto já é inerentemente pequeno (o histórico de
UM cliente), então uma consulta e um `reduce`/`group by` em JS é mais
simples e mais barato que 5 RPCs diferentes pra a mesma informação.

Seções implementadas:
- **Cabeçalho**: nome, telefone, e-mail, e as ações rápidas (WhatsApp,
  Adicionar Pet, Novo Agendamento, Editar).
- **Resumo** (4 cards): Total gasto, Ticket médio, Agendamentos (com
  concluídos entre parênteses), Pets.
- **Último atendimento** / **Próximo agendamento**: dados completos
  (data, horário, pet, serviço, profissional, valor, status) + "há N dias
  desde o último atendimento".
- **Dados do cliente**: nome, telefone, e-mail, CPF, data de cadastro,
  última atualização.
- **Resumo financeiro**: total gasto, total pendente, ticket médio,
  atendimentos concluídos, cancelamentos, maior valor num atendimento,
  serviço mais contratado, frequência média (só aparece com ≥2
  atendimentos concluídos — ver seção 5).
- **Pets**: nome, espécie/porte/raça, quantidade de atendimentos, último e
  próximo atendimento de cada um — cada pet linka pro seu próprio perfil
  em `/lojista/pets/[id]`.
- **Serviços mais utilizados**: ranking por quantidade, com valor total.
- **Linha do tempo**: os 8 eventos mais recentes (mesmos dados do
  histórico, formato compacto).
- **Histórico de agendamentos**: tabela completa (até 200 registros).

## 3. Arquivos

**Criados:**
- `supabase/migrations/019_clientes_lojista.sql` — `fn_buscar_clientes_lojista`, `fn_editar_cliente_lojista`.
- `src/app/lojista/clientes/[id]/page.tsx` — perfil do cliente.
- `src/components/lojista/ClienteFormModal.tsx` — modal de criar/editar (extraído do que já existia em `ClientesList.tsx`, pra dar suporte a edição sem duplicar o formulário).
- `docs/PERFIL_CLIENTE.md` — este documento.

**Modificados:**
- `src/app/lojista/clientes/page.tsx` — passou a usar a RPC de busca/paginação; lê `?editar=`.
- `src/components/lojista/ClientesList.tsx` — busca com debounce, paginação, coluna Ações, usa `ClienteFormModal`.
- `src/lib/actions.ts` — `editarClienteLojistaAction`.
- `src/lib/validations.ts` — `editarClienteLojistaSchema`.
- `src/lib/format.ts` — `formatarCpf` (mesma ideia de `formatarTelefone`: dado cru no banco, máscara só na exibição).
- `src/components/lojista/PetFormModal.tsx` — prop opcional `clienteFixo` (tutor pré-selecionado e travado, pro fluxo "Adicionar Pet" a partir do perfil).
- `src/components/lojista/PetsList.tsx` / `src/app/lojista/pets/page.tsx` — leem `?novoPetTutor=<id>` e abrem o cadastro já com esse tutor.
- `src/components/lojista/NovoAgendamentoModal.tsx` — prop opcional `clienteIdFixo` (mesmo esquema do pet, pro fluxo "Novo Agendamento" a partir do perfil).
- `src/components/lojista/AgendaCalendar.tsx` / `src/app/lojista/agendamentos/page.tsx` — leem `?novoAgendamentoTutor=<id>`.

## 4. Como o relacionamento Cliente → Pets → Agendamentos foi usado

Nenhum relacionamento novo. `pet.id_cliente` e `agendamento.id_cliente` já
existiam; o perfil só faz `SELECT`s filtrados por esse cliente (e, no caso
de agendamento, também por `id_lojista`, pra nunca misturar histórico de
outra loja). As ações rápidas "Adicionar Pet" e "Novo Agendamento"
reaproveitam os MESMOS componentes/actions já usados em Pets e Agenda —
só ganharam um modo "tutor pré-selecionado", sem criar um segundo
caminho de cadastro.

## 5. O que não pôde ser calculado com confiança (e por quê)

- **Frequência média de agendamentos**: só aparece com 2+ atendimentos
  concluídos — com 0 ou 1, não existe um intervalo real pra medir, e
  mostrar uma aproximação (tipo "assumir 30 dias") seria inventar dado.
- **Campo de observações do cliente**: `cliente` não tem coluna `obs`
  (diferente de `pet.obs` e `agendamento.obs`, que existem). Não foi
  criada uma coluna nova só para isso agora — se for importante no
  futuro, o caminho natural é `ALTER TABLE cliente ADD COLUMN obs TEXT`,
  seguindo exatamente o mesmo padrão já usado nas outras duas tabelas.
- **Roles Admin/Atendente/Caixa**: não existem nesta arquitetura — ver
  `docs/RELATORIOS_VENDAS.md`, seção 6, mesma explicação vale aqui.
- **"Total recebido" como algo diferente de "Total gasto"**: o banco não
  distingue faturado de efetivamente recebido (sem forma de pagamento
  registrada) — mesma limitação já documentada no Relatório de Vendas,
  por isso o card usa "Total gasto" (= o que já foi concluído), não dois
  números que seriam idênticos.

## 6. Multi-tenant e permissões

- `cliente`/`pet`/`agendamento` já tinham RLS restringindo o lojista a só
  ver quem está vinculado a ele (`cliente_lojista`, migrations 014/015) —
  a página de perfil roda com o client autenticado normal (não
  `service_role`), então fica sob essa RLS além do filtro explícito
  (`.eq('id_cliente', id)` + `.eq('id_lojista', lojistaId)` nos
  agendamentos). Se o cliente não pertence à loja, a consulta volta vazia
  e a tela mostra "Cliente não encontrado" — não revela se ele existe em
  outra loja.
- `fn_buscar_clientes_lojista`/`fn_editar_cliente_lojista` seguem o mesmo
  padrão de toda RPC do projeto: `IF auth.uid() != p_id_lojista THEN
  RAISE EXCEPTION`, e `fn_editar_cliente_lojista` também confere que o
  cliente está em `cliente_lojista` antes de deixar editar.
- Página dentro de `/lojista/*`, já restrita a `role = 'lojista'` pelo
  layout existente — nenhum sistema de permissão novo.

## 7. Performance

- Listagem: busca + paginação inteiras no Postgres, nunca carrega todos
  os clientes.
- Perfil: uma consulta de agendamentos (limitada a 200, ordenada), tudo
  o resto (resumo, ranking, timeline, estatística por pet) é derivado
  dela em JS — zero N+1, zero consulta por pet/serviço.
- Nenhuma biblioteca nova.

## 8. Testes realizados

`tsc --noEmit`, `eslint` e `next build` completos, todos limpos. Fluxo
manual a testar depois de rodar a migration 019: abrir Clientes → buscar
→ abrir um perfil → conferir os números batendo com a Agenda/Kanban →
editar cliente → Adicionar Pet → Novo Agendamento (confirmar que o tutor
já vem travado nos dois) → recarregar e confirmar persistência → testar
cliente sem pet/sem agendamento/sem próximo agendamento (empty states).
