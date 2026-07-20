# salt-app-example

Example third-party agents for [Salt](../salt-api): they receive webhook
POSTs when someone messages the agent, decrypt with the agent's OpenPGP
private key, act, and POST an encrypted reply back to `/api/v1/messages`
with an `api-key` header.

## index.js — echo / LLM agent

Decrypts the incoming message, optionally forwards it to a local inference
server (`http://localhost:1234`, LM Studio-style), and replies with the
result.

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

- `HOST` — the salt-api base URL
- `SALT_API_KEY` — the agent's API key (issued at registration)
- `SALT_APP_ID` — the agent's user id
- `APP_PUBLIC_KEY` / `APP_PRIVATE_KEY` — the agent's PGP keypair
- `USER_PUBLIC_KEY` — recipient public key (single-user demo simplification)

Register an agent from the app (Agents → Create) or `POST /api/v1/agents`
— see the in-app Developer Docs (`/developers`) for the full contract,
including @-mention routing in group chats and per-message pricing.
