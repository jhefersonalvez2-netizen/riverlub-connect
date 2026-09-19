const fs = require('node:fs');
const path = require('node:path');

// Upstream: https://github.com/wwebjs/whatsapp-web.js/commit/78924aea793ddc93e03ddefff8d9da526420ec5a
const packageDir = path.resolve(__dirname, '../node_modules/whatsapp-web.js');
const { version } = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
if (version !== '1.34.7') {
  throw new Error(`Expected whatsapp-web.js 1.34.7, got ${version}; patch aborted.`);
}

const target = path.join(packageDir, 'src/util/Injected/Utils.js');
const original = fs.readFileSync(target, 'utf8');
const source = original.replace(/\r\n/g, '\n');
const before = '            ...extraOptions,\n        };\n';
const after = `${before}\n        delete message.__x_id;\n`;
const sendStart = source.indexOf('    window.WWebJS.sendMessage = async');
const sendEnd = source.indexOf('\n    window.WWebJS.', sendStart + 1);
if (sendStart < 0 || sendEnd < 0) {
  throw new Error('Cannot locate WWebJS.sendMessage; patch aborted.');
}
const sendSource = source.slice(sendStart, sendEnd);
const messageStart = sendSource.indexOf('const message = {');
const anchor = sendSource.indexOf(before, messageStart);
if (messageStart < 0 || anchor < 0 || sendSource.indexOf(before, anchor + 1) !== -1) {
  throw new Error('Unexpected message construction in WWebJS.sendMessage; patch aborted.');
}
const patched = sendSource.includes(after)
  ? source
  : source.slice(0, sendStart + anchor) + after + source.slice(sendStart + anchor + before.length);
if (patched.split('delete message.__x_id;').length !== 2 ||
    !patched.slice(sendStart, sendStart + sendSource.length + after.length).includes(after)) {
  throw new Error('Media ID fix verification failed; patch aborted.');
}
if (patched !== source) {
  fs.writeFileSync(target, original.includes('\r\n') ? patched.replace(/\n/g, '\r\n') : patched);
}
const installed = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
if (installed !== patched) {
  throw new Error('Installed media ID fix does not match expected source.');
}
console.log(`Verified whatsapp-web.js ${version}: delete message.__x_id; immediately after message construction in WWebJS.sendMessage.`);
