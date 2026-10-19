# Arquitetura

[English](../en/architecture.md)

O processo principal Electron controla arquivos, diálogos, preferências, processos, GitHub CLI, Docker e ZIP. O preload expõe `BuilderAPI` tipada com isolamento de contexto e sandbox. Zod valida os argumentos IPC; as chamadas devem vir da janela/frame principal. O renderer não tem Node. Navegação e novas janelas são bloqueadas.

Wizard e editores React compartilham funções de domínio/JSONC. Patches JSONC usam árvore sintática. Os blocos Dockerfile retêm texto original e offsets; operações alteram somente os blocos selecionados. Diretivas ficam fixas, comentários são explícitos e sintaxe não suportada permanece em código. Caminhos passam por validação lexical e realpath para impedir escapes por symlink. Mudanças externas impedem salvar snapshots desatualizados.

A configuração segue o padrão Dev Containers JSONC. `builder.json`, junto à configuração selecionada, guarda testes personalizados versionados. Preferências e projetos recentes ficam em userData do Electron. Contas e tokens não são gravados no projeto.

A CLI incluída usa utilityProcess do Electron com o endpoint Docker escolhido. Dockerode usa o mesmo endpoint para inspeção, verificação de propriedade, shell, logs e volumes. Containers gerenciados recebem label estável derivada da raiz/configuração. A limpeza não remove volumes persistentes. Git e GitHub CLI do host preservam a configuração de credenciais.

Streams publicam eventos tipados, com buffers limitados. Operações têm sinais de cancelamento; sessões e streams são descartados ao fechar. A seleção ZIP rejeita caminhos inseguros, symlinks e arquivos sensíveis reconhecidos; a revisão de dependências é explícita.

O desenvolvimento usa Vite, Tailwind e workers Monaco locais. electron-builder inclui aplicativo, CLI e runtime Electron. Linux/Windows são validados localmente; somente macOS usa GitHub Actions. Consulte a documentação de validação para cobertura e pendências.

O adaptador seleciona Docker ou Podman e compartilha o endpoint com Dockerode, usando certificados TLS ou túnel local do socket SSH. A recuperação de eventos Podman fica em um adaptador POSIX gerado. Documentos Compose participam da proteção contra edições externas e do rollback de JSONC/Dockerfiles. Helpers na raiz usam o mesmo hash de propriedade de raiz/configuração.

Os temas usam variáveis CSS semânticas compartilhadas com Monaco e xterm. O aplicativo controla o ciclo de vida dos editores/modelos Monaco e mantém o hover em serviços com a duração do aplicativo. Os terminais permanecem montados atrás das preferências.

O IPC de manutenção oferece armazenamento nativo de credenciais do registry, templates OCI em staging, lockfiles de Features revisados, clones/TAR de volumes, relatórios Trivy de dependências em disco e ações explícitas de atualização. O IPC expõe operações fixas; uma preferência explícita seleciona o executável do provedor Compose. Diálogos nativos selecionam os destinos dos arquivos. Restauração não sobrescreve volumes existentes. Abrir ou salvar não executa código.

Snapshots de templates/importação são mapas de arquivos imutáveis e limitados no processo principal. A revisão da origem e a autorização de destino são separadas; gravações exclusivas rejeitam conflitos, preservam comentários e não executam hooks. Fontes de pasta/Git/ZIP e a paleta alimentam o mesmo editor. Arquivos da Feature local de IA são gerados ao salvar e executados somente em um build explícito. A publicação OCI cria um staging da prévia revisada e chama a CLI incluída apenas na ação de publicação.

Temas externos e gramáticas TextMate são dados declarativos. O processo principal valida bundles e includes; o renderer usa Oniguruma WASM incluído, sem carregar JavaScript ou um host de extensões. Credenciais usam safeStorage com backend de criptografia do SO, sem IPC de leitura do texto secreto. Helpers autenticados recebem tokens por conexão stdin e tmpfs, com redirects, credential helpers e hooks Git desabilitados. A restauração TAR valida o grafo de links resolvidos antes de criar um volume novo. A política compartilhada de requisitos controla inicialização, diagnóstico e mínimos de empacotamento documentados.
