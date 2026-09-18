# AGENTS.md

Instructions for an AI coding agent working on this repo.

## What this repo is

Reference third-party Salt agent integrations, built on
[`salt-agent-sdk`](../salt-agent-sdk) (a sibling checkout, referenced via
`file:../salt-agent-sdk` in `package.json` — this is intentional and
permanent here, unlike a package meant to be published to npm, since this
repo is a local reference implementation, never an npm-published package).
See `README.md` for what each example (`index.js`, `faucet.js`) actually
does; this file is about *working on* the code, not using it.

The SDK owns everything Salt-protocol-specific (webhook receipt/signature
verification, PGP decrypt/encrypt, resolving who to encrypt a reply for,
posting back). Each file here only implements the event handlers it cares
about — typically `onMessage(ctx)` and `onChatOpened(ctx)` — and stays
otherwise silent on everything else.

## Setup

```bash
npm install
cp .env.example .env   # fill in HOST, SALT_API_KEY, SALT_APP_ID, APP_PUBLIC_KEY,
                       # APP_PRIVATE_KEY, PGP_PASSPHRASE at minimum
```

If `../salt-agent-sdk` has local changes not yet published, rebuild it
first (`cd ../salt-agent-sdk && npm run build`) — this repo's `npm install`
picks up its `dist/` output via the `file:` dependency, and Node won't see
source changes without a rebuild.

## Run

```bash
node index.js     # echo / local-LLM agent, needs a local inference server
                   # at http://localhost:1234 (LM Studio-style, optional --
                   # falls back to a plain echo if that's not running)
node faucet.js     # testnet faucet agent, needs the FAUCET_* env vars too
```

Both are long-running webhook servers (`PORT` in `.env`, default per the
SDK). They receive Salt's webhook POSTs, so for local dev you either point
your Salt deployment's agent webhook config at a locally-reachable URL, or
use a tunnel (ngrok, cloudflared, etc.) during testing.

## Test

```bash
npm test
```

There is currently no automated test suite here (`npm test` is a stub) —
this repo is a reference/example, verified by running it against a real or
local `salt-api` and confirming the webhook round-trip (send it a message,
confirm it replies; for `faucet.js`, confirm a drip transaction lands).

## Conventions

- **CommonJS** (no `"type": "module"` in `package.json`) — this repo predates
  `salt-mcp`'s ESM-only convention; don't convert it without a real reason,
  since existing `require()` calls throughout depend on it.
- **`SALT_VERIFY_SIGNATURES=false` is local-dev-only**, and only against a
  local `salt-api`. Never disable webhook signature verification against a
  real deployment, even for a quick test — plaintext events like
  `card_interaction`/`invoice_paid`/`chat_opened` are directly actionable and
  the signature is what stops a forged one.
- **Never commit real credentials.** `.env` is gitignored; `.env.example`
  documents the shape with placeholder values only.
- Any Salt account this code creates for testing (e.g. registering a test
  agent against a local `salt-api`) should be named `SALT-…` /
  `salt-…@example.test`, matching the workspace-wide convention — even
  though this repo talks to Salt as a THIRD PARTY, not as tooling running
  inside the Salt workspace itself, keeping that naming makes a stray test
  account immediately recognizable if it ever reaches a shared environment.

## PR / commit guidance

If you change how a handler talks to `salt-agent-sdk` (event shapes,
`ctx` fields, tool names), check both `index.js` and `faucet.js` for the same
pattern — they intentionally share conventions so a reader can compare them.
