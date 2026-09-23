import { env } from '../config/env.js';
import { isLocalHostname } from './lan.js';

/**
 * Is this browser allowed to talk to the API?
 *
 * Three ways in:
 *   • no Origin header at all — a same-origin request, or a non-browser client;
 *   • an origin listed in CLIENT_ORIGIN;
 *   • any address on the local network, while ALLOW_LAN_ORIGINS is on.
 *
 * The third is what lets a room of machines work over Ethernet or Wi-Fi
 * without anyone editing a config when DHCP hands out a different address.
 * It is deliberately limited to private ranges: a public host is never
 * allowed in this way.
 */
export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (env.clientOrigins.includes(origin)) return true;
  if (!env.ALLOW_LAN_ORIGINS) return false;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return isLocalHostname(hostname);
  } catch {
    return false;
  }
}
