// Caminho do painel interno da plataforma. Fica fora de /admin de
// propósito (não é um endereço que alguém chuta) e não aparece em nenhum
// link do site. Quem decide o acesso de verdade é o login + a tabela
// admin_usuario (ver src/lib/admin.ts), não o segredo do endereço.
export const ROTA_INTERNA = '/central-k7x2q9'
