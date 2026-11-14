// Copies the production Angular build into the .NET API's wwwroot,
// so `dotnet run` serves the whole app (UI + API) from one address.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../dist/frontend/browser');
const target = resolve(here, '../../backend/MoneyFlow.Api/wwwroot');

if (!existsSync(source)) {
  console.error(`Build output not found at ${source}. Run "ng build" first.`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`Copied ${source} -> ${target}`);
