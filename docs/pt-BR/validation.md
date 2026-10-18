# Validação

[English](../en/validation.md)

Execute `npm ci`, `npm run check`, `npm run format:check` e `npm run test:e2e` em sessão gráfica. Os testes Electron usam main/preload/renderer reais, substituem somente seletores nativos e usam pastas descartáveis. Cobrem wizard, Git local, comentários/salvamento, idiomas e runtime utilitário da CLI.

Os testes de domínio/arquivos cobrem comentários JSONC, CRLF, propriedades desconhecidas, comentários/diretivas Dockerfile, instruções desativadas, fallback para código, mounts, salvamento desatualizado, limites de symlinks e seleção ZIP. Não acessam GitHub ou Docker.

`npm run test:docker` exige daemon ativo. Baixa Alpine, cria workspace e volume temporários, constrói/inicia pela CLI oficial, verifica hook, mounts e exec Dockerode e remove seu container/volume. Imagens/cache de build podem permanecer. Outros recursos não são removidos. Testes de criação/push GitHub exigem conta de teste e não executam automaticamente.

Execute `npm run package:linux` localmente em Linux ou `npm run package:win` em Windows. Valide o executável com `npm run verify:package -- /caminho/do/executavel`. A automação macOS executa verificações/testes e valida o pacote em Intel e Apple Silicon. Testes reais Docker Desktop permanecem locais quando o runner não possui daemon.

## Aceite de release

Registre resultados exatos: verificações, interface Electron, smoke Docker, instalador Linux, Windows, workflow macOS, assinatura, clone/criação/push privado, Docker do host e reconstrução de ZIP em pasta limpa. Não declare aprovadas verificações pendentes. Consulte o PR para os resultados reais desta implementação.

Verificações locais adicionais:

```sh
DCB_DOCKER_E2E=1 npx playwright test
DCB_FEATURE_SMOKE=1 npm run test:docker
```

No PowerShell, defina a variável correspondente com `$env:` antes do comando.
