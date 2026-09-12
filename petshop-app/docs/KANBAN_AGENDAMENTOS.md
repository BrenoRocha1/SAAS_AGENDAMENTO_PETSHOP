# Kanban de Agendamentos

Tela nova em `/lojista/kanban`, com ativação/desativação em Perfil da Loja.
Documento cobre exatamente os pontos pedidos.

## Tradução do pedido pra arquitetura real do projeto

O pedido original foi escrito nos termos de um projeto Prisma/multi-tenant
(`Company → Store → Appointments`). **Este projeto não tem essa hierarquia.**
Aqui o modelo é:

- `lojista` = o "tenant" (uma conta = um petshop, identificada por
  `id_lojista = auth.uid()`). Não existe `Company` nem `Store` separados.
- `agendamento`, `pet`, `cliente`, `servico`, `funcionario` = as tabelas
  reais (equivalentes a `Appointments`/`Pets`/`Clients`/`Services`).
- Backend é Supabase (Postgres + RLS), não Prisma. Não existe schema Prisma
  pra alterar — as mudanças de banco são migrations SQL (padrão já usado
  em `supabase/migrations/`).

Tudo abaixo foi implementado em cima dessas estruturas reais, não das
genéricas do pedido.

## 1. Arquivos

**Criados**
- `src/app/lojista/kanban/page.tsx` — rota nova, Server Component.
- `src/components/lojista/KanbanBoard.tsx` — o board (Client Component).
- `supabase/migrations/013_lojista_kanban_ativo.sql` — coluna nova (ver seção 6).
- `docs/KANBAN_AGENDAMENTOS.md` — este documento.

**Modificados**
- `src/lib/actions.ts` — nova action `alternarKanbanAction`.
- `src/components/icons/index.tsx` — ícones novos `IconKanban`, `IconArrowRight`.
- `src/components/layout/LojistaSidebar.tsx` — item "Kanban" condicional.
- `src/app/lojista/layout.tsx` — busca `kanban_ativo` e repassa pra sidebar.
- `src/components/lojista/PerfilLojistaForm.tsx` — seção "Gestor de Agendamentos".
- `src/app/globals.css` — classes novas `.kanban-*` (nenhuma classe existente foi alterada).

**Removidos**: nenhum.

## 2. Frontend

### Tela do Kanban
Três colunas fixas, exatamente como pedido: **Agendamentos Pendentes**,
**Em Andamento**, **Finalizado**. Cada card mostra: pet, cliente, serviço,
horário, profissional responsável (ou "Sem profissional"), porte/espécie/raça
do pet (quando o pet tiver essa informação — campos opcionais desde a
migration 010), valor e status.

### Mapeamento de status (decisão confirmada com você antes de implementar)
O enum `status_agendamento` já existente é `Pendente / Confirmado /
Concluído / Cancelado` — **não existe "Em Andamento" no banco, e nenhum
foi criado**. O Kanban reaproveita exatamente esse enum:

| Coluna do Kanban | Status real no banco |
|---|---|
| Agendamentos Pendentes | `Pendente` |
| Em Andamento | `Confirmado` |
| Finalizado | `Concluído` |

`Cancelado` fica fora do board (mesma regra que a Dashboard e a Agenda
semanal já usam pra excluir cancelados da visualização ativa).

### Alteração de status
Reaproveita **a action que já existia**, sem criar nada novo:
`atualizarStatusAgendamentoAction(id_agendamento, status)` — a mesma usada
pelo painel de detalhes da Dashboard e da Agenda semanal. O botão no rodapé
do card chama essa action com o próximo status da sequência
(Pendente→Confirmado, Confirmado→Concluído). Sem drag-and-drop (ver seção
"Performance" — decisão deliberada).

### Componentes reutilizados (não recriados)
- `.card`, `.badge-pendente/confirmado/concluido`, `.btn-*`, `.form-select`,
  `.alert-*`, `.empty-state*`, `.dash-day-nav`, `.dash-icon-btn` — todos já
  existiam, usados como estão.
- Ícones: `IconDog`, `IconUserBadge`, `IconCalendar`, `IconChevronLeft/Right`,
  `IconAlert` já existiam; só `IconKanban` e `IconArrowRight` são novos.
- Padrão de navegação por dia (`?data=YYYY-MM-DD` + `<Link>`/`router.push`):
  o mesmo já usado em `/lojista/dashboard` e `/lojista/agendamentos`.
- Padrão de "ajustar estado quando a prop muda durante a renderização" (em
  vez de `useEffect` + `setState`): o mesmo já usado em `DashboardClient`.

### Filtros
Por **profissional** e por **serviço** — client-side, sobre os dados do dia
já carregados (sem nova consulta ao banco a cada troca de filtro). Filtro
por **dia** já existe via navegação (setas + "Hoje"), igual às outras telas.
Não implementei filtro por "tutor"/cliente porque não foi pedido e não
tem UI de busca prevista aqui (a busca de cliente já existe na Dashboard).

### Rota nova
`/lojista/kanban` — usa o `LojistaLayout` existente (sidebar + guarda de
autenticação/role), igual a todas as outras rotas do lojista. Nenhum
sistema de rotas paralelo.

## 3. Configurações — "Gestor de Agendamentos"

Adicionado dentro da tela **já existente** `/lojista/perfil` (Perfil da
Loja), como uma nova seção/card, **não** uma tela de configurações separada
— o projeto já usa Perfil da Loja como o lugar das configurações da conta,
então essa foi a estrutura reaproveitada em vez de criar uma área nova.

- Botão "Ativado"/"Desativado" chama `alternarKanbanAction(true|false)`
  imediatamente (sem precisar clicar em "Salvar alterações" do formulário
  principal — é independente, como os toggles de Horários/Funcionários que
  já existiam).
- Estado refletido na hora na UI (otimista) e persistido no banco.

## 4. Persistência (banco)

**Não existia** nenhuma estrutura de configuração de recursos por loja —
`lojista` só tinha dados de identificação/endereço e uma flag `ativo` (que é
o status da conta inteira, não de uma funcionalidade específica). Por isso
foi necessária uma migration nova:

```sql
-- supabase/migrations/013_lojista_kanban_ativo.sql
ALTER TABLE lojista
  ADD COLUMN IF NOT EXISTS kanban_ativo BOOLEAN NOT NULL DEFAULT true;
```

Sem RLS nova: a policy `"lojista: update proprio"` (migration 002) já
cobre update de qualquer coluna da própria linha, essa incluída.

**Pendência**: rodar essa migration no SQL Editor do Supabase. Até lá, o
sistema **não quebra** — `layout.tsx` e a página do Kanban detectam o erro
de coluna inexistente e assumem `true` (Kanban visível) como
comportamento de segurança, sem derrubar nenhuma página do lojista.

## 5. Segurança / Isolamento por loja

Não existe `store_id`/`company_id` neste projeto — o equivalente é
`id_lojista`. Isolamento garantido em duas camadas, como em toda a área do
lojista:

1. **RLS no Postgres**: a policy `"agendamento: lojista ve do petshop"`
   (`USING (id_lojista = auth.uid())`) já impede, no nível do banco, que
   um lojista veja agendamento de outro — mesmo que o código do
   componente tivesse algum bug.
2. **Filtro explícito na query** (`page.tsx`): `.eq('id_lojista', lojistaId)`
   em todas as consultas (agendamento, funcionário, serviço), mesma
   convenção já usada em todas as outras páginas do lojista.

Nenhuma consulta global — tudo escopado por `auth.getUser()` do
próprio request.

## 6. Performance

- **Sem biblioteca nova.** Nada de drag-and-drop (`react-beautiful-dnd`,
  `dnd-kit` etc.) — troca de status é por **botão** no card, não
  arrastar. Motivo: essas libs são pesadas, exigem JS de mouse/touch
  tracking constante, e o pedido original já cita "computadores antigos de
  recepção" como restrição real — um botão é mais leve, mais acessível
  (funciona por teclado/leitor de tela) e não tem lag nenhum.
- Uma consulta ao banco por carregamento de página (`Promise.all` com 3
  queries independentes: agendamentos do dia + funcionários + serviços),
  igual ao padrão já usado na Agenda semanal.
- Trocar de filtro (profissional/serviço) ou de coluna **não** dispara
  consulta nova — filtra em memória o array já carregado.
- Ícones SVG inline (sem biblioteca de ícones).

## 7. Estados de interface

| Estado | Onde |
|---|---|
| Carregamento | Server Component — o Next mostra o conteúdo já pronto (sem spinner necessário; consulta é rápida e única) |
| Kanban desativado | Card dedicado com ícone, explicação e botão pra ir ativar |
| Lista vazia (sem agendamento no dia) | Empty state com ícone e sugestão |
| Coluna vazia | Texto simples dentro da coluna ("Nenhum agendamento aqui" / "Nada com esse filtro") |
| Atualizando status | Botão do card vira "Salvando..." e desabilita só aquele card |
| Sucesso | Card muda de coluna na hora (otimista) + `router.refresh()` sincroniza com o servidor |
| Falha ao salvar | Alerta vermelho no topo com a mensagem de erro; card não muda de coluna |
| Erro ao carregar agendamentos | Alerta explicando (cita a migration 010 se for coluna de pet faltando) |

## 8. Navegação

Item "Kanban" adicionado em `LojistaSidebar` **entre Agendamentos e
Serviços**, usando o mesmo array `navItems` e o mesmo `<Link>` de sempre —
nenhum sistema de navegação paralelo. Ele só aparece quando
`kanban_ativo = true` (prop vinda de `LojistaLayout`, que já carrega os
dados da loja pra sidebar de qualquer forma — nenhuma consulta extra).

## 9. O que ainda depende de você

**Rodar a migration `013_lojista_kanban_ativo.sql`** no Supabase (SQL
Editor). Sem isso, o toggle em Perfil da Loja retorna um erro tratado
pedindo pra rodar a migration; o Kanban em si continua acessível (assume
ativado por padrão até a coluna existir).

## 10. Como testar

1. Rode a migration 013 (se ainda não rodou).
2. Login como lojista → **Perfil da Loja** → seção "Gestor de
   Agendamentos" → confirme que está "Ativado" (padrão).
3. Clique em **Kanban** na sidebar → veja as 3 colunas com os
   agendamentos do dia atual.
4. Clique em **"Iniciar atendimento"** num card da coluna Pendentes → ele
   deve se mover pra "Em Andamento" na hora.
5. Clique em **"Finalizar"** nesse card → deve se mover pra "Finalizado".
6. Recarregue a página (F5) → confirme que os status persistiram (não é
   só estado local — veio do banco).
7. Teste os filtros por profissional e por serviço.
8. Navegue pra outro dia (setas do topo) e confirme que os agendamentos
   mudam.
9. Volte em **Perfil da Loja** → clique em "Ativado" pra desativar.
10. Confirme que o item **Kanban some da sidebar** imediatamente.
11. Acesse `/lojista/kanban` direto pela URL → deve mostrar a tela de
    "Kanban desativado" (não quebra, não mostra dado nenhum).
12. Reative e confirme que volta a aparecer na sidebar.
