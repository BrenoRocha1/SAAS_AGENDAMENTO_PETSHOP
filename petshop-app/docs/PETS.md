# Gerenciamento de Pets — `/lojista/pets`

## 0. Tradução do pedido pra arquitetura real

O pedido veio em termos de um projeto genérico (`Pets`/`Clients` como
"models" Prisma, `company_id`/`store_id`, roles Admin/Atendente/Caixa).
**Nada disso existe aqui.** Traduzido pra este projeto: Next.js +
Supabase (Postgres/RLS), sem Prisma; `pet.id_cliente → cliente` é o único
relacionamento (não existe hierarquia empresa→loja); e a "store" é
`lojista.id_lojista = auth.uid()`, ligada a um pet **indiretamente**,
através de `cliente_lojista` (migration 014) — não existe `pet.id_lojista`.

## 1. Levantamento feito antes de codar

| Pergunta | Resposta real |
|---|---|
| Como Pets já são representados? | Tabela `pet` (migration 001 + 010): `id_pet, id_cliente, nome, raca, sexo, dt_nasc, peso, obs, ativo`, mais `especie` (`especie_pet`: Cão/Gato) e `porte` (`porte_pet`: Pequeno/Médio/Grande), ambos nullable (pets cadastrados antes da migration 010 não têm essa info). |
| Como Pet se relaciona com Cliente? | `pet.id_cliente → cliente.id_cliente`, `ON DELETE RESTRICT`. Um cliente pode ter vários pets (`idx_pet_cliente`). |
| Como a Store é identificada pra um Pet? | Não existe coluna direta. A ligação é via `cliente_lojista` (migration 014): "este lojista conhece este cliente" → todo pet desse cliente é, por extensão, um pet "da loja". |
| Como os agendamentos usam Pet? | `agendamento.id_pet → pet`, `ON DELETE RESTRICT`. Histórico de atendimentos = `agendamento` filtrado por `id_pet` + `id_lojista`. |
| Que APIs/hooks/services já existem? | Nenhum hook de dados client-side — o padrão é Server Component busca (RPC ou `.from()`), Client Component recebe como prop, Server Actions fazem mutação. Filtros/paginação via `searchParams` + `router.push` (Kanban, Agendamentos, Relatórios de Vendas). |
| Componentes visuais reutilizáveis | `.table`/`.table-container`, `.modal-*`, `.form-*`, `.dash-detail-row` (usado nos modais de detalhe do Kanban/Agenda), `.empty-state`, `.alert-*`, `.picker-list`/`.picker-item` (seletor de cliente já usado em `NovoAgendamentoModal`), `.dash-search`. Nada novo criado. |
| Cadastro de pet já existia? | Parcialmente: `criarPetLojistaAction` + `fn_criar_pet_lojista` (migration 015) já existiam, usados dentro do modal de "Novo Agendamento" (pra cadastrar o pet de um cliente novo na hora). **Não existia** uma tela de gerenciamento (listar, buscar, editar, ver histórico) — é isso que esta migration/feature adiciona. |
| Edição de pet já existia? | **Não, pra lojista.** A única policy de UPDATE em `pet` (migration 002, `"pet: update proprio"`) só deixa o PRÓPRIO CLIENTE editar o pet dele. Não tinha nenhum caminho pro lojista editar — corrigido com `fn_editar_pet_lojista` (migration 018), gateado por `cliente_lojista`, igual a criação. |

## 2. O que foi implementado

### Backend (migration 018 — nenhuma tabela/coluna nova)
- **`fn_buscar_pets_lojista`**: busca + filtro + paginação **dentro do
  Postgres** — nunca carrega todos os pets pro navegador. Busca por nome
  do pet, nome do tutor e raça (`ILIKE`, combinadas com `OR`); filtra por
  espécie/porte (os enums que já existiam, `especie_pet`/`porte_pet` —
  nenhum novo criado); pagina com `LIMIT/OFFSET`; devolve o total via
  `COUNT(*) OVER()`, sem uma segunda query de contagem. Junta com
  `cliente_lojista` — só pets de clientes deste lojista.
- **`fn_editar_pet_lojista`**: mesmo padrão de segurança de
  `fn_criar_pet_lojista` (auth.uid() = lojista, pet precisa pertencer a
  cliente vinculado). Permite trocar até o tutor — mas exige que o NOVO
  tutor também esteja vinculado a este mesmo lojista, nunca um cliente de
  fora (`cliente_lojista` é a única fonte de verdade do relacionamento,
  sem caminho paralelo).

### Frontend
- **`/lojista/pets`** — listagem: busca com debounce (500ms, a primeira
  busca-em-texto-livre-via-URL do projeto — todos os filtros anteriores
  eram dropdown), filtros por espécie/porte, tabela (Pet, Espécie, Raça,
  Porte, Tutor, Telefone, Cadastro, Ações), paginação (20 por página),
  botão "+ Novo Pet".
- **`/lojista/pets/[id]`** — visualização detalhada: dados do pet, dados
  do tutor, e histórico de atendimentos **deste petshop** (reaproveita
  `agendamento` filtrado por `id_pet` + `id_lojista` — não é um sistema de
  histórico novo, é a mesma tabela de sempre).
- **`PetFormModal.tsx`** — modal único de cadastro/edição, reaproveitado
  nos dois fluxos (lista e detalhe, via `?editar=<id>` que reabre o modal
  já preenchido). Seletor de tutor com busca (mesmo padrão do seletor de
  cliente em `NovoAgendamentoModal`) — carrega só `id_cliente`/`nome`/
  `telefone` de cada cliente da loja, não a lista de pets deles.
- Sidebar: item **"Pets"** entre Clientes e Funcionários.

## 3. Arquivos

**Criados:**
- `supabase/migrations/018_pets_lojista.sql`
- `src/app/lojista/pets/page.tsx`
- `src/app/lojista/pets/[id]/page.tsx`
- `src/components/lojista/PetsList.tsx`
- `src/components/lojista/PetFormModal.tsx`
- `docs/PETS.md`

**Modificados:**
- `src/lib/actions.ts` — `editarPetLojistaAction`.
- `src/components/layout/LojistaSidebar.tsx` — item "Pets".
- `src/components/icons/index.tsx` — `IconEye` (ação "visualizar").

## 4. Relacionamento Pet → Cliente

Não foi criado NENHUM relacionamento paralelo. `pet.id_cliente` continua
sendo a única fonte de verdade de quem é o tutor. A tela de Pets só
adiciona uma forma de **consultar/alterar** esse relacionamento existente
— nunca cria um cliente "de dentro" do cadastro de pet (o formulário só
lista clientes já cadastrados; se não houver nenhum, mostra um aviso
apontando pra Clientes → Novo Cliente, sem duplicar aquele fluxo aqui).

## 5. Multi-tenant

- `fn_buscar_pets_lojista` e `fn_editar_pet_lojista`: `auth.uid() != p_id_lojista` levanta exceção; o `JOIN cliente_lojista` restringe todo resultado/edição a pets de clientes deste lojista.
- A busca de um pet específico (`?editar=` e a tela de detalhe) usa o client autenticado normal (RLS ligado), não `service_role` — mesmo se alguém forçar um `id_pet` de outra loja na URL, a policy `"pet: lojista ve pets de clientes vinculados"` (migration 015) devolve vazio, e a tela mostra "Pet não encontrado" (não revela se o pet existe em outra loja).

## 6. Permissões

Página dentro de `/lojista/*`, já restrito a `role = 'lojista'` pelo layout existente (`src/app/lojista/layout.tsx`). Não existem hoje roles "Admin/Atendente/Caixa" dentro de uma loja neste projeto — só `lojista` (dono) e `funcionario` (tem flags no banco, mas nenhuma tela própria ainda). Nenhum sistema de permissão novo foi criado.

## 7. Performance

- Busca/filtro/paginação inteiros no Postgres (RPC), nunca em JS sobre lista completa.
- Busca em texto livre com debounce (500ms) — não dispara uma navegação por tecla digitada.
- Duas consultas por carregamento de página (pets + clientes), em paralelo (`Promise.all`).
- Seletor de tutor carrega só `id_cliente/nome/telefone` — não a lista de pets de cada cliente (usada em outros seletores, mas desnecessária aqui).

## 8. Testes realizados

`tsc --noEmit`, `eslint` e `next build` completos e limpos. Fluxo manual a testar após rodar a migration: abrir Pets → buscar por nome/tutor/raça → criar pet associado a um tutor existente → visualizar (conferir histórico) → editar (inclusive trocar tutor) → recarregar e confirmar persistência → conferir que o pet aparece no seletor do "Novo Agendamento" → confirmar que uma segunda conta de lojista não vê esses pets.

## 9. Preparado para melhorias futuras

- Se a base de clientes de uma loja ficar muito grande, o seletor de tutor (hoje carrega a lista inteira e filtra em memória, igual `NovoAgendamentoModal` já fazia) pode virar uma RPC de busca (`fn_buscar_clientes_lojista`) nos mesmos moldes de `fn_buscar_pets_lojista` — mesma técnica, sem redesenhar nada.
- A tela de detalhe já isola o histórico de atendimentos num bloco próprio — dá pra acrescentar paginação nele (hoje limitado a 30) sem mexer no resto da página.
