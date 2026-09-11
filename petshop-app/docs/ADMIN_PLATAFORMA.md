# Admin da plataforma — Fase 1 (fundação)

Base para um painel interno da equipe da plataforma, separado do fluxo
cliente/lojista. **Esta é só a fase 1**: autenticação/autorização de admin +
listagem de empresas. A fase 2 (entrar em qualquer conta e agir como ela) está
desenhada na seção final deste documento, aguardando confirmação antes de
implementar — ela exige alterar código que já está em produção.

## O que existe agora

- **`supabase/migrations/009_admin_platform.sql`** — tabela `admin_usuario`
  (`id` referencia `auth.users`, `email`, `nome`, `ativo`). RLS habilitada,
  só com policy de `SELECT` do próprio registro. **Não existe** policy de
  `INSERT/UPDATE/DELETE` para usuários autenticados de propósito — promover
  alguém a admin é uma ação manual no banco (SQL Editor), nunca pela
  aplicação. Isso evita que a própria app vire uma porta pra escalar
  privilégio.
- **`src/lib/admin.ts`** — `getPlatformAdmin()`: retorna os dados do admin
  logado ou `null`. É ortogonal ao `role_usuario` (cliente/lojista) — a
  permissão de admin não depende, nem interfere, no papel normal da conta.
- **`src/app/admin/layout.tsx`** — gate: sem sessão → `/login`; logado mas
  sem linha em `admin_usuario` → `/` (sem mensagem de "acesso negado", pra
  não revelar que a rota existe).
- **`src/app/admin/page.tsx`** — lista todas as empresas (`lojista`) da
  plataforma via client `service_role` (a única forma de ver lojistas que
  não são o próprio usuário — a RLS de `lojista` não permite isso pra
  ninguém além do dono), com contagem de agendamentos por empresa.
- **`src/components/layout/AdminSidebar.tsx`** — sidebar própria do painel
  admin (reaproveita `logoutAction` e as classes CSS existentes de sidebar —
  nenhum CSS novo foi necessário).
- **`src/middleware.ts`** — `/admin` passou a fazer parte das rotas
  protegidas (redireciona pra `/login` se não houver sessão), mesma regra
  que já existia pra `/cliente` e `/lojista`.

## Como virar admin (primeira vez)

1. Crie uma conta normal (cliente ou lojista, tanto faz) pelo `/cadastro`
   ou `/cadastro/lojista`, ou use uma que já existe.
2. Pegue o UUID dela: Supabase → Authentication → Users → copie o `UID`
   daquele e-mail.
3. No SQL Editor do Supabase:

   ```sql
   insert into admin_usuario (id, email, nome)
   values ('<uuid copiado>', 'seuemail@dominio.com', 'Seu Nome');
   ```

4. Faça login normalmente em `/login` com aquela conta e acesse `/admin`.

## Fase 2 (proposta — ainda não implementada)

Você pediu que, uma vez dentro da conta de um lojista/cliente, o admin
consiga **fazer absolutamente tudo** como se fosse aquela conta, mantendo o
próprio login de admin. Isso é bem maior que a fase 1 porque **hoje todo
lugar do sistema resolve "de quem são esses dados" direto de
`auth.uid()`** (todas as páginas de `/lojista/*` e `/cliente/*`, e toda
action em `src/lib/actions.ts`) — não existe um conceito de "dono efetivo"
diferente da sessão logada.

Desenho proposto, pra sua validação antes de eu tocar em código que já está
em produção:

1. **Sessão de impersonação** — um cookie `httpOnly` assinado no servidor
   (não o cookie de sessão do Supabase, que continua sendo o do admin o
   tempo todo) guardando `{ adminId, targetId, targetRole, startedAt }`. Só
   é criado depois de confirmar `getPlatformAdmin()` no momento do "Entrar
   como".
2. **`getEffectiveContext()`** — uma função nova que toda página/action
   passa a chamar em vez de `supabase.auth.getUser()` direto. Ela devolve
   `{ id, role, isImpersonating, actorAdminId }`: se houver cookie de
   impersonação válido E o `auth.uid()` atual bater com o `adminId` gravado
   nele, devolve o `targetId`/`targetRole` do alvo; senão devolve a sessão
   normal. Cada leitura/escrita nas páginas e actions passa a usar esse
   `id` no lugar do `auth.uid()` direto.
3. **Leitura/escrita durante a impersonação usam o client `service_role`**
   (não dá pra usar o client normal porque a sessão real continua sendo a
   do admin — a RLS bloquearia tudo). O `getEffectiveContext()" garante que
   isso só acontece depois de validar admin + cookie.
4. **Log de auditoria obrigatório** — uma tabela `admin_audit_log`
   (quem/admin, em qual conta, qual ação, quando) preenchida em toda
   escrita feita em modo impersonação. Sem isso, "admin pode fazer tudo"
   vira uma caixa preta perigosa.
5. **Banner fixo** durante a impersonação ("Você está agindo como
   [Loja X] — Sair da impersonação"), pra nunca ser possível esquecer que
   está nesse modo.
6. **Escopo do trabalho**: envolve tocar `src/middleware.ts`,
   `LojistaLayout`/`ClienteLayout`, todas as páginas de `/lojista/*` e
   `/cliente/*` que hoje leem `auth.uid()` direto, e toda action de escrita
   em `src/lib/actions.ts` — uma mudança transversal, não um arquivo novo
   isolado como a fase 1.

**Não implementei isso ainda** porque é código que já está funcionando em
produção sendo alterado por uma feature de altíssimo risco (bypass de
isolamento entre contas). Quero seu ok explícito no desenho acima (ou nos
ajustes que quiser) antes de sair mexendo em cada página/action existente.
