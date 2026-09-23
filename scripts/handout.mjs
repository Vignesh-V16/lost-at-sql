#!/usr/bin/env node
/*
 * Build the handout folder — what you copy to every lab machine so nobody
 * types a URL.
 *
 *   npm run handout                 use this machine's name and address
 *   npm run handout -- --port 80    if you are serving on a different port
 *
 * Produces handout/ containing:
 *   Open LOST AT SQL.url   double-click: opens the default browser at the app
 *   Open LOST AT SQL.bat   same, for machines where .url is blocked
 *   READ ME.txt            the URLs written out, for the board
 *
 * Copy the folder to each machine's desktop (USB stick, or a shared folder),
 * or just copy the two shortcuts.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanAddresses } from '../server/src/utils/lan.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portArg = process.argv.indexOf('--port');
const port = portArg > -1 ? Number(process.argv[portArg + 1]) : 5173;
const suffix = port === 80 ? '' : `:${port}`;

const machine = os.hostname().toLowerCase();
const addresses = lanAddresses().filter((a) => !a.selfAssigned);
if (!addresses.length) {
  process.stderr.write('\nThis machine has no network address yet — plug in the cable or join the Wi-Fi, then run this again.\n\n');
  process.exit(1);
}

/* The address is first: it works on every machine, including any that
   cannot resolve a Windows machine name. The name is offered second. */
const primary = `http://${addresses[0].address}${suffix}`;
const fallback = `http://${machine}${suffix}`;

const dir = path.join(root, 'handout');
fs.mkdirSync(dir, { recursive: true });

fs.writeFileSync(path.join(dir, 'Open LOST AT SQL.url'), ['[InternetShortcut]', `URL=${primary}`, 'IconIndex=0', ''].join('\r\n'), 'utf8');

fs.writeFileSync(
  path.join(dir, 'Open LOST AT SQL.bat'),
  [
    '@echo off',
    'rem Opens the investigation in the default browser.',
    `start "" "${primary}"`,
    'rem If the name does not work on this machine, the line below uses the address instead.',
    `rem start "" "${fallback}"`,
    '',
  ].join('\r\n'),
  'utf8',
);

fs.writeFileSync(
  path.join(dir, 'READ ME.txt'),
  [
    'LOST AT SQL — Operation: Black Cipher',
    '',
    'On every lab machine, open a browser and go to:',
    '',
    `    ${primary}`,
    '',
    'If you prefer, this also works and is easier to remember:',
    '',
    `    ${fallback}`,
    '',
    'Or just double-click "Open LOST AT SQL" in this folder.',
    '',
    'Nothing needs installing. Sign in with the investigator ID and code you were given.',
    '',
    `Server: ${machine} (${addresses.map((a) => `${a.address} on ${a.name}`).join(', ')})`,
    'Keep the server window open on the coordinator machine for the whole event.',
    '',
  ].join('\r\n'),
  'utf8',
);

const line = (s = '') => process.stdout.write(`${s}\n`);
line('');
line(`Handout written to  ${dir}`);
line('');
line('  Open LOST AT SQL.url   double-click to launch the app');
line('  Open LOST AT SQL.bat   the same, if .url shortcuts are blocked');
line('  READ ME.txt            the URLs, for the board');
line('');
line(`  Primary : ${primary}`);
line(`  Fallback: ${fallback}`);
line('');
line('Copy this folder to each lab machine, or share it from this one.');
line('');
