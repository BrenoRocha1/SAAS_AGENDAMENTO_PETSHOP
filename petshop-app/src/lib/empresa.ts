// Quem responde pelo SAIP: aparece nos Termos de Uso e na Política de
// Privacidade (/termos e /privacidade). Campo vazio não aparece no texto.
export const EMPRESA = {
  marca: 'SAIP',
  // Razão social e CNPJ (ou nome e CPF, se ainda não houver empresa).
  razaoSocial: '',
  documento: '',
  // Endereço para correspondência.
  endereco: '',
  // Canal de contato e do encarregado de dados (LGPD, art. 41).
  email: '',
  encarregado: '',
  // Cidade/UF do foro para as relações com as lojas (empresas).
  foro: '',
  // Data da versão em vigor dos dois documentos.
  atualizadoEm: '15 de outubro de 2026',
}

// "SAIP (Razão Social, CNPJ 00.000.000/0001-00)" — o que existir.
export function identificacaoEmpresa(): string {
  const partes = [EMPRESA.razaoSocial, EMPRESA.documento && `inscrita sob o nº ${EMPRESA.documento}`].filter(Boolean)
  return partes.length ? `${EMPRESA.marca} (${partes.join(', ')})` : EMPRESA.marca
}
