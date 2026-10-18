# Documentation and UI tools

Context7 and Playwright MCP are installed in the developer’s global Codex configuration. They are optional agent tools, not application dependencies. Check availability in the active session before use; a client reload may be required after installation.

Use Context7 or official documentation to verify unfamiliar library APIs. Use the repository’s Playwright Electron suite to verify actual application behavior; browser MCP alone does not replace main/preload/renderer integration tests.

Do not commit MCP credentials or generated `.playwright-mcp` artifacts. CI must remain macOS-only.
