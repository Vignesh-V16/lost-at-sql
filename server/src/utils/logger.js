/* Small structured logger. Keeps output readable in a terminal without a dependency. */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function write(level, message, meta) {
  if (LEVELS[level] < threshold) return;
  const tag = `[LOST-AT-SQL ${level.toUpperCase().padEnd(5)}]`;
  const line = `${stamp()} ${tag} ${message}`;
  if (meta instanceof Error) {
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](line, '\n', meta.stack || meta.message);
  } else if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](line, typeof meta === 'string' ? meta : JSON.stringify(meta));
  } else {
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](line);
  }
}

export const logger = {
  debug: (m, meta) => write('debug', m, meta),
  info: (m, meta) => write('info', m, meta),
  warn: (m, meta) => write('warn', m, meta),
  error: (m, meta) => write('error', m, meta),
};
