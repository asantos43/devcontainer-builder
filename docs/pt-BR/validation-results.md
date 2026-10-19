# Resultados da implementação — 18/10/2026

[English](../en/validation-results.md)

Validação local em Linux x64 com Node.js 22.23.1, Electron 44.9.0 e Docker Engine 29.9.1.

| Verificação                                                          | Resultado                                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| TypeScript, ESLint, Prettier                                         | Aprovados                                                              |
| Testes de domínio/arquivos e regressão de runtime                    | 113 aprovados                                                          |
| Cenários Electron/Playwright com Docker e GitHub privado habilitados | 23 cenários distintos aprovados após repetição direcionada; 1 ignorado |
| Build CLI, hooks, workspace, volume e exec Dockerode                 | Aprovados                                                              |
| Feature oficial Docker do host com usuário não root                  | Aprovada                                                               |
| Shell interativo, remoteEnv e desconexão ao parar                    | Aprovados                                                              |
| ZIP exportado e reconstruído em outra pasta                          | Aprovado                                                               |
| Pesquisa real de imagens e tags Docker Hub                           | Aprovada                                                               |
| Geração AppImage e DEB Linux                                         | Aprovada                                                               |
| Janela empacotada Linux e CLI incluída                               | Aprovadas                                                              |
| npm audit, incluindo dependências distribuídas                       | Sem vulnerabilidades conhecidas                                        |
| macOS Intel / Apple Silicon                                          | Bloqueado antes de iniciar por cobrança/limite de gastos GitHub        |
| Execução Windows e validação do instalador                           | Pendente de máquina Windows                                            |
| Assinatura Windows e assinatura/notarização macOS                    | Pendentes de credenciais                                               |
| Criação/push remoto pelo aplicativo                                  | Criação privada, commit selecionado e push aprovados                   |

O workflow é exclusivo para macOS. O GitHub informou falha de pagamentos recentes ou necessidade de aumentar o limite de gastos. Nenhum resultado de teste/build macOS é declarado. Após resolver a cobrança, execute novamente o workflow. Linux e Windows permanecem locais.

O MCP Context7 foi registrado globalmente e o OAuth foi concluído. O MCP Playwright e seu navegador foram instalados, com navegação real para `about:blank` aprovada. São ferramentas de desenvolvimento separadas das dependências de teste do aplicativo.

A implementação inicial foi entregue no PR #1 e depois recebeu merge pelo mantenedor. Evoluções usam branches e PRs próprios, sem merge automático. Artefatos ficam na pasta local ignorada `release/`; nenhuma release foi publicada.

## Temas, Podman e extensões do aplicativo

Validação local no Fedora Linux x64 com Docker 29.9.1, Podman 5.8.9, CLI 0.89.0, Monaco 0.57.0 e Trivy 0.76.0. O binário oficial Trivy foi baixado em `/tmp` e conferido pelo manifesto SHA-256 do release; ele não acompanha o aplicativo.

- A suíte Electron completa aprovou 13 cenários; o cenário descartável de criação GitHub foi ignorado por falta de permissão de exclusão.
- TypeScript, ESLint, formatação e 59 testes de domínio/arquivos passaram; a auditoria npm não apontou vulnerabilidades conhecidas.
- Persistência de temas, paletas Monaco/xterm e preservação de comentários Compose passaram no Electron.
- Docker e Podman rootless reais passaram em inicialização, shell, parada, scripts independentes e backup/restauração TAR. O cenário Podman corrigido passou três repetições consecutivas.
- Compose construiu o serviço de desenvolvimento e parou os serviços associados.
- Template OCI, consulta de Features, clone público em volume, SBOM CycloneDX real e relatório de vulnerabilidades passaram.
- Criação privada no GitHub, commit selecionado e push passaram. A exclusão retornou HTTP 403 por falta de permissão no token. O repositório `asantos43/dcb-validation-dcb-e2e-x1skxl` permanece **privado e arquivado**, com limpeza manual no TODO. Novos testes descartáveis são ignorados antes da criação se faltar o escopo `delete_repo`.
- AppImage/DEB Linux e aplicativo empacotado passaram, incluindo CLI e carregamento do atualizador. A exigência de credenciais para releases privados foi verificada sem consultar releases; nada foi publicado.

Continuam pendentes: SSH/TLS em servidores reais, Windows/PowerShell nativos, Podman Machine, assinatura/notarização e instalação de atualização assinada. Login real em registry com credenciais do usuário não foi executado; stdin e remoção de secrets da saída têm teste de regressão de subprocesso. Os guias e TODO registram essas limitações.

## Implementação das funcionalidades restantes

Nesta branch passaram TypeScript, ESLint, formatação e 113 testes em 14 arquivos. A execução completa do Electron percorreu 24 cenários: 22 passaram, o clone autenticado em volume falhou e a criação remota condicionada à permissão de exclusão foi ignorada. Após corrigir a conexão stdin, o clone privado e o tema VSIX passaram na repetição direcionada, incluindo importar o tema antes de abrir o Monaco pela primeira vez. São 23 cenários distintos aprovados; isso não representa execução nativa em Windows/macOS.

- Wizard com paleta/opções, revisão de pasta/ZIP, conflitos, snapshots reutilizáveis, preservação de comentários e importação sem hooks passaram no Electron. Checkout Git local por revisão/subpasta, limites e rejeições de arquivos e construção do comando de publicação OCI têm cobertura de regressão.
- Um build Docker real instalou Claude Code, Codex CLI e OpenCode pela Feature local gerada. Os três comandos de versão funcionaram como usuário de desenvolvimento sem root; não houve login em provedores.
- Docker e Podman rootless passaram em scripts, shell e backup/restauração TAR com links simbólicos relativos, hard links e permissões de execução. O clone GitHub privado em volume passou sem gravar a credencial encaminhada na configuração Git.
- Exportação/análise de imagem pelo Trivy gerou CycloneDX real sem iniciar o container de teste nem executar hooks. As verificações existentes de SBOM/vulnerabilidades em disco também passaram.
- O diagnóstico nativo de requisitos Linux passou. Os limites de plataforma e as exigências de assinatura foram testados com entradas simuladas, incluindo o alvo Windows empacotado a partir de Linux.
- AppImage e DEB foram gerados com dependências nativas declaradas. Janela empacotada, CLI incluída e exigência de credenciais do atualizador privado passaram. A auditoria npm encontrou zero vulnerabilidades conhecidas.
- A consulta ao armazenamento nativo Linux indicou criptografia indisponível com backend `basic_text`; nenhum fallback sem criptografia foi habilitado e nenhuma credencial foi salva. Serialização, criptografia/descriptografia pelo adaptador e rejeições têm cobertura unitária. O teste real de Secret Service/KWallet, Keychain macOS e DPAPI Windows depende desses ambientes.
- Publicação OCI real, login real em registry, instaladores/motores nativos, assinatura/notarização, motores remotos e entrega de atualização assinada não foram executados. A exclusão do repositório de validação arquivado foi tentada novamente e retornou HTTP 403 com a credencial GitHub atual.

Artefatos Linux ficam em `release/`, ignorado pelo Git; nenhum release do aplicativo ou template OCI foi publicado. O único workflow CI continua sendo macOS.

## Repositório público e validação macOS

Após o repositório tornar-se público, os runners Intel e Apple Silicon iniciaram. A primeira execução encontrou uma asserção de caminhos /var versus /private/var; raízes canônicas e cobertura de entrada por symlink corrigiram o teste. As duas arquiteturas passaram no [workflow seguinte](https://github.com/asantos43/devcontainer-builder/actions/runs/39190217041): 115 testes de domínio aprovados e um exclusivo de Linux ignorado, além de 12 cenários Electron aprovados e 12 integrações opcionais ignoradas por arquitetura. Ambas geraram DMG/ZIP sem assinatura e passaram em janela empacotada, CLI 0.89.0 e bloqueio do atualizador antes de download.

A evolução para atualizações públicas passou em 116 testes e 12 cenários Electron locais no Linux, com 12 integrações opcionais ignoradas. AppImage/DEB e o atualizador empacotado sem token GitHub também passaram. As notas da prévia pública 0.1.0 registram os limites de assinatura e motores nativos; os resultados anteriores de repositório privado/cobrança acima são históricos.
