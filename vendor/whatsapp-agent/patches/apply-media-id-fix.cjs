"use strict";
// Both changes are included upstream in 1.34.8. Fail the build if the
// runtime is not the tested version or lacks either protection.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../node_modules/whatsapp-web.js");
const {version}=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
if(version!=="1.34.8") throw Error("Unexpected whatsapp-web.js version: "+version);
const client=fs.readFileSync(path.join(root,"src/Client.js"),"utf8");
const utils=fs.readFileSync(path.join(root,"src/util/Injected/Utils.js"),"utf8");
if(!client.includes("window.require?.('WAWebSocketModel')?.Socket?.state") || !client.includes("waitForFunction")) throw Error("Upstream socket readiness guard missing.");
if(!utils.includes("delete message.__x_id;")) throw Error("Upstream media ID fix missing.");
console.log("Verified upstream WhatsApp authentication readiness guard and media ID fix in "+version);
