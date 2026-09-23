// Prints the shared spec (FX and CINEMA from fx.js) as JSON, for the
// Python tools (erase.py, sprites.py).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(path.resolve(here, '../../client/src/components/intro/fx.js')).href);
process.stdout.write(JSON.stringify({ FX: mod.FX, CINEMA: mod.CINEMA }));
