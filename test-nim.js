require('dotenv').config({path:'.env.local'});
const { draftPost } = require('./lib/nim');
(async () => {
  const r = await draftPost('Write one sentence about Philippine news.');
  console.log('OK:', r.text.slice(0,120));
  console.log('tokens', r.inputTokens, r.outputTokens);
})().catch(e=>console.error('FAIL:', e.message));