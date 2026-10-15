import Link from 'next/link'
import type { Metadata } from 'next'
import DocumentoLegal, { type SecaoLegal } from '@/components/legal/DocumentoLegal'
import { EMPRESA, identificacaoEmpresa } from '@/lib/empresa'

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'As regras de uso do SAIP para petshops, suas equipes e clientes.',
}

const contato = EMPRESA.email
  ? <>pelo e-mail <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a></>
  : <>pelos canais de atendimento informados no site</>

const SECOES: SecaoLegal[] = [
  {
    id: 'aceitacao',
    titulo: 'Aceitação e quem somos',
    conteudo: (
      <>
        <p>
          Estes Termos de Uso regem o acesso e o uso da plataforma SAIP — site, aplicativo e links de agendamento —
          oferecida por {identificacaoEmpresa()}{EMPRESA.endereco ? `, com endereço em ${EMPRESA.endereco}` : ''} (“SAIP”, “nós”).
        </p>
        <p>
          Ao criar uma conta, marcar a caixa de aceite ou usar a plataforma, você declara que leu, entendeu e concorda com estes
          Termos e com a <Link href="/privacidade">Política de Privacidade</Link>, que é parte deles. Se não concordar, não use a plataforma.
        </p>
      </>
    ),
  },
  {
    id: 'definicoes',
    titulo: 'Definições',
    conteudo: (
      <ul>
        <li><strong>Plataforma:</strong> o sistema SAIP de agendamento e gestão para petshops, em qualquer meio de acesso.</li>
        <li><strong>Loja ou Lojista:</strong> o petshop (pessoa física ou jurídica) que se cadastra para receber agendamentos e organizar o seu negócio.</li>
        <li><strong>Equipe:</strong> funcionários e colaboradores que a Loja autoriza a acessar o painel dela, inclusive pelo código de acesso rápido.</li>
        <li><strong>Cliente:</strong> o tutor que usa a plataforma para agendar serviços e comprar produtos para os seus pets.</li>
        <li><strong>Link de agendamento:</strong> a página pública de cada Loja, onde os Clientes marcam horários.</li>
        <li><strong>TaxiDog:</strong> o recurso pelo qual a Loja oferece buscar e levar o pet no endereço do Cliente.</li>
      </ul>
    ),
  },
  {
    id: 'papel-do-saip',
    titulo: 'O que o SAIP faz (e o que não faz)',
    conteudo: (
      <>
        <p>
          O SAIP é uma ferramenta de tecnologia. Ele organiza agendas, cadastros, vendas e a comunicação entre Lojas e Clientes,
          mas <strong>não presta os serviços para os pets</strong> (banho, tosa, consultas, transporte pelo TaxiDog e outros) e
          <strong> não vende os produtos</strong> anunciados pelas Lojas.
        </p>
        <ul>
          <li>Os serviços e produtos são oferecidos e prestados exclusivamente por cada Loja, que define preços, promoções, horários, regras de cancelamento, forma de pagamento e a qualidade do atendimento.</li>
          <li>A relação de consumo do Cliente é com a Loja escolhida. Reclamações sobre o atendimento, o serviço prestado, o pet ou o pagamento devem ser feitas à Loja, sem prejuízo dos direitos previstos no Código de Defesa do Consumidor.</li>
          <li>O SAIP não processa pagamentos entre Clientes e Lojas: os valores e as formas de pagamento mostrados na plataforma servem para organização, e o pagamento é feito diretamente à Loja.</li>
          <li>Preços e prazos exibidos são informados pela Loja e podem mudar até a confirmação do agendamento por ela.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'conta',
    titulo: 'Cadastro e conta',
    conteudo: (
      <>
        <ul>
          <li>O acesso é feito com a conta Google ou, para a Equipe, com o código de acesso gerado pela Loja. Você é responsável por manter a sua conta Google e os códigos em segurança e por tudo o que for feito com eles.</li>
          <li>Para criar uma conta é preciso ter 18 anos ou mais e capacidade para assumir obrigações. Quem cadastra uma Loja declara ter poderes para representá-la.</li>
          <li>Os dados informados (nome, CPF ou CNPJ, telefone, endereço e dados dos pets) devem ser verdadeiros, completos e atualizados. Dados falsos ou de terceiros sem autorização podem levar à suspensão da conta.</li>
          <li>Cada pessoa deve ter uma única conta de Cliente. Cada Loja responde pelas contas da sua Equipe.</li>
          <li>Se notar uso indevido da sua conta, avise-nos imediatamente {contato}.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'lojas',
    titulo: 'Regras para as Lojas',
    conteudo: (
      <>
        <h3>Teste e contratação</h3>
        <p>
          Cada Loja nova tem um período de teste gratuito de 30 dias. Depois dele, o uso do painel depende da contratação de um
          plano, conforme as condições e valores informados pelo SAIP no momento da contratação. Para evitar abusos, o SAIP pode
          impedir novos períodos de teste para o mesmo telefone ou documento.
        </p>
        <h3>Responsabilidades da Loja</h3>
        <ul>
          <li>Manter corretos os dados da Loja, os serviços, os preços, as promoções, os horários e o estoque publicados.</li>
          <li>Cumprir os agendamentos aceitos ou avisar o Cliente com antecedência sobre qualquer mudança.</li>
          <li>Prestar os serviços e vender os produtos de acordo com a lei, incluindo as normas de defesa do consumidor, sanitárias, de bem-estar animal e de trânsito (no caso do TaxiDog).</li>
          <li>Emitir os documentos fiscais e cumprir as obrigações tributárias das suas vendas. O SAIP apenas organiza informações e não substitui o sistema fiscal da Loja.</li>
          <li>Definir quem da Equipe tem acesso e com quais permissões, e retirar o acesso de quem sair da Loja.</li>
          <li>Ter o direito de usar o logotipo, as fotos e os textos que publicar.</li>
        </ul>
        <h3>Dados dos Clientes da Loja</h3>
        <p>
          Em relação aos dados dos Clientes que a Loja atende e gerencia pela plataforma (agendamentos, histórico, pets, vendas,
          planos e endereços do TaxiDog), a Loja é a <strong>controladora</strong> e o SAIP atua como <strong>operador</strong>, nos
          termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018). A Loja se compromete a:
        </p>
        <ul>
          <li>usar esses dados apenas para atender o Cliente e cumprir obrigações legais;</li>
          <li>não usá-los para envio de mensagens em massa, propaganda não solicitada ou qualquer finalidade incompatível;</li>
          <li>não compartilhá-los com terceiros sem base legal; e</li>
          <li>atender os pedidos dos Clientes sobre os seus dados, com o apoio do SAIP quando necessário.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'clientes',
    titulo: 'Regras para os Clientes',
    conteudo: (
      <ul>
        <li>Informar dados corretos sobre você e sobre os seus pets, inclusive espécie, porte, saúde, comportamento e cuidados especiais, que podem ser importantes para a segurança do pet e da Equipe.</li>
        <li>Comparecer no horário agendado ou cancelar com antecedência, seguindo as regras de cada Loja.</li>
        <li>No TaxiDog, informar um endereço correto e estar disponível para a entrega e a retirada do pet.</li>
        <li>Pagar diretamente à Loja pelos serviços e produtos, nas condições combinadas com ela.</li>
      </ul>
    ),
  },
  {
    id: 'avaliacoes',
    titulo: 'Avaliações e conteúdo enviado',
    conteudo: (
      <>
        <p>
          Depois de um atendimento, o Cliente pode avaliar a Loja. As avaliações devem ser honestas, sobre experiências reais, sem
          ofensas, discriminação, dados pessoais de terceiros ou conteúdo ilegal.
        </p>
        <p>
          Ao enviar avaliações, fotos (suas, dos pets, da Loja ou dos produtos) e textos, você declara ter o direito de usá-los e
          autoriza o SAIP, de forma gratuita e enquanto o conteúdo estiver na plataforma, a armazená-los e exibi-los dentro dela
          para a finalidade para a qual foram enviados. O SAIP pode remover conteúdo que viole estes Termos ou a lei.
        </p>
      </>
    ),
  },
  {
    id: 'proibido',
    titulo: 'O que não é permitido',
    conteudo: (
      <ul>
        <li>Usar a plataforma para fins ilegais, fraudulentos ou que violem direitos de terceiros ou o bem-estar animal.</li>
        <li>Criar agendamentos falsos, contas falsas ou se passar por outra pessoa ou Loja.</li>
        <li>Tentar acessar contas, dados ou áreas sem autorização, contornar limites de segurança, testar vulnerabilidades sem autorização ou interferir no funcionamento da plataforma.</li>
        <li>Copiar, coletar dados de forma automatizada (robôs, “scraping”), revender ou fazer engenharia reversa da plataforma.</li>
        <li>Enviar vírus, spam ou qualquer conteúdo ofensivo, discriminatório ou ilegal.</li>
      </ul>
    ),
  },
  {
    id: 'propriedade',
    titulo: 'Propriedade intelectual',
    conteudo: (
      <p>
        A marca SAIP, o software, o layout, as ilustrações e os textos da plataforma pertencem ao SAIP ou a seus licenciantes e são
        protegidos por lei. Estes Termos dão a você apenas uma licença pessoal, limitada, não exclusiva e revogável para usar a
        plataforma conforme aqui previsto. Os dados e o conteúdo que você inserir continuam sendo seus (ou da Loja, no caso dos
        dados de gestão dela).
      </p>
    ),
  },
  {
    id: 'disponibilidade',
    titulo: 'Disponibilidade e mudanças na plataforma',
    conteudo: (
      <p>
        Trabalhamos para manter a plataforma disponível e segura, mas ela pode ficar fora do ar por manutenção, atualizações,
        falhas de terceiros (como provedores de internet, hospedagem e login) ou casos fortuitos e de força maior. Podemos
        melhorar, alterar ou retirar funcionalidades, avisando com antecedência razoável quando a mudança afetar de forma relevante
        o uso pago pelas Lojas.
      </p>
    ),
  },
  {
    id: 'responsabilidade',
    titulo: 'Limitação de responsabilidade',
    conteudo: (
      <>
        <p>Na medida permitida pela lei, o SAIP não responde por:</p>
        <ul>
          <li>a prestação, a qualidade, o preço ou o resultado dos serviços e produtos das Lojas, nem por danos ocorridos durante o atendimento ou o transporte do pet;</li>
          <li>informações incorretas inseridas por Lojas, Equipes ou Clientes;</li>
          <li>indisponibilidades temporárias e perda de oportunidades de negócio decorrentes delas;</li>
          <li>atos de terceiros, como invasões aos dispositivos ou às contas Google dos usuários.</li>
        </ul>
        <p>
          Nada nestes Termos afasta direitos que o Código de Defesa do Consumidor garante ao Cliente, nem a responsabilidade do
          SAIP por falhas comprovadas da própria plataforma. Nas relações com as Lojas, que contratam o SAIP para a sua atividade
          empresarial, a responsabilidade do SAIP fica limitada ao valor pago pela Loja nos 12 meses anteriores ao fato.
        </p>
      </>
    ),
  },
  {
    id: 'suspensao',
    titulo: 'Suspensão, encerramento e suporte',
    conteudo: (
      <>
        <ul>
          <li>Você pode encerrar a sua conta quando quiser, em “Excluir minha conta”. O que acontece com os dados está explicado na <Link href="/privacidade">Política de Privacidade</Link>.</li>
          <li>O SAIP pode suspender ou encerrar contas que violem estes Termos ou a lei, que ofereçam risco a outros usuários ou à plataforma, ou de Lojas sem plano ativo depois do período de teste, avisando o titular sempre que possível.</li>
          <li>Para prestar suporte, a equipe autorizada do SAIP pode acessar o painel de uma Loja. Esse acesso é restrito, usado apenas para atendimento, segurança ou cumprimento da lei, e fica registrado.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'alteracoes',
    titulo: 'Alterações destes Termos',
    conteudo: (
      <p>
        Podemos atualizar estes Termos para refletir mudanças na plataforma ou na lei. A data da versão em vigor aparece no topo
        desta página. Mudanças relevantes serão avisadas com antecedência pela plataforma ou por e-mail. Continuar usando a
        plataforma depois da vigência significa concordar com a nova versão. Se não concordar, você pode encerrar a sua conta.
      </p>
    ),
  },
  {
    id: 'lei-e-foro',
    titulo: 'Lei aplicável e foro',
    conteudo: (
      <p>
        Estes Termos são regidos pelas leis do Brasil, incluindo o Marco Civil da Internet (Lei nº 12.965/2014), a Lei Geral de
        Proteção de Dados (Lei nº 13.709/2018) e o Código de Defesa do Consumidor (Lei nº 8.078/1990). Para os Clientes, fica
        eleito o foro do seu domicílio. Para as Lojas, fica eleito o foro da comarca de {EMPRESA.foro || 'sede do SAIP'}, salvo
        disposição legal em contrário.
      </p>
    ),
  },
  {
    id: 'contato',
    titulo: 'Contato',
    conteudo: (
      <p>
        Dúvidas sobre estes Termos podem ser enviadas {contato}. Pedidos sobre dados pessoais seguem o que está na{' '}
        <Link href="/privacidade">Política de Privacidade</Link>.
      </p>
    ),
  },
]

export default function TermosPage() {
  return (
    <DocumentoLegal
      titulo="Termos de Uso"
      resumo={
        <p>
          Em poucas palavras: o SAIP é a ferramenta que liga petshops e tutores. Quem presta o serviço e vende os produtos é a
          Loja; o SAIP cuida da tecnologia, da segurança e dos seus dados. Abaixo estão as regras completas.
        </p>
      }
      secoes={SECOES}
      outro={{ href: '/privacidade', rotulo: 'Política de Privacidade' }}
    />
  )
}
