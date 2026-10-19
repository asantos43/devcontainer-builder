# Requisitos de sistema dos releases

[English](../en/system-requirements.md) · [Guia](guide.md)

Estes são os mínimos suportados pelo aplicativo. As verificações usam `src/shared/requirements.ts`; os pacotes nativos também declaram os pré-requisitos de cada plataforma.

| Plataforma | Mínimo suportado                                                       | Bibliotecas nativas / instalação                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Windows    | Windows 10 22H2, build 19045; Windows 11; runtime x64/arm64 de 64 bits | O NSIS verifica o build do Windows. Use o instalador correspondente à arquitetura publicada. Docker Desktop deve usar containers Linux.                                                                                                                                                          |
| macOS      | macOS 13 Ventura; Intel x64 ou Apple Silicon arm64                     | O bundle declara `LSMinimumSystemVersion` pelo electron-builder. Docker Desktop ou Podman Machine só são necessários para containers.                                                                                                                                                            |
| Linux      | Distribuição desktop com glibc 2.31+; runtime x64/arm64                | GTK 3, NSS, GBM, ALSA, ATK/AT-SPI, DRM, X11 e xkbcommon. As dependências DEB/RPM exigem essas bibliotecas. O RPM usa capabilities de bibliotecas para evitar nomes de pacotes específicos de cada distribuição. AppImage também precisa de FUSE compatível ou extração com `--appimage-extract`. |

São necessários **2 GiB de RAM total** e **1 GiB livre no sistema de arquivos dos dados do aplicativo**. São mínimos definidos pelo projeto, não estimativas para builds de containers. Reserve espaço e RAM adicionais para imagens, repositórios, builds e backups de volumes. Os scripts Linux/Windows geram x64; o empacotamento macOS suporta x64 e arm64. Suporte ao runtime não significa que todos os artefatos já estejam publicados.

O aplicativo empacotado inclui Electron, React, Monaco, xterm e a CLI de Dev Containers. Node.js/npm são necessários para desenvolver a partir dos fontes, não para abrir o aplicativo empacotado. Os scripts independentes de ciclo de vida exigem separadamente Node.js e a CLI global de Dev Containers.

## Dependências por operação

- Criar/editar/importar/exportar configurações: não exige motor de containers nem conta GitHub.
- Build, execução, shell, logs e volumes: Docker 20.10+ ou Podman 4.9+, API ativa e containers Linux. Motores rootless precisam do socket ativo; Podman em macOS/Windows precisa do Podman Machine. Projetos Compose também exigem provedor Compose compatível.
- Git/templates em repositórios: Git no host. HTTPS privado usa o credential helper do host; SSH usa a configuração/agente existentes.
- Criação/clonagem GitHub: GitHub CLI autenticada com acesso ao repositório solicitado.
- Clone privado GitHub em volume: autenticação da GitHub CLI ou token salvo selecionado explicitamente. A credencial vai por stdin a um helper descartável e fica em tmpfs; não é gravada no repositório nem na configuração Git.
- Relatórios de dependências/imagens: [Trivy](https://trivy.dev/docs/latest/) instalado no host. Ele pode baixar bancos de vulnerabilidades. A análise de imagem também usa a CLI do motor configurado para salvar a imagem do container gerenciado.
- Credenciais salvas: Windows DPAPI, macOS Keychain ou Linux Secret Service/KWallet. Criptografia indisponível e o fallback Linux `basic_text` são recusados.
- Atualizações: aplicativo empacotado e release publicado. Este repositório é público; nenhum token GitHub é exigido.

Execute `npm run check:system` e use **Configurações → Verificar ferramentas e motor** para os diagnósticos por operação. O startup bloqueia SO/arquitetura incompatíveis, RAM/espaço insuficientes e libc Linux não suportada. Operações com containers explicam ferramentas ausentes, versão do motor ou exigência de containers Linux. Bibliotecas nativas podem falhar antes de o Electron executar JavaScript; por isso os gerenciadores DEB/RPM e os metadados do bundle/instalador fazem parte da verificação.

## Assinatura e validação de releases

Builds de desenvolvimento podem ficar sem assinatura. Defina `DCB_RELEASE=1` ao gerar um release de produção Windows/macOS; o empacotamento falha se faltarem secrets de assinatura. Configure `CSC_LINK` e `CSC_KEY_PASSWORD` para Windows/macOS. macOS também exige `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` e `APPLE_TEAM_ID` para notarização. Use secrets do GitHub Actions no macOS ou o ambiente local de build no Windows. Nunca versione os valores.

Somente macOS usa GitHub Actions. Builds e testes Windows/Linux continuam locais. Testes nativos dos motores em Windows/macOS, SSH/TLS remoto/Podman Machine, identidades de assinatura e entrega real de atualizações assinadas ainda dependem das respectivas máquinas/contas. Testes de limites com dados de host simulados não substituem essas verificações.

Fontes da base de plataformas: [suporte de plataformas do Electron](https://github.com/electron/electron#platform-support) e [mínimo macOS do Electron 44](https://www.electronjs.org/blog/electron-44-0#removed-macos-12-support). Os mínimos Windows 22H2, glibc, RAM e disco são políticas explícitas deste projeto.
