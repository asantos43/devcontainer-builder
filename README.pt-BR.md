# DevContainer Builder

Aplicativo Electron para criar, editar, testar e exportar ambientes de desenvolvimento em containers.

[English](README.md) · [Guia](docs/pt-BR/guide.md) · [Arquitetura](docs/pt-BR/architecture.md) · [Validação](docs/pt-BR/validation.md) · [Roadmap em inglês](TODO.md)

## Funcionalidades

- Wizard de oito etapas, seguido de editor por abas para ajuste fino.
- Importação existente, preservação de JSONC e revisão antes de salvar.
- Operações e comentários visuais no Dockerfile, com editor Monaco local.
- Repositório no host: inicializar, criar no GitHub ou clonar, montando no container.
- Imagens/tags, Features, comandos de ciclo de vida e personalização do VS Code.
- Pastas e volumes nomeados, com suporte a somente leitura.
- CLI oficial de Dev Containers; Dockerode para inspeção, logs e shell.
- Terminal xterm.js, verificações personalizadas e relatórios JSON.
- ZIP com seleção de arquivos, revisão de dependências e exclusão de arquivos sensíveis.
- Interface em português e inglês. Não exige serviço de IA.

## Executar localmente

Requer Node.js 22.16+ e npm. Para executar containers, instale Docker Engine/Desktop. Git e GitHub CLI são necessários para as respectivas ações de repositório.

```sh
npm ci
npm run dev
```

A CLI de Dev Containers acompanha o aplicativo e usa o runtime Node utilitário do Electron. Não é necessária instalação global de `devcontainer`. Docker, Git e `gh` são ferramentas do host.

```sh
npm run check          # TypeScript, ESLint e testes de domínio/arquivos
npm run test:e2e       # Build e testes Electron (exige sessão gráfica)
npm run test:docker    # Docker real: build, hooks, mounts e exec; baixa Alpine
npm run package:linux # AppImage e DEB locais
npm run package:win   # Instalador NSIS local no Windows
npm run package:mac   # DMG em máquina macOS
```

Linux e Windows são testados e empacotados localmente. O único workflow GitHub Actions é para macOS Intel e Apple Silicon e não publica releases. Assinatura/notarização dependem de credenciais do mantenedor.

## Ambientes existentes

Abrir ou salvar não executa comandos nem reinicia containers. A importação preserva comentários, diretivas e trechos intactos do Dockerfile. Sintaxe avançada permanece disponível em código. O salvamento mostra diferenças e impede sobrescrever alterações externas.

Revise Dockerfiles, comandos do host e mounts antes de iniciar um projeto importado. O socket Docker permite controlar o daemon do host.

## Política do projeto

O repositório começa privado. Após o primeiro commit, alterações exigem branch própria e pull request para `main`, sem merge automático. Essa política não é imposta aos projetos dos usuários.

A documentação é bilíngue. TODO, CHANGELOG, CONTRIBUTING e SECURITY existem somente em inglês. Instruções para agentes estão em [AGENTS.md](AGENTS.md) e `.agents/`.

Licença [Mozilla Public License 2.0](LICENSE), SPDX `MPL-2.0`.
