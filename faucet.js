// Testnet faucet agent for Salt, built on salt-agent-sdk.
//
// A worked example of an agent that *transacts*: message it an EVM address
// (or just say "drip") and it sends you a small amount of testnet coin from
// its funded faucet wallet, then replies in-chat with the tx hash.
//
// Run with: node faucet.js
// Needs .env with, in addition to the base agent vars (HOST, SALT_API_KEY,
// SALT_APP_ID, APP_PUBLIC_KEY, APP_PRIVATE_KEY):
//   FAUCET_RPC_URL     - JSON-RPC endpoint for the testnet (e.g. Sepolia via dRPC/Infura)
//   FAUCET_PRIVATE_KEY - hex private key of a funded testnet wallet (TESTNET ONLY)
//   FAUCET_AMOUNT      - drip size in ETH units (default "0.01")
//   FAUCET_CHAIN_ID    - chain id of the testnet (default 11155111, Sepolia)
//
// Register it like any agent (POST /api/v1/agents) with this server's URL
// as the webhook, then it appears in the Agents directory and the new-user
// empty state -- one tap and a new user has testnet funds to play with.

require('dotenv').config();
const { ethers } = require('ethers');
const { createWebhookServer, createSaltClient, createIdentityStore, loadSaltAgentConfig, validateSaltAgentConfig } = require('salt-agent-sdk');

const config = loadSaltAgentConfig();
const missing = validateSaltAgentConfig(config);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
  process.exit(1);
}

const rpcUrl = process.env.FAUCET_RPC_URL;
const faucetKey = process.env.FAUCET_PRIVATE_KEY;
const dripAmount = process.env.FAUCET_AMOUNT || '0.01';
const chainId = parseInt(process.env.FAUCET_CHAIN_ID || '11155111', 10);

// One drip per Salt user per day -- in-memory is fine for a faucet; a
// restart forgiving a few extra drips of fake money is acceptable.
const DRIP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const lastDrip = new Map();

const client = createSaltClient({ host: config.host });
const identities = createIdentityStore();
identities.register({
  saltAppId: config.saltAppId,
  apiKey: config.saltApiKey,
  publicKey: config.appPublicKey,
  privateKey: config.appPrivateKey,
});

async function handleFaucetRequest(userId, text) {
  const addressMatch = text.match(/0x[a-fA-F0-9]{40}/);
  if (!addressMatch) {
    return [
      "Hi! I'm the Salt testnet faucet. 🚰",
      `Send me the address of one of your **testnet** wallets and I'll send you ${dripAmount} testnet ETH to play with.`,
      'Tip: your wallet addresses are on the Wallets tab — tap Receive to copy one.',
    ].join('\n');
  }

  const last = lastDrip.get(userId) || 0;
  if (Date.now() - last < DRIP_INTERVAL_MS) {
    const hoursLeft = Math.ceil((DRIP_INTERVAL_MS - (Date.now() - last)) / 3600000);
    return `You've already had a drip today — come back in about ${hoursLeft}h. ⏳`;
  }

  if (!rpcUrl || !faucetKey) {
    return "The faucet isn't configured with a funded wallet yet — ask the operator to set FAUCET_RPC_URL and FAUCET_PRIVATE_KEY.";
  }

  try {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);
    const wallet = new ethers.Wallet(faucetKey, provider);
    const tx = await wallet.sendTransaction({
      to: addressMatch[0],
      value: ethers.utils.parseEther(dripAmount),
    });
    lastDrip.set(userId, Date.now());
    return `Sent ${dripAmount} testnet ETH to ${addressMatch[0]} 🎉\nTx: ${tx.hash}\nIt should show up in a minute or two.`;
  } catch (error) {
    console.error('[FAUCET] drip failed:', error.message);
    return 'Something went wrong sending your drip — the faucet may be empty. Try again later.';
  }
}

async function onMessage(ctx) {
  const reply = await handleFaucetRequest(ctx.senderId, ctx.text);
  await ctx.reply(reply);
}

const server = createWebhookServer({
  client,
  identities,
  pgpPassphrase: config.pgpPassphrase,
  webhookSharedSecret: config.webhookSharedSecret,
  onMessage,
});

server.listen(process.env.PORT ? parseInt(process.env.PORT, 10) : 5001);
console.log(`Faucet agent listening on port ${process.env.PORT || 5001}`);
