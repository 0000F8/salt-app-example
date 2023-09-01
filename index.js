require('dotenv').config();
const express = require('express');
const openpgp = require('openpgp');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST;

const userPublicKey = process.env.USER_PUBLIC_KEY;
const appPublicKey = process.env.APP_PUBLIC_KEY;
const appPrivateKey = process.env.APP_PRIVATE_KEY;

const apiKey = process.env.SALT_API_KEY;

app.use(express.json()); // Parse JSON request body

app.post('/', async (req, res) => {
  const message = req.body.message;
  const chatId = req.body.message.chat_id;


  const incomingEncryptedMessage = message.message;

  // Decrypt message using app's private key
  const incomingDecryptedMessage = await decryptWithPrivateKey(incomingEncryptedMessage, appPrivateKey, 'salt');

  if(incomingDecryptedMessage === undefined) {
    res.json({success: 'undefined'});
  }
  console.log('[INCOMING DECRYPTED MSG]:', incomingDecryptedMessage);


  const inferenceResponse = await sendToInferenceServer(incomingDecryptedMessage);

  console.log('[INCOMING INFERENCE]', inferenceResponse);

  // Encrypt messages for the user and sender
  // const encryptedMessage = await encryptWithPublicKey(incomingDecryptedMessage, userPublicKey);
  // const senderEncryptedMessage = await encryptWithPublicKey(incomingDecryptedMessage, appPublicKey);

  const encryptedMessage = await encryptWithPublicKey(inferenceResponse, userPublicKey);
  const senderEncryptedMessage = await encryptWithPublicKey(inferenceResponse, appPublicKey);

  //console.log('[OUTGOING msgs]', encryptedMessage, senderEncryptedMessage);

  const saltResponse = await sendToSalt(chatId, encryptedMessage, senderEncryptedMessage);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

async function encryptWithPublicKey(message, publicKey) {
  try {

  const publicKeyObj = await openpgp.readKey({ armoredKey: publicKey });
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: message }),
    encryptionKeys: publicKeyObj,
  });
  return encrypted;
  } catch (error) {
    console.log('[EWPK]', error);
  }
}

async function decryptWithPrivateKey(encryptedMessage, privateKey, passphrase) {
  try {

  const privateKeyObj = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKey }),
    passphrase: passphrase, // Provide the passphrase here
  });
  const { data: decrypted } = await openpgp.decrypt({
    message: await openpgp.readMessage({ armoredMessage: encryptedMessage }),
    decryptionKeys: [privateKeyObj],
  });
  return decrypted;
  } catch (error) {
    console.log('[DWPK]', error);
    return "Sorry. I didn't get that.";
  }
}

async function sendToSalt(chatId, encryptedMessage, senderEncryptedMessage) {
  const params = {
    chat_id: chatId,
    message: encryptedMessage,
    sender_message: senderEncryptedMessage,
  }

  try {
    const response = await axios.post(
      `${HOST}/api/v1/messages`,
      params,
      {
        headers: {
          'api-key': apiKey,
        },
      }
    );

    console.log('Response from remote host:', response.data);
    //res.json({ chat_id: chatId, message: encryptedMessage });
  } catch (error) {
    console.error('[SendToSalt] Error sending response:', error.message);
    //res.status(500).json({ error: 'Failed to send response' });
  }
}

async function sendToInferenceServer(message) {
  const url = 'http://localhost:1234/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json'
  };

  const data = {
    messages: [
      { role: 'user', content: `### Instruction: ${message}.\n###Response:` }
    ],
    temperature: 0.7,
    max_tokens: -1,
    stream: false
  };

  try {
    const response = await axios.post(url, data, { headers });
    console.log('[STIS] Response:', response.data);
    console.log('[STIS] Response:', response.data.choices[0]);
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('[STIS] Error:', error.message);
  }
}