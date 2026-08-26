// Minimal third-party Salt agent, built on salt-agent-sdk. Everything about
// talking to Salt (webhook receiving, PGP decrypt/encrypt, recipient
// resolution, replying) is handled by the SDK; the only thing this file
// owns is "what to say" -- forwarding the message to a local inference
// server (e.g. LM Studio, `http://localhost:1234`, OpenAI-compatible) and
// replying with whatever it says back. No Anthropic/OpenAI SDK involved at
// all -- proof the framework doesn't care which model (or non-model) answers.

require('dotenv').config();
const axios = require('axios');
const { createWebhookServer, createSaltClient, createIdentityStore, loadSaltAgentConfig, validateSaltAgentConfig } = require('salt-agent-sdk');

const config = loadSaltAgentConfig();
const missing = validateSaltAgentConfig(config);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
  process.exit(1);
}

const client = createSaltClient({ host: config.host });
const identities = createIdentityStore();
identities.register({
  saltAppId: config.saltAppId,
  apiKey: config.saltApiKey,
  publicKey: config.appPublicKey,
  privateKey: config.appPrivateKey,
});

async function sendToInferenceServer(message) {
  const url = 'http://localhost:1234/v1/chat/completions';
  const data = {
    messages: [{ role: 'user', content: message }],
    temperature: 0.7,
    max_tokens: -1,
    stream: false,
  };
  try {
    const response = await axios.post(url, data, { headers: { 'Content-Type': 'application/json' } });
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('[inference] request failed:', error.message);
    return "Sorry, I couldn't reach my inference server just now.";
  }
}

async function onMessage(ctx) {
  console.log(`[chat ${ctx.chatId}] <- ${ctx.text}`);
  const replyText = await sendToInferenceServer(ctx.text);
  console.log(`[chat ${ctx.chatId}] -> ${replyText}`);
  await ctx.reply(replyText);
}

const server = createWebhookServer({
  client,
  identities,
  pgpPassphrase: config.pgpPassphrase,
  verifySignatures: config.verifySignatures,
  onMessage,
});

server.listen(config.port);
