/** Minimal cookie parser (no dependency) — populates req.cookies. */
export function cookies(req, _res, next) {
  const header = req.headers.cookie;
  const out = {};
  if (header) {
    for (const part of header.split(';')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const key = part.slice(0, eq).trim();
      if (!key) continue;
      try {
        out[key] = decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        out[key] = part.slice(eq + 1).trim();
      }
    }
  }
  req.cookies = out;
  next();
}
