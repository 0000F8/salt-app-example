# salt-app-example

Example third-party agents for [Salt](../salt-api), built on
[`salt-agent-sdk`](../salt-agent-sdk). The SDK handles everything about
talking to Salt (webhook receiving, PGP decrypt/encrypt, resolving who to
encrypt a reply for, posting it back) -- each example here only implements
`onMessage(ctx)`, i.e. "what do I say back."

## index.js — echo / local-LLM agent

Decrypts the incoming message, forwards it to a local inference server
(`http://localhost:1234`, LM Studio-style, OpenAI-compatible), and replies
with the result. No Anthropic/OpenAI SDK involved at all -- proof the
framework doesn't care which model (or non-model) answers.

```
npm install
node index.js
```

## faucet.js — testnet faucet agent

Message it a testnet wallet address (from the Wallets tab) and it sends a
small drip of testnet ETH from its funded faucet wallet, replying in-chat
with the tx hash. Rate-limited to one drip per user per day.

```
node faucet.js
```

Extra `.env` vars on top of the base ones below:

- `FAUCET_RPC_URL` — testnet JSON-RPC endpoint (Sepolia via dRPC/Infura)
- `FAUCET_PRIVATE_KEY` — hex key of a funded **testnet** wallet
- `FAUCET_AMOUNT` — drip size in ETH units (default `0.01`)
- `FAUCET_CHAIN_ID` — default `11155111` (Sepolia)

## Base .env

See `.env.example`. In short: `HOST`, `SALT_API_KEY`, `SALT_APP_ID`,
`APP_PUBLIC_KEY` / `APP_PRIVATE_KEY` (the agent's PGP keypair),
`PGP_PASSPHRASE`, `PORT`, and `SALT_VERIFY_SIGNATURES` (local dev only).

Unlike before, there's no `USER_PUBLIC_KEY` to configure -- the SDK
resolves who to encrypt a reply for dynamically from the chat's actual
membership, so these examples work correctly in group chats too, not just
a fixed single recipient.

### Webhook authenticity

Every webhook POST salt-api sends carries `X-Salt-Agent-Id` and
`X-Salt-Signature: t=<timestamp>,v1=<HMAC-SHA256(secret, "<timestamp>.<body>")>`,
signed with a secret unique to that recipient agent. The SDK fetches this
agent's own secret automatically (using its API key) and verifies every
incoming request against it by default, rejecting anything unsigned, badly
signed, or older than a few minutes (replay protection).

This matters because not every webhook is inert: encrypted chat messages
fail safe on their own (a forged payload just won't decrypt), but events
like `card_interaction` and `invoice_paid` arrive as plaintext and are
directly actionable -- without verification, anyone who could reach this
server's URL could trigger them. Set `SALT_VERIFY_SIGNATURES=false` only to
turn this off against a local dev salt-api; never in production.

Register an agent from the app (Agents → Create) or `POST /api/v1/agents`
— see the in-app Developer Docs (`/developers`) for the full contract,
including @-mention routing in group chats and per-message pricing. For
building a real agent (persona, tools, delegation, commerce, cards), see
[`salt-agent-sdk`](../salt-agent-sdk)'s own README, or
[`salt-claude-agent`](../salt-claude-agent) for a full-featured reference
implementation built on the same SDK.
