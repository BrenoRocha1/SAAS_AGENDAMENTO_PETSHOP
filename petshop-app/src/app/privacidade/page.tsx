import Link from 'next/link'
import type { Metadata } from 'next'
import DocumentoLegal, { type SecaoLegal } from '@/components/legal/DocumentoLegal'
import { EMPRESA, identificacaoEmpresa } from '@/lib/empresa'

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Como o SAIP coleta, usa, compartilha e protege os dados pessoais de petshops, equipes e clientes (LGPD).',
}

const contato = EMPRESA.email
  ? <>pelo e-mail <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a></>
  : <>pelos canais de atendimento informados no site</>

// O que é coletado, por tipo de pessoa (seção 2).
const DADOS: [string, string][] = [
  ['Todos', 'Nome e e-mail da conta Google usada para entrar e o identificador dessa conta. Não recebemos a sua senha do Google.'],
  ['Clientes', 'CPF, telefone/WhatsApp, foto de perfil (opcional); dados dos pets — nome, espécie, raça, sexo, porte, data de nascimento, peso, foto, pelagem, comportamento e observações; endereços informados para o TaxiDog e a localização aproximada calculada a partir deles; agendamentos, compras, planos e avaliações.'],
  ['Lojas', 'Nome da loja, CPF ou CNPJ do responsável, telefone, e-mail, endereço e a localização calculada a partir dele, logotipo, descrição, horários, serviços, preços, produtos (inclusive dados fiscais), vendas, formas de pagamento aceitas e configurações do TaxiDog.'],
  ['Equipe', 'Nome, função, permissões e os códigos de acesso rápido gerados pela Loja.'],
  ['Uso da plataforma', 'Registros de acesso exigidos por lei (data, hora e endereço IP), registros das alterações feitas em agendamentos e outras ações sensíveis, e informações técnicas do navegador ou aparelho necessárias para o funcionamento e a segurança.'],
]

// Para que e com que base legal (seção 3).
const FINALIDADES: [string, string][] = [
  ['Criar e manter a sua conta e permitir o login', 'Execução de contrato (art. 7º, V)'],
  ['Agendar serviços, organizar a agenda, vendas, planos e o TaxiDog entre Clientes e Lojas', 'Execução de contrato (art. 7º, V)'],
  ['Mostrar à Loja os dados do Cliente e do pet necessários para o atendimento', 'Execução de contrato (art. 7º, V)'],
  ['Calcular a distância e a taxa do TaxiDog a partir dos endereços', 'Execução de contrato (art. 7º, V)'],
  ['Exibir fotos de perfil e de pets enviadas por você', 'Execução de contrato (art. 7º, V) — o envio é opcional'],
  ['Guardar registros de acesso e de transações', 'Obrigação legal (art. 7º, II) — Marco Civil da Internet e legislação fiscal'],
  ['Prevenir fraudes, abusos do período de teste e acessos indevidos; manter registros de auditoria', 'Legítimo interesse (art. 7º, IX) e exercício regular de direitos (art. 7º, VI)'],
  ['Prestar suporte, responder pedidos e melhorar a plataforma', 'Legítimo interesse (art. 7º, IX)'],
  ['Cumprir ordens judiciais e pedidos de autoridades', 'Obrigação legal (art. 7º, II) e exercício regular de direitos (art. 7º, VI)'],
]

const SECOES: SecaoLegal[] = [
  {
    id: 'quem-somos',
    titulo: 'Quem cuida dos seus dados',
    conteudo: (
      <>
        <p>
          Esta Política explica como {identificacaoEmpresa()} (“SAIP”, “nós”) trata dados pessoais no site, no aplicativo e nos
          links de agendamento, conforme a Lei Geral de Proteção de Dados — LGPD (Lei nº 13.709/2018) e o Marco Civil da Internet
          (Lei nº 12.965/2014).
        </p>
        <ul>
          <li><strong>O SAIP é o controlador</strong> dos dados das contas (Clientes, Lojas e Equipes) e dos dados de uso da plataforma.</li>
          <li><strong>Cada Loja é controladora</strong> dos dados que gerencia sobre os próprios Clientes (agendamentos, histórico de atendimento, pets, vendas, planos e corridas do TaxiDog). Para esses dados, o SAIP atua como <strong>operador</strong>, seguindo as instruções da Loja e esta Política.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'dados',
    titulo: 'Quais dados coletamos',
    conteudo: (
      <>
        <p>Coletamos apenas o necessário para a plataforma funcionar. Os dados vêm de você, da Loja onde você é atendido ou do login com o Google:</p>
        <table className="dl-tabela">
          <thead><tr><th>De quem</th><th>Dados</th></tr></thead>
          <tbody>{DADOS.map(([quem, o]) => <tr key={quem}><td>{quem}</td><td>{o}</td></tr>)}</tbody>
        </table>
        <p>
          Não pedimos dados sensíveis (como origem racial, religião, saúde ou biometria das pessoas). Pedimos que você não os
          escreva nos campos de observação. Informações sobre a saúde e o comportamento dos pets não são dados pessoais, mas são
          tratadas com o mesmo cuidado.
        </p>
      </>
    ),
  },
  {
    id: 'finalidades',
    titulo: 'Para que usamos e com que base legal',
    conteudo: (
      <>
        <table className="dl-tabela">
          <thead><tr><th>Finalidade</th><th>Base legal (LGPD)</th></tr></thead>
          <tbody>{FINALIDADES.map(([f, b]) => <tr key={f}><td>{f}</td><td>{b}</td></tr>)}</tbody>
        </table>
        <p>
          Não vendemos dados pessoais, não os usamos para publicidade de terceiros e não tomamos decisões automatizadas que afetem
          os seus interesses. Não usamos cookies de publicidade nem de rastreamento.
        </p>
      </>
    ),
  },
  {
    id: 'compartilhamento',
    titulo: 'Com quem compartilhamos',
    conteudo: (
      <>
        <ul>
          <li><strong>Com a Loja onde você agenda ou compra:</strong> ela vê o seu nome, telefone, CPF, e-mail, os dados dos pets, os agendamentos e compras feitos com ela e os endereços do TaxiDog. Cada Loja vê apenas os Clientes que atende.</li>
          <li><strong>Com o público:</strong> o nome, o endereço, os serviços, os preços e as avaliações de cada Loja aparecem no link de agendamento dela. Nas avaliações, o Cliente aparece pelo primeiro nome.</li>
          <li>
            <strong>Com fornecedores que operam a plataforma para nós</strong>, sob contrato e apenas para essa finalidade:
            Supabase (banco de dados, login e armazenamento de arquivos), Vercel (hospedagem do site), Google (login com a conta
            Google), ViaCEP (consulta do endereço a partir do CEP — recebe apenas o CEP) e OpenStreetMap/Nominatim (localização
            de endereços para o cálculo de distância do TaxiDog — recebe apenas o endereço).
          </li>
          <li><strong>WhatsApp:</strong> os botões de WhatsApp apenas abrem o aplicativo com uma mensagem pronta; quem envia é você, e a conversa segue as regras do WhatsApp.</li>
          <li><strong>Autoridades:</strong> quando exigido por lei, ordem judicial ou para defender direitos do SAIP, de usuários ou de terceiros.</li>
          <li><strong>Operações societárias:</strong> em caso de fusão, aquisição ou venda do negócio, os dados podem ser transferidos ao sucessor, que continuará obrigado por esta Política.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'transferencia',
    titulo: 'Transferência internacional',
    conteudo: (
      <p>
        Alguns fornecedores listados acima mantêm servidores fora do Brasil. Nesses casos, a transferência é feita para a
        execução do contrato com você (art. 33, IX, da LGPD) e com fornecedores que adotam garantias de segurança e
        confidencialidade compatíveis com a LGPD.
      </p>
    ),
  },
  {
    id: 'retencao',
    titulo: 'Por quanto tempo guardamos',
    conteudo: (
      <>
        <ul>
          <li><strong>Dados da conta e dos pets:</strong> enquanto a conta existir.</li>
          <li><strong>Registros de acesso:</strong> por 6 meses, como exige o Marco Civil da Internet (art. 15), ou por mais tempo se houver ordem judicial.</li>
          <li><strong>Agendamentos, vendas, pagamentos e cobranças de planos:</strong> pelo prazo das obrigações fiscais e contábeis da Loja e para a defesa em processos (em geral, até 5 anos), sem os dados que identificam a pessoa depois da exclusão da conta.</li>
          <li><strong>Prevenção de fraude no teste gratuito:</strong> guardamos apenas um código irreversível (“hash”) do telefone e do documento das Lojas, pelo tempo necessário para impedir testes repetidos.</li>
          <li><strong>Registros de auditoria:</strong> não podem ser alterados e são mantidos para segurança e defesa de direitos, pelos prazos legais.</li>
        </ul>
        <h3>O que acontece quando o Cliente exclui a conta</h3>
        <p>Em “Excluir minha conta”, no perfil, o Cliente encerra a conta na hora. Então:</p>
        <ul>
          <li>são apagados o cadastro (nome, CPF, e-mail e telefone), a foto, os pets e as fotos deles, as avaliações escritas e o vínculo com as Lojas;</li>
          <li>as observações dos agendamentos e os endereços das corridas do TaxiDog ficam em branco;</li>
          <li>os agendamentos ainda marcados são cancelados; e</li>
          <li>os registros de atendimentos, valores, pagamentos e produtos vendidos continuam com a Loja, <strong>sem ligação com a pessoa</strong>, para as obrigações fiscais e contábeis dela.</li>
        </ul>
        <p>Lojas e membros da Equipe podem pedir a exclusão {contato}; a Equipe também pode ser removida pela própria Loja.</p>
      </>
    ),
  },
  {
    id: 'direitos',
    titulo: 'Seus direitos',
    conteudo: (
      <>
        <p>Pela LGPD (art. 18), você pode, a qualquer momento e sem custo:</p>
        <ul>
          <li>confirmar se tratamos os seus dados e acessá-los;</li>
          <li>corrigir dados incompletos, inexatos ou desatualizados (muitos podem ser editados direto no seu perfil);</li>
          <li>pedir a anonimização, o bloqueio ou a eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei;</li>
          <li>pedir a portabilidade dos seus dados a outro fornecedor;</li>
          <li>pedir a eliminação dos dados, ressalvadas as hipóteses de guarda obrigatória previstas em lei;</li>
          <li>saber com quem compartilhamos os seus dados;</li>
          <li>revogar consentimentos e se opor a tratamentos feitos com base no legítimo interesse; e</li>
          <li>reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</li>
        </ul>
        <p>
          Para exercer esses direitos, fale com a gente {contato}. Podemos pedir informações para confirmar a sua identidade e
          responderemos em até 15 dias. Pedidos sobre dados que uma Loja gerencia (por exemplo, o histórico de atendimentos)
          serão encaminhados a ela, que é a controladora desses dados, e acompanhados por nós.
        </p>
      </>
    ),
  },
  {
    id: 'seguranca',
    titulo: 'Como protegemos os dados',
    conteudo: (
      <>
        <ul>
          <li>Conexão sempre criptografada (HTTPS) entre o seu aparelho e a plataforma.</li>
          <li>Login sem senha própria (conta Google ou código de acesso temporário da Equipe).</li>
          <li>Regras de acesso no banco de dados: cada pessoa vê apenas o que é dela, e cada Loja apenas os próprios Clientes.</li>
          <li>Permissões por função dentro da Equipe de cada Loja.</li>
          <li>Acesso da equipe do SAIP restrito a pessoas autorizadas, apenas para suporte, segurança ou cumprimento da lei, com registro de cada ação.</li>
        </ul>
        <p>
          Nenhum sistema é 100% seguro. Se ocorrer um incidente de segurança que possa causar risco ou dano relevante, avisaremos
          os titulares afetados e a ANPD, como determina o art. 48 da LGPD.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    titulo: 'Cookies e armazenamento no aparelho',
    conteudo: (
      <p>
        Usamos apenas cookies e armazenamento local essenciais: para manter você conectado, lembrar o link de agendamento de onde
        você veio durante o login e guardar preferências da tela. Sem eles a plataforma não funciona, por isso não há opção de
        desativá-los. Não usamos cookies de publicidade, de redes sociais ou de análise de terceiros.
      </p>
    ),
  },
  {
    id: 'menores',
    titulo: 'Crianças e adolescentes',
    conteudo: (
      <p>
        A plataforma é destinada a maiores de 18 anos. Não coletamos intencionalmente dados de crianças e adolescentes. Se
        perceber que isso aconteceu, fale com a gente para que os dados sejam apagados.
      </p>
    ),
  },
  {
    id: 'encarregado',
    titulo: 'Encarregado de dados (DPO) e contato',
    conteudo: (
      <p>
        {EMPRESA.encarregado ? <>O encarregado pelo tratamento de dados pessoais do SAIP é {EMPRESA.encarregado}. </> : null}
        Dúvidas, pedidos e reclamações sobre privacidade podem ser enviados {contato}
        {EMPRESA.endereco ? <>, ou por correspondência para {EMPRESA.endereco}</> : null}.
      </p>
    ),
  },
  {
    id: 'alteracoes',
    titulo: 'Alterações desta Política',
    conteudo: (
      <p>
        Podemos atualizar esta Política quando a plataforma ou a lei mudarem. A data da versão em vigor aparece no topo da página.
        Mudanças relevantes serão avisadas com antecedência pela plataforma ou por e-mail. Esta Política complementa os{' '}
        <Link href="/termos">Termos de Uso</Link>.
      </p>
    ),
  },
]

export default function PrivacidadePage() {
  return (
    <DocumentoLegal
      titulo="Política de Privacidade"
      resumo={
        <p>
          Em poucas palavras: usamos os seus dados só para fazer o agendamento acontecer entre você e o petshop, não vendemos nada
          para ninguém e você pode ver, corrigir ou apagar os seus dados quando quiser. Abaixo está tudo em detalhe.
        </p>
      }
      secoes={SECOES}
      outro={{ href: '/termos', rotulo: 'Termos de Uso' }}
    />
  )
}
