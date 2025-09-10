#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

import os from 'os';

function usage() {
  console.error('Usage:');
  console.error('  npm run set:api -- http://LAN_IP:5000 [true|false]');
  console.error('  npm run set:api:auto              # auto-detect LAN IP, port 5000');
  process.exit(1);
}

let apiBase = process.argv[2];
const forceWebRecorderArg = (process.argv[3] || '').toLowerCase();
const forceWebRecorder = forceWebRecorderArg === 'true' ? 'true' : 'false';

function pickLanIp(): string | null {
  const ifaces = os.networkInterfaces();
  const candidates: string[] = [];
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        const ip = info.address;
        if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
          candidates.push(ip);
        }
      }
    }
  }
  return candidates[0] || null;
}

if (!apiBase || apiBase.toLowerCase() === 'auto') {
  const ip = pickLanIp();
  if (!ip) {
    console.error('Could not auto-detect a LAN IPv4 address.');
    usage();
  }
  apiBase = `http://${ip}:5000`;
}

try {
  const u = new URL(apiBase);
  if (!/^https?:$/.test(u.protocol)) throw new Error('API must be http/https');
} catch (e) {
  console.error('Invalid API URL:', (e as Error).message);
  usage();
}

const clientDir = path.resolve(process.cwd(), 'client');
const envProdPath = path.join(clientDir, '.env.production');
const envLocalPath = path.join(clientDir, '.env.local');

const content = `VITE_API_BASE=${apiBase}\nVITE_UPLOAD_BASE=${apiBase}\nVITE_FORCE_WEB_RECORDER=${forceWebRecorder}\n`;

fs.mkdirSync(clientDir, { recursive: true });
fs.writeFileSync(envProdPath, content, 'utf8');
try { fs.writeFileSync(envLocalPath, content, 'utf8'); } catch {}

console.log('Wrote', envProdPath);
console.log('Wrote', envLocalPath);
console.log('VITE_API_BASE =', apiBase);
console.log('VITE_FORCE_WEB_RECORDER =', forceWebRecorder);
