import os from 'node:os';

/**
 * Local-network helpers.
 *
 * The event runs on a closed LAN — the coordinator's machine is the server
 * and every other machine reaches it over Ethernet or Wi-Fi. Its address is
 * handed out by DHCP and changes between rooms, so nothing may depend on a
 * hard-coded IP: origins are judged by "is this a private address", and the
 * URLs to hand out are read off the interfaces at boot.
 */

/** 10/8, 172.16/12, 192.168/16, 169.254/16 (link-local) and loopback. */
export function isPrivateIPv4(address) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(address || ''));
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function isLocalHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '[::1]') return true;
  return isPrivateIPv4(h);
}

/**
 * Every usable IPv4 this machine answers on, best first: a wired link before
 * Wi-Fi, and a real address before a 169.254 self-assigned one (which means
 * the cable is in but nothing handed out an address).
 */
export function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const selfAssigned = a.address.startsWith('169.254.');
      const wired = /ethernet|local area connection|^en|^eth/i.test(name);
      out.push({ name, address: a.address, wired, selfAssigned });
    }
  }
  return out.sort((x, y) => Number(x.selfAssigned) - Number(y.selfAssigned) || Number(y.wired) - Number(x.wired) || x.name.localeCompare(y.name));
}

/** The lines to read out to the room. */
export function lanUrls(port) {
  return lanAddresses().map((i) => ({ ...i, url: `http://${i.address}:${port}` }));
}
