# Resultados da implementação — 18/10/2026

[English](../en/validation-results.md)

Validação local em Linux x64 com Node.js 22.23.1, Electron 44.9.0 e Docker Engine 29.9.1.

| Verificação                                                          | Resultado                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------- |
| TypeScript, ESLint, Prettier                                         | Aprovados                                                       |
| Testes de domínio/arquivos e regressão de runtime                    | 37 aprovados                                                    |
| Cenários Electron/Playwright com Docker e GitHub privado habilitados | 5 aprovados                                                     |
| Build CLI, hooks, workspace, volume e exec Dockerode                 | Aprovados                                                       |
| Feature oficial Docker do host com usuário não root                  | Aprovada                                                        |
| Shell interativo, remoteEnv e desconexão ao parar                    | Aprovados                                                       |
| ZIP exportado e reconstruído em outra pasta                          | Aprovado                                                        |
| Pesquisa real de imagens e tags Docker Hub                           | Aprovada                                                        |
| Geração AppImage e DEB Linux                                         | Aprovada                                                        |
| Janela empacotada Linux e CLI incluída                               | Aprovadas                                                       |
| npm audit, incluindo dependências distribuídas                       | Sem vulnerabilidades conhecidas                                 |
| macOS Intel / Apple Silicon                                          | Bloqueado antes de iniciar por cobrança/limite de gastos GitHub |
| Execução Windows e validação do instalador                           | Pendente de máquina Windows                                     |
| Assinatura Windows e assinatura/notarização macOS                    | Pendentes de credenciais                                        |
| Criação/push remoto pelo aplicativo                                  | Pendente de repositório dedicado de teste                       |

O workflow é exclusivo para macOS. O GitHub informou falha de pagamentos recentes ou necessidade de aumentar o limite de gastos. Nenhum resultado de teste/build macOS é declarado. Após resolver a cobrança, execute novamente o workflow. Linux e Windows permanecem locais.

O MCP Context7 foi registrado globalmente e o OAuth foi concluído. O MCP Playwright e seu navegador foram instalados, com navegação real para `about:blank` aprovada. São ferramentas de desenvolvimento separadas das dependências de teste do aplicativo.

A implementação está na branch `feat/devcontainer-workbench`, no PR #1, sem merge automático. Artefatos ficam na pasta local ignorada `release/`; nenhuma release foi publicada.

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
