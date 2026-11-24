const fs = require('node:fs');
const path = require('node:path');

// 1.34.8 includes upstream auth readiness and media ID fixes.
// Verify instead of mutating the installed library.
const packageDir = path.resolve(__dirname, '../node_modules/whatsapp-web.js');
const {version} = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
if (version !== '1.34.8') throw new Error('Unexpected whatsapp-web.js version: '+version);
const client = fs.readFileSync(path.join(packageDir,'src/Client.js'),'utf8');
const utils = fs.readFileSync(path.join(packageDir,'src/util/Injected/Utils.js'),'utf8');
const inject = client.slice(client.indexOf('async inject('),client.indexOf('async initialize('));
if (!inject.includes('waitForFunction') || !inject.includes("window.require?.('WAWebSocketModel')?.Socket?.state")) {
  throw new Error('Upstream auth readiness guard missing');
}
if (!/delete\s+message\.__x_id\s*;/.test(utils)) throw new Error('Upstream media ID fix missing');
console.log('Verified whatsapp-web.js 1.34.8: auth readiness and media ID fixes.');
