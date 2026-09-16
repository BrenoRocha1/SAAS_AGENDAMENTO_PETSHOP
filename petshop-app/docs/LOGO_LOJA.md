# Upload de Imagem da Loja — `/lojista/perfil`

## 0. Levantamento antes de implementar

| Item | Já existia? | Onde |
|---|---|---|
| Campo pra guardar a referência da imagem | ✅ Sim | `lojista.logo_url` (TEXT, nullable, desde a migration 001) — nunca tinha sido usado |
| Supabase Storage configurado | ❌ Não | Primeira vez que o projeto usa Storage |
| Tela de Perfil da Loja | ✅ Sim | `/lojista/perfil` (`PerfilLojistaForm.tsx`) |
| Modal de confirmação (sem `confirm()` nativo) | ✅ Sim, padrão já estabelecido | `ServicosList.tsx` (exclusão de serviço) — reaproveitado aqui pra "Remover imagem" |

Nenhuma tabela nova, nenhuma coluna nova. A única infraestrutura
genuinamente nova é o bucket de Storage (não existia nenhum antes).

## 1. Armazenamento

- **Bucket**: `logos-loja`, criado na migration 021. Público pra
  **leitura** (é assim que a imagem chega até o navegador via URL direta,
  e é exatamente o que o futuro Agendamento Online vai precisar — uma
  tela pública). Escrita (upload/troca/remoção) exige autenticação e é
  restrita à própria pasta do lojista via RLS em `storage.objects`.
- **Limite de tamanho e tipos aceitos**: configurados no próprio bucket
  (5 MB, `image/jpeg`/`image/png`/`image/webp`) — o Storage recusa no
  nível de API antes mesmo de gravar qualquer coisa.
- **Caminho do arquivo**: `{id_lojista}/logo.{ext}` — uma pasta por
  lojista. Antes de cada novo upload, o código apaga tudo que já existe
  nessa pasta (`limparPastaDoLojista`, em `actions.ts`) e só então sobe o
  novo arquivo — isso evita ficar com arquivo órfão mesmo quando a
  extensão muda entre um upload e o próximo (ex.: era `.png`, virou
  `.webp`), sem precisar fixar um formato único pra sempre.
- **Banco**: `lojista.logo_url` guarda só a URL pública final (com um
  `?v=timestamp` de cache-busting) — nunca o binário, nunca base64.

## 2. Otimização (sem biblioteca nenhuma)

`src/lib/imagem.ts` usa **Canvas API nativa do navegador** — nenhuma
dependência nova instalada:

1. Redimensiona a imagem pra no máximo 800px no maior lado (nunca
   aumenta uma imagem já pequena) — isso sozinho já resolve a maior
   parte do problema, já que uma foto de celular pode vir com
   4000×3000px.
2. Tenta exportar como WEBP (qualidade 0.85) — bem mais leve, mantém
   transparência.
3. Se o navegador não souber exportar WEBP, cai pra PNG (sem perda,
   ainda assim muito menor que o original por causa do redimensionamento).

Isso roda **antes** do upload, no clique de "Salvar imagem" o arquivo
que sobe já é o otimizado — o servidor nunca recebe a foto original.

## 3. Segurança (defesa em profundidade)

1. **Frontend**: valida `file.type` na hora de escolher o arquivo (feedback rápido).
2. **Server Action** (`atualizarLogoLojistaAction`): confere `role='lojista'`, tamanho (≤5MB) e — o mais importante — **os primeiros bytes do arquivo** (`detectarExtensaoImagem`), não o nome nem o Content-Type declarado (os dois são fáceis de forjar; o conteúdo real do arquivo, não). Um arquivo que não bate com a assinatura de JPEG/PNG/WEBP é recusado, mesmo que a extensão/tipo declarados digam o contrário.
3. **RLS em `storage.objects`** (migration 021): `(storage.foldername(name))[1] = auth.uid()::text` — um lojista fisicamente não consegue gravar/apagar fora da própria pasta, mesmo que tente forjar o caminho na chamada.
4. **RLS em `lojista`** (já existente): `.update()` do `logo_url` já passa pela mesma policy de sempre (`lojista: update proprio`).

## 4. Arquivos

**Criados:**
- `supabase/migrations/021_logo_loja_storage.sql`
- `src/lib/imagem.ts`
- `src/components/lojista/LogoLojaUpload.tsx`
- `docs/LOGO_LOJA.md`

**Modificados:**
- `src/lib/actions.ts` — `atualizarLogoLojistaAction`, `removerLogoLojistaAction`.
- `src/app/lojista/perfil/page.tsx` — renderiza `<LogoLojaUpload>` acima do formulário existente.
- `src/components/icons/index.tsx` — `IconImage` (placeholder de "sem imagem").

## 5. Fluxo de uso

1. Selecionar arquivo → validação de tipo → otimização no navegador → **preview imediato**.
2. Usuário confirma clicando em **"Salvar imagem"** (upload é independente do botão "Salvar alterações" do formulário de texto — mesmo padrão já usado pelos toggles de Kanban/Agendamento Online: uma ação, uma confirmação, sem misturar com o submit do form principal).
3. Sucesso → preview vira a imagem real (URL do Storage) e mensagem de confirmação. Erro → mensagem específica, preview permanece pra tentar de novo.
4. "Remover imagem" → modal de confirmação (mesmo componente visual já usado na exclusão de serviços, não é `confirm()` do navegador) → apaga do Storage e limpa `logo_url`.
5. Recarregar a página → imagem persiste (vem de `lojista.logo_url`, lido no Server Component).

## 6. Multi-tenant e permissões

- Toda operação usa `.eq('id_lojista', user.id)` além da RLS.
- Upload/troca/remoção só funcionam pra `role='lojista'` autenticado — validado na Server Action, não só escondendo botão no frontend.
- RLS de Storage garante isolamento por pasta mesmo que alguém tente manipular a chamada diretamente.

## 7. Pronto para o futuro (Agendamento Online)

Conforme pedido, **nada do Agendamento Online foi implementado agora**.
O que já fica pronto pra quando isso for construído:

- `lojista.logo_url` já é a URL pública, direta, sem autenticação — o
  fluxo público só precisa fazer `SELECT logo_url FROM lojista WHERE
  id_lojista = ...` e usar num `<img>`, sem nenhuma lógica nova de
  Storage, sem re-upload, sem duplicar a imagem.
- O bucket já é público pra leitura — nenhuma mudança de política será
  necessária pra exibir a imagem numa tela sem login.

## 8. Testes realizados

`tsc --noEmit`, `eslint` e `next build` completos, sem erros. Fluxo
manual a testar depois de rodar a migration 021: abrir Perfil da Loja →
adicionar imagem JPG/PNG/WEBP → conferir preview → salvar → recarregar
(deve persistir) → trocar por outra imagem → remover → confirmar
remoção → testar arquivo de formato inválido (ex. `.pdf` renomeado pra
`.jpg` — deve ser recusado pela checagem de bytes) → testar arquivo
acima de 5MB.

## 9. Limitações conhecidas

- A otimização via Canvas depende do navegador suportar
  `createImageBitmap`/`canvas.toBlob` — universal em qualquer Chrome/
  Edge/Firefox/Safari moderno, o que cobre o ambiente real de uso
  (computador de recepção). Não há fallback de otimização no servidor
  (nem precisa: a validação de segurança do servidor independe de a
  imagem ter sido otimizada ou não).
