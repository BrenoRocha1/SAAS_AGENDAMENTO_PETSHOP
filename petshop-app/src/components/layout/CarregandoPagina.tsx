// Esqueleto mostrado NA HORA ao trocar de página (loading.tsx do painel):
// a sidebar fica, e o conteúdo vira este esboço enquanto o servidor busca
// os dados — sem isso, o clique parecia não fazer nada até tudo carregar.
export default function CarregandoPagina() {
  return (
    <div className="carregando-pagina" role="status" aria-live="polite" aria-label="Carregando">
      <div className="esqueleto esqueleto-titulo" />
      <div className="esqueleto esqueleto-subtitulo" />
      <div className="carregando-pagina-cards">
        <div className="esqueleto esqueleto-card" />
        <div className="esqueleto esqueleto-card" />
        <div className="esqueleto esqueleto-card" />
      </div>
      <div className="esqueleto esqueleto-bloco" />
    </div>
  )
}
