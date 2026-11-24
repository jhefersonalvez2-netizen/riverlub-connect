'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const puppeteer=require('puppeteer');
const {Client,LocalAuth}=require('whatsapp-web.js');
(async()=>{
 const candidates=[process.env.RIVERLUB_AGENT_CHROME_PATH, ...[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).flatMap(dir=>[path.join(dir,'Google','Chrome','Application','chrome.exe'),path.join(dir,'Microsoft','Edge','Application','msedge.exe')])].filter(Boolean);
 const executablePath=candidates.find(p=>fs.existsSync(p));
 assert.ok(executablePath,'Local Chrome or Edge required');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'riverlub-browser-ci-'));
 let browser;
 try {
  assert.equal(typeof Client,'function'); assert.equal(typeof LocalAuth,'function');
  assert.equal(typeof puppeteer.launch,'function');
  browser=await puppeteer.launch({executablePath,headless:true,userDataDir:dir,protocol:'cdp',args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage();
  await page.setContent('<html><body><p id="ready">RiverLub</p></body></html>');
  assert.equal(await page.$eval('#ready',el=>el.textContent),'RiverLub');
  await page.evaluate(()=>{window.require=()=>null;setTimeout(()=>{window.require=()=>({Socket:{state:'UNPAIRED'}})},150)});
  await page.waitForFunction(()=>window.require?.('WAWebSocketModel')?.Socket?.state,{timeout:5000});
  assert.equal(await page.evaluate(()=>window.require('WAWebSocketModel').Socket.state),'UNPAIRED');
  const pdf=await page.pdf({format:'A4'});assert.ok(Buffer.from(pdf).subarray(0,4).toString()==='%PDF');
  console.log('PASS: local Chromium launch, CDP, delayed Socket, DOM and PDF; no WhatsApp connection or messages.');
 } finally {if(browser)await browser.close();fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e);process.exitCode=1});
