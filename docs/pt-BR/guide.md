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

`forwardPorts` informa encaminhamentos para IDEs compatíveis; o aplicativo não implementa túneis de IDE. Publique portas em `runArgs`, por exemplo `["-p", "127.0.0.1:3000:3000"]`. A inspeção Docker mostra os bindings reais.

## Executar, inspecionar e testar

Salve e escolha Iniciar ou Testar. Revise comandos do host, Features e montagens. A CLI oficial aplica Features e hooks. Docker do host usa a Feature oficial Docker outside of Docker e permite controlar o daemon do host.

O terminal usa usuário/workspace efetivos, tenta o shell configurado e depois `/bin/sh`. Logs incluem build, Git e saída do container. Os buffers são limitados; copie ou exporte a saída quando necessário.

Verificações personalizadas executam sequencialmente após inicialização/inspeção, com nome, comando, diretório, timeout e código esperado. A primeira falha interrompe a sequência. Exporte relatório JSON na aba Testes. Cancelar encerra o coordenador; verifique recursos remanescentes. O encerramento de grupos de processos é uma tentativa quando a imagem não possui `setsid`.

Parar preserva o container. Remover exige confirmação e mantém volumes nomeados e imagens. Containers de outros projetos não são removidos.

## Exportar ZIP

Salve, analise o projeto e selecione a configuração e os arquivos necessários. Metadados Git, credenciais reconhecidas, dependências instaladas e artefatos são excluídos. Revise dependências e mounts locais. O ZIP inclui manifesto e instruções; dependências pendentes impedem afirmar portabilidade completa. Dados de volumes Docker não são incluídos.

## Builds locais e automação macOS

Linux: `npm run package:linux`. Windows: `npm run package:win` em Windows. macOS: `npm run package:mac` em macOS. Os artefatos ficam em `release/`. Use `npm run verify:package -- /caminho/do/executavel`; no macOS o script encontra o `.app` automaticamente.

GitHub Actions executa somente macOS, com Intel e Apple Silicon em PRs/main/execução manual, sem publicar releases. Configure `CSC_LINK` e `CSC_KEY_PASSWORD` para assinatura e `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` para notarização. Artefatos sem assinatura são builds de desenvolvimento.

## Solução de problemas

Abra Configurações → Verificar ferramentas e Docker. Endpoint vazio usa `DOCKER_HOST` ou o contexto Docker atual. Há suporte a sockets Unix/rootless e named pipes Windows; endpoints SSH/TCP remotos ficam fora desta versão. No Linux, configure acesso normal do usuário ao socket; o aplicativo não muda permissões. No Windows, use containers Linux no Docker Desktop e caminhos acessíveis pelo host. No macOS, use o contexto ativo do Docker Desktop.

Em falhas ou limites do Docker Hub, informe a imagem manualmente. Referências de outros registries são aceitas; a pesquisa de tags é restrita ao Docker Hub. Compose funciona somente em código. Consulte TODO para evoluções.
