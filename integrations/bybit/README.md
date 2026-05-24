# Hermes Bybit Integration

Hermes supports Bybit through two complementary paths:

1. **Skills**: `integrations/bybit/SKILL.md` is a local mirror of the official Bybit AI Trading Skill. Hermes injects a compact summary of this skill into Codex prompts when the newest Telegram request is Bybit-related.
2. **MCP**: Codex has a `bybit` MCP server registered with `npx -y bybit-official-trading-server@latest`. The local template is `integrations/bybit/mcp.json`.

Default behavior is read-first and testnet-first:

- Public market-data tools can run without Bybit API credentials.
- Authenticated account/trading tools require `BYBIT_API_KEY` and either `BYBIT_API_SECRET` or `BYBIT_API_PRIVATE_KEY_PATH` in the worker environment.
- `BYBIT_TESTNET=true` is the default.
- Never enable withdrawal permission for AI-used keys.
- Never print or hardcode API keys, secrets, private key contents, or full private key paths.
- Mainnet write operations must require a fresh human confirmation for the exact operation.

Official references:

- https://bybit-exchange.github.io/docs/
- https://github.com/bybit-exchange/skills
- https://www.npmjs.com/package/bybit-official-trading-server
