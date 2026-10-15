// Cookies do "entrar na conta de uma loja" pelo painel interno. Não é um
// arquivo 'use server'.

// Só o nome da loja vista — liga a faixa "Você está dentro da conta de…".
export const COOKIE_IMPERSONANDO = 'saip-interno-vendo'
// A volta para o painel: a sessão do administrador (o token de renovação,
// httpOnly) e a loja de onde ele saiu. "Voltar ao painel" restaura essa
// sessão sem precisar entrar com o Google de novo.
export const COOKIE_VOLTA_INTERNO = 'saip-interno-volta'
// Cookie que marca "veio do login do painel interno" na ida pro Google.
export const COOKIE_LOGIN_INTERNO = 'saip-interno-login'
