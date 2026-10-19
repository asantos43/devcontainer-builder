# Instalação e uso

[English](../en/guide.md) · [Arquitetura](architecture.md) · [Validação](validation.md)

## Pré-requisitos

Use Node.js 22.16+ e npm para desenvolver. Instale Docker Engine no Linux ou Docker Desktop com containers Linux no Windows/macOS. Git e GitHub CLI são necessários para operações de repositório. Autentique com `gh auth login` ou pelo botão do aplicativo. Preserve seu credential helper Git ou configuração SSH para clones privados.

Execute `npm ci` e `npm run dev`. A CLI de Dev Containers acompanha o aplicativo. Monaco e seus workers são carregados localmente.

## Criar um projeto

Escolha **Novo dev container**. Selecione uma pasta local existente; para clonar, ela precisa estar vazia. Escolha modelo, estratégia de repositório, imagem/Dockerfile, Features, workspace, montagens, ambiente e comando pós-criação opcional. Novos repositórios GitHub são privados por padrão.

A revisão informa as ações que serão executadas. Criar não constrói a imagem. Clones que já contêm um Dev Container abrem a configuração existente. Se a criação remota funcionar e uma etapa posterior falhar, o remoto permanece: confira o GitHub e a pasta local antes de tentar novamente.

O código fica no host, montado no container. Inicializar Git não faz commit nem push. Na aba Repositório, revise os arquivos antes do commit; push é uma ação explícita separada. Configure o autor Git localmente quando necessário. Merge e resolução visual de conflitos ficam fora desta versão.

## Editar projetos existentes

Abra a pasta do workspace ou o arquivo JSON de configuração. Se houver várias configurações, escolha uma. As abas oferecem edição estruturada; Código permite propriedades arbitrárias. Comentários JSONC e campos desconhecidos são preservados.

No Dockerfile, escolha **Comentário** para adicionar blocos independentes, comentários de várias linhas ou instruções desativadas. Selecione um bloco para editar. A opção de mover comentários associa explicitamente os comentários imediatamente anteriores à instrução durante a movimentação. Ao remover uma instrução, escolha preservar os comentários ou removê-los juntos. Diretivas permanecem fixas e são editadas em código.

Heredocs e sintaxe desconhecida permanecem editáveis em código. A edição visual é desabilitada quando não há representação segura. Abrir/salvar sem alterações mantém os bytes do Dockerfile; editar um bloco preserva o restante. Revise as diferenças antes de salvar. Alterações externas exigem recarregamento.

## Workspace, pastas e volumes

O workspace usa `${localWorkspaceFolder}` e o destino interno configurado. Adicione pastas do host ou volumes nomeados com destino e modo de acesso. Criar volume é uma ação explícita. Remover montagem não apaga dados. Caminhos com vírgulas não são suportados na representação de mounts em string. Pastas externas exigem remapeamento ao transferir o projeto.

Destinos de mounts e caminhos do workspace podem começar com variáveis do Dev Containers, por exemplo `target=${localWorkspaceFolder}`. Volumes nomeados também podem usar variáveis como `${devcontainerId}`. As referências são preservadas na configuração salva; a CLI oficial expande as variáveis e valida os valores efetivos ao iniciar ou testar. Consulte a [referência de variáveis do Dev Containers](https://github.com/devcontainers/spec/blob/main/docs/specs/devcontainerjson-reference.md#variables-in-devcontainerjson).

`forwardPorts` informa encaminhamentos para IDEs compatíveis; o aplicativo não implementa túneis de IDE. Publique portas em `runArgs`, por exemplo `["-p", "127.0.0.1:3000:3000"]`. A inspeção Docker mostra os bindings reais.

## Executar, inspecionar e testar

Salve e escolha Iniciar ou Testar. Revise comandos do host, Features e montagens. A CLI oficial aplica Features e hooks. Docker do host usa a Feature oficial Docker outside of Docker e permite controlar o daemon do host.

Iniciar fica disponível quando o container gerenciado está ausente, criado ou parado; Parar fica disponível quando está em execução, pausado ou reiniciando. Ambos ficam desabilitados durante operações de execução e enquanto o status do motor é desconhecido ou indisponível. O status é atualizado ao abrir o projeto, trocar a conexão do motor, voltar para a janela e a cada três segundos, incluindo mudanças feitas pelo Docker/Podman fora do aplicativo.

O terminal usa usuário/workspace efetivos, tenta o shell configurado e depois `/bin/sh`. Logs incluem build, Git e saída do container. Os buffers são limitados; copie ou exporte a saída quando necessário.

Verificações personalizadas executam sequencialmente após inicialização/inspeção, com nome, comando, diretório, timeout e código esperado. A primeira falha interrompe a sequência. Exporte relatório JSON na aba Testes. Cancelar encerra o coordenador; verifique recursos remanescentes. O encerramento de grupos de processos é uma tentativa quando a imagem não possui `setsid`.

Parar preserva o container. Remover exige confirmação e mantém volumes nomeados e imagens. Containers de outros projetos não são removidos.

## Exportar ZIP

Salve, analise o projeto e selecione a configuração e os arquivos necessários. Metadados Git, credenciais reconhecidas, dependências instaladas e artefatos são excluídos. Revise dependências e mounts locais. O ZIP inclui manifesto e instruções; dependências pendentes impedem afirmar portabilidade completa. Dados de volumes Docker não são incluídos.

## Builds locais e automação macOS

Linux: `npm run package:linux`. Windows: `npm run package:win` em Windows. macOS: `npm run package:mac` em macOS. Os artefatos ficam em `release/`. Use `npm run verify:package -- /caminho/do/executavel`; no macOS o script encontra o `.app` automaticamente.

GitHub Actions executa somente macOS, com Intel e Apple Silicon em PRs/main/execução manual, sem publicar releases. Configure `CSC_LINK` e `CSC_KEY_PASSWORD` para assinatura e `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` para notarização. Artefatos sem assinatura são builds de desenvolvimento.

## Solução de problemas

Abra Configurações → Verificar ferramentas e motor. Endpoint vazio usa `DOCKER_HOST` ou o contexto Docker atual. Há suporte a sockets Unix/rootless e named pipes Windows; também há suporte a endpoints TCP/TLS e encaminhamento por SSH. No Linux, configure acesso normal do usuário ao socket; o aplicativo não muda permissões. No Windows, use containers Linux no Docker Desktop e caminhos acessíveis pelo host. No macOS, use o contexto ativo do Docker Desktop.

Em falhas ou limites do Docker Hub, informe a imagem manualmente. Referências de outros registries são aceitas; a pesquisa de tags é restrita ao Docker Hub. Compose tem uma aba própria de edição. Consulte TODO para evoluções.

## Temas

Em **Configurações → Tema visual**, escolha a paleta e salve. A preferência persiste e é aplicada ao aplicativo, editores Monaco e terminais ativos sem desconectar o shell. Há Dark/Light Modern, Dark+/Light+, alto contraste, Monokai, Solarized, Abyss, Quiet Light, Kimbie Dark e Red. São adaptações das paletas; instalar extensões arbitrárias de temas do VS Code não é suportado.

## Podman e motores remotos

Selecione Docker ou Podman em Configurações, salve e execute o diagnóstico. No Linux, ative a API rootless com `systemctl --user start podman.socket`; o endpoint usual é `unix:///run/user/UID/podman/podman.sock`. Em macOS/Windows, inicie o Podman Machine. Endpoint vazio detecta o motor: Docker usa `DOCKER_HOST`/contexto; Podman usa `CONTAINER_HOST`, o socket rootless ou o socket da máquina. Prefira imagens completas, como `docker.io/library/alpine:3.22`.

Revise permissões de bind mounts e labels SELinux. Um workspace em volume evita alterar labels dos fontes. Features com privilégios ou comportamento específico do Docker podem exigir ajustes no modo rootless. Para Compose, instale um provedor compatível e informe seu executável, se necessário.

Para SSH, informe `ssh://usuario@host:porta` e o socket remoto, por exemplo `/run/user/1000/podman/podman.sock`. OpenSSH encaminha a API para um socket local privado usado pela CLI e pelo Dockerode. A autenticação usa agente/configuração SSH e `known_hosts` existentes; chaves desconhecidas não são aceitas automaticamente. O encaminhamento exige host Linux/macOS; no Windows, use TLS. Para TLS, escolha o diretório com `ca.pem`, `cert.pem` e `key.pem`. TCP sem TLS deve ficar restrito a conexões locais protegidas e confiáveis.

Os caminhos dos mounts pertencem ao host do motor, inclusive quando remoto. A pasta local não é enviada automaticamente; use volume remoto ou caminhos já existentes no servidor. Finalize operações e desconecte shells/logs antes de trocar de conexão. Certificados e credenciais não são exportados com o projeto.

## Compose e motores dentro do container

Na aba **Compose**, converta um projeto de imagem/Dockerfile ou edite arquivos existentes. Selecione serviços, imagem/build, portas, volumes, ambiente e dependências, crie serviços e indique o serviço de desenvolvimento. O YAML continua acessível. Arquivos importados sem alterações preservam seus bytes; mudanças visuais preservam comentários e campos desconhecidos, mas podem normalizar a formatação YAML. Overrides usam as regras de caminhos do Compose.

O salvamento revisa todos os YAML alterados e detecta edições externas. Iniciar usa a CLI oficial; Parar inclui os serviços com os mesmos labels de projeto e arquivos Compose. Remover preserva volumes/imagens; redes Compose podem permanecer para reutilização. Revise contextos, arquivos env/config/secret e mounts antes de exportar.

Para um daemon Docker separado com privilégios, selecione a Feature oficial **Docker in Docker**. Para acesso ao motor do host, use Docker outside of Docker ou o assistente de socket em Ambiente; evite mounts duplicados. O socket Podman pode ser montado em `/var/run/docker.sock` para ferramentas compatíveis. Permissões do usuário e SELinux continuam aplicáveis.

## Registry, OCI, Features e segurança

Configurações oferece login no registry por stdin da CLI do motor. O aplicativo não grava senhas no projeto. Docker usa o armazenamento/helper habitual; Podman grava o arquivo de autenticação compatível com Docker para a CLI de Dev Containers acessar artefatos OCI. Sair remove o login do registry desse armazenamento.

Para criar a partir de template OCI, informe referência/opções e escolha um destino vazio. A CLI aplica o template em uma área temporária, copia arquivos permitidos e abre o projeto. Credenciais, metadados Git e symlinks não são copiados. Aplicar não executa hooks; revise os arquivos antes de iniciar.

Em Features, consulte versões, prepare a troca de referência preservando opções e pré-visualize/salve o lockfile atualizado. Salve alterações do projeto antes de gerar o lockfile; edições externas invalidam a prévia. A aba Código permite comparar com outra configuração.

Ambiente oferece referências `${localEnv:NOME}` e encaminhamento do socket do agente SSH. Mantenha valores secretos e chaves privadas no host. Encaminhar o socket dá ao container acesso ao respectivo serviço.

Instale [Trivy](https://trivy.dev/docs/latest/) no host para exportar SBOM CycloneDX ou relatório JSON de vulnerabilidades na aba Segurança. A análise considera **dependências do projeto em disco**, não a imagem construída. Trivy pode baixar bancos de dados. A operação pode ser cancelada no painel de saída; os relatórios são gravados no destino escolhido.

## Repositórios e backups em volumes

Portas e volumes oferece backup TAR de volumes parados e restauração em um **volume novo**. O backup inclui todos os dados, inclusive secrets existentes. A restauração aceita arquivos/diretórios em `data/` e rejeita links, devices e caminhos que escapem; arquivos com esses itens exigem migração manual. Uma cópia privada do TAR é validada antes de criar o volume. Interrupções preservam dados parciais no novo volume; dados existentes nunca são sobrescritos ou apagados automaticamente.

É possível clonar repositórios HTTPS públicos em um volume novo, dentro de `/data/repository`, e selecioná-lo como workspace. Clones privados continuam disponíveis no host via GitHub CLI. O helper Alpine baixa Git e pacotes necessários; confira acesso à rede e a branch. O ZIP não inclui dados de volumes; exporte-os separadamente como TAR.

## Scripts independentes gerados

Novos projetos do wizard e de templates OCI recebem estes arquivos na **raiz do projeto**, ao lado de `.devcontainer`:

- `devcontainer-start.sh` / `devcontainer-start.ps1`
- `devcontainer-stop.sh` / `devcontainer-stop.ps1`
- `devcontainer-shell.sh` / `devcontainer-shell.ps1`

Projetos antigos podem criar os scripts ausentes pela aba Repositório; conteúdo existente é preservado. Instale Node.js e `npm install -g @devcontainers/cli`. Execute `./devcontainer-start.sh`, `./devcontainer-shell.sh` e `./devcontainer-stop.sh`. O shell padrão é `/bin/sh`; passe `/bin/bash` ou outro comando como argumentos. As versões PowerShell exigem PowerShell 7+. O script de start aceita flags adicionais da CLI.

`DCB_ENGINE=docker|podman` substitui o motor padrão gerado. Os scripts incluem os defaults de endpoint, diretório TLS e executável Compose no momento da geração; variáveis de ambiente têm prioridade. Ao mover o projeto, remapeie caminhos específicos da máquina e ajuste `DOCKER_HOST`/`CONTAINER_HOST` e autenticação TLS/SSH. Os scripts localizam a raiz independentemente da pasta atual e usam o mesmo label de propriedade do aplicativo. Iniciar executa os hooks configurados; parar preserva dados. Os scripts são selecionados por padrão no ZIP.

## Atualizações do aplicativo e artefatos

Aplicativos empacotados consultam GitHub Releases; habilite a consulta automática ou use Verificar atualizações. Baixar e reiniciar/instalar são ações explícitas. Enquanto o repositório for privado, inicie com `GH_TOKEN` ou `GITHUB_TOKEN` com acesso aos releases. O token não é salvo nas configurações do projeto nem embutido nos metadados. `npm run dev` não atualiza a própria instalação.

Builds locais não publicam releases. macOS gera DMG, ZIP e metadados; a publicação de artefatos/metadados assinados é manual após revisão. A consulta automática começa desabilitada. A validação completa depende de release publicado, assinatura/notarização e máquinas das plataformas indicadas no TODO.

A execução Compose usa `COMPOSE_BAKE=false` nos provedores compatíveis e `BUILDX_BAKE_ENTITLEMENTS_FS=0` para versões recentes do Bake, pois a CLI oficial gera Dockerfiles de Features fora do contexto original. Iniciar/Testar e os scripts independentes executam builds confiáveis com acesso ao sistema de arquivos do host; revise Dockerfiles, arquivos Compose e hooks importados antes da execução.

Os helpers POSIX incluem `.devcontainer/builder-podman.sh` para recuperar eventos Podman desde o começo da operação CLI. Mantenha esse arquivo junto dos scripts ao exportar. PowerShell usa o executável Podman nativo; Podman Machine e seu comportamento de eventos ainda exigem validação no Windows.
