# ClubeOn — Catálogo de festas

Site público de espaços e fornecedores, preparado para `clubeon.rubli.com.br`. Visual responsivo com piscina/churrasqueira no banner, busca por cidade e nome/descrição, filtros de estrutura, detalhes com galeria e contato pelo WhatsApp ou site de reservas.

## Fluxo

1. O proprietário ou fornecedor cadastra gratuitamente seu negócio e até seis fotos de uma vez.
2. No painel master, a seção **Notificações** mostra os novos anúncios e o contador no sino. Os cadastros já estão publicados. Revise descrição, fotos e contato; marque como revisado ou recuse com motivo para retirar do site.
3. O negócio aparece no site imediatamente após o envio. Você pode editar, ocultar ou recusar sem alterar licenças, cobranças, parceiros ou reservas do sistema existente.

Não há anúncios fictícios em produção. Antes dos primeiros cadastros, as seções convidam os negócios a se cadastrar. Os filtros indicam estrutura, não disponibilidade em uma data. A contratação ocorre diretamente com o negócio.

## Deploy no Render

Primeiro publique a atualização do repositório `admespacoon` que adiciona a API e o gerenciamento do catálogo. Depois crie um **Web Service** para este repositório:

- Branch: `main` após o merge da PR.
- Runtime: Node, versão 24.
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Health check: `/api/health`
- Variável `NODE_ENV`: `production`
- Variável `MASTER_API_URL`: endereço HTTPS público **do seu painel master**, sem `/api`, caminho ou senha; por exemplo `https://seu-master.onrender.com`.
- Adicione `clubeon.rubli.com.br` em Custom Domains e configure o CNAME indicado pelo Render no Registro.br.

O frontend usa a API do próprio catálogo, cujo servidor encaminha somente as rotas públicas permitidas ao master. Nenhuma senha, cookie de administração ou chave de licença é enviada ao navegador. Não configure MongoDB neste novo serviço: os cadastros usam uma coleção separada no banco do master e entram no backup existente dele.

`/api/health` indica se a URL foi configurada, não verifica a conexão com o master. Para verificar a integração, abra `/api/catalog/meta` e envie um cadastro de teste; confira a publicação e as fotos imediatamente, depois revise no master e teste a recusa.

## Desenvolvimento

`npm ci --include=dev`; configure `MASTER_API_URL` com o master local (`http://127.0.0.1:10001` em desenvolvimento) ou homologação. Em um terminal rode `PORT=10000 MASTER_API_URL=http://127.0.0.1:10001 npm start`; em outro, `npm run dev`. Não use o ambiente de produção para cadastros de teste.

`npm test` verifica restrição de rotas do gateway, configuração da origem e ausência de propagação de credenciais. `npm run build` compila a aplicação.

## Fotos e dados

Arquivos JPG, PNG e WebP de até 5 MB são convertidos no navegador para JPEG e reduzidos para menos de 100 KB cada. Até seis fotos, armazenadas apenas no master. Nome do responsável e e-mail ficam privados. WhatsApp, cidade, bairro, descrição, estrutura, site e fotos serão públicos imediatamente após o envio e autorização expressa. A equipe pode ocultar um negócio; solicitações de exclusão são atendidas pelo contato da plataforma e a remoção definitiva exige tratamento dos dados no master, inclusive retenção de backups.

## Identidade visual

`public/assets/mark.svg`: símbolo vetorial de localização e ondas; `public/assets/hero.webp`: banner gerado com a habilidade imagegen, ferramenta integrada. Prompt: fotografia panorâmica realista de um espaço de festas brasileiro simples, piscina, varanda com churrasqueira, mesas e cadeiras, vegetação tropical, luz do fim da tarde, sem pessoas, logotipos ou texto. A foto é ilustrativa da plataforma e não anuncia um negócio real.

## Restauração

`restore/before-catalog-2026-10-04` preserva a inicialização do repositório, que estava vazio. No master, `restore/before-public-catalog-2026-10-04` preserva o código anterior. Reverter o código não remove os dados criados no banco.

Novos anúncios são publicados com revisão posterior. O sino e a seção Notificações do master mostram anúncios ainda não revisados; o painel aberto consulta novidades a cada 60 segundos. Não há envio automático por WhatsApp. A edição pelo proprietário ficará para uma próxima etapa.
