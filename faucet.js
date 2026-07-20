// Testnet faucet agent for Salt.
//
// A worked example of an agent that *transacts*: message it an EVM address
// (or just say "drip") and it sends you a small amount of testnet coin from
// its funded faucet wallet, then replies in-chat with the tx hash.
//
// Run with: node faucet.js
// Needs .env with, in addition to the base agent vars (HOST, SALT_API_KEY,
// SALT_APP_ID, APP_PUBLIC_KEY, APP_PRIVATE_KEY, USER_PUBLIC_KEY):
//   FAUCET_RPC_URL     - JSON-RPC endpoint for the testnet (e.g. Sepolia via dRPC/Infura)
//   FAUCET_PRIVATE_KEY - hex private key of a funded testnet wallet (TESTNET ONLY)
//   FAUCET_AMOUNT      - drip size in ETH units (default "0.01")
//   FAUCET_CHAIN_ID    - chain id of the testnet (default 11155111, Sepolia)
//
// Register it like any agent (POST /api/v1/agents) with this server's URL
// as the webhook, then it appears in the Agents directory and the new-user
// empty state -- one tap and a new user has testnet funds to play with.

require('dotenv').config();
const express = require('express');
const openpgp = require('openpgp');
const axios = require('axios');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST;

const userPublicKey = process.env.USER_PUBLIC_KEY;
const appPublicKey = process.env.APP_PUBLIC_KEY;
const appPrivateKey = process.env.APP_PRIVATE_KEY;
const saltAppId = process.env.SALT_APP_ID;
const apiKey = process.env.SALT_API_KEY;

const rpcUrl = process.env.FAUCET_RPC_URL;
const faucetKey = process.env.FAUCET_PRIVATE_KEY;
const dripAmount = process.env.FAUCET_AMOUNT || '0.01';
const chainId = parseInt(process.env.FAUCET_CHAIN_ID || '11155111', 10);

// One drip per Salt user per day -- in-memory is fine for a faucet; a
// restart forgiving a few extra drips of fake money is acceptable.
const DRIP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const lastDrip = new Map();

app.use(express.json());

app.post('/', async (req, res) => {
  // Always 200 quickly -- webhook retries would double-drip.
  res.status(200).json({ response: 'Thanks!' });

  const message = req.body.message;
  if (!message || parseInt(message.user.id) === parseInt(saltAppId)) {
    return;
  }

  const chatId = message.chat_id;
  const text = await decryptWithPrivateKey(message.message, appPrivateKey, 'salt');
  if (text === undefined) {
    return;
  }

  const reply = await handleFaucetRequest(message.user.id, text);
  await sendReply(chatId, reply);
});

async function handleFaucetRequest(userId, text) {
  const addressMatch = text.match(/0x[a-fA-F0-9]{40}/);
  if (!addressMatch) {
    return [
      'Hi! I\'m the Salt testnet faucet. 🚰',
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
    return 'The faucet isn\'t configured with a funded wallet yet — ask the operator to set FAUCET_RPC_URL and FAUCET_PRIVATE_KEY.';
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

async function sendReply(chatId, plaintext) {
  try {
    const encryptedMessage = await encryptWithPublicKey(plaintext, userPublicKey);
    const senderEncryptedMessage = await encryptWithPublicKey(plaintext, appPublicKey);
    await axios.post(
      `${HOST}/api/v1/messages`,
      { chat_id: chatId, message: encryptedMessage, sender_message: senderEncryptedMessage },
      { headers: { 'api-key': apiKey } }
    );
  } catch (error) {
    console.error('[FAUCET] reply failed:', error.message);
  }
}

async function encryptWithPublicKey(message, publicKey) {
  const publicKeyObj = await openpgp.readKey({ armoredKey: publicKey });
  return openpgp.encrypt({
    message: await openpgp.createMessage({ text: message }),
    encryptionKeys: publicKeyObj,
  });
}

async function decryptWithPrivateKey(encryptedMessage, privateKey, passphrase) {
  try {
    const privateKeyObj = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey: privateKey }),
      passphrase: passphrase,
    });
    const { data: decrypted } = await openpgp.decrypt({
      message: await openpgp.readMessage({ armoredMessage: encryptedMessage }),
      decryptionKeys: [privateKeyObj],
    });
    return decrypted;
  } catch (error) {
    console.log('[FAUCET][DWPK]', error.message);
    return undefined;
  }
}

app.listen(PORT, () => {
  console.log(`Faucet agent listening on port ${PORT}`);
});
