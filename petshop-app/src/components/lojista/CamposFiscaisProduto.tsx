'use client'

import { ORIGENS_MERCADORIA, type ProdutoFiscal } from '@/lib/fiscal'

// Seção "Informações fiscais" do formulário de produto (migration 094).
// Os campos vão no mesmo FormData do produto (prefixo fiscal_). Fechada por
// padrão: abre sozinha quando o produto já tem algo preenchido.
export default function CamposFiscaisProduto({ inicial }: { inicial: ProdutoFiscal | null | undefined }) {
  const temAlgo = !!inicial && Object.values(inicial).some(v => v !== null && v !== '')
  return (
    <details className="fiscal-produto" open={temAlgo}>
      <summary>
        <span className="font-semibold" style={{ color: 'var(--gray-100)', fontSize: '0.9375rem' }}>Informações fiscais</span>
        <span className="text-xs text-muted">NCM, CEST, CFOP, origem e código de barras — para a emissão de nota no futuro</span>
      </summary>
      <input type="hidden" name="fiscal_presente" value="1" />
      <div className="fiscal-produto-campos">
        <div className="form-group">
          <label htmlFor="fiscal_codigo_barras" className="form-label">Código de barras (GTIN/EAN)</label>
          <input id="fiscal_codigo_barras" name="fiscal_codigo_barras" className="form-input" inputMode="numeric" autoComplete="off"
            placeholder="Ex.: 7891234567895" maxLength={14} defaultValue={inicial?.codigo_barras ?? ''} />
          <p className="text-xs text-muted" style={{ margin: 0 }}>Com ele, o Caixa acha o produto pelo leitor de código de barras.</p>
        </div>
        <div className="form-group">
          <label htmlFor="fiscal_ncm" className="form-label">NCM</label>
          <input id="fiscal_ncm" name="fiscal_ncm" className="form-input" inputMode="numeric" autoComplete="off"
            placeholder="Ex.: 2309.10.00" maxLength={10} defaultValue={inicial?.ncm ?? ''} />
        </div>
        <div className="form-group">
          <label htmlFor="fiscal_cest" className="form-label">CEST <span className="text-muted" style={{ fontWeight: 400 }}>(se houver)</span></label>
          <input id="fiscal_cest" name="fiscal_cest" className="form-input" inputMode="numeric" autoComplete="off"
            placeholder="7 dígitos" maxLength={9} defaultValue={inicial?.cest ?? ''} />
        </div>
        <div className="form-group">
          <label htmlFor="fiscal_cfop" className="form-label">CFOP</label>
          <input id="fiscal_cfop" name="fiscal_cfop" className="form-input" inputMode="numeric" autoComplete="off"
            placeholder="Ex.: 5102" maxLength={5} defaultValue={inicial?.cfop ?? ''} />
        </div>
        <div className="form-group">
          <label htmlFor="fiscal_cst_csosn" className="form-label">CST / CSOSN</label>
          <input id="fiscal_cst_csosn" name="fiscal_cst_csosn" className="form-input" inputMode="numeric" autoComplete="off"
            placeholder="Ex.: 102" maxLength={3} defaultValue={inicial?.cst_csosn ?? ''} />
        </div>
        <div className="form-group">
          <label htmlFor="fiscal_origem" className="form-label">Origem da mercadoria</label>
          <select id="fiscal_origem" name="fiscal_origem" className="form-select" defaultValue={inicial?.origem != null ? String(inicial.origem) : ''}>
            <option value="">Não informada</option>
            {ORIGENS_MERCADORIA.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted" style={{ margin: 0 }}>Na dúvida, confirme os códigos com o seu contador. Tudo é opcional.</p>
    </details>
  )
}
