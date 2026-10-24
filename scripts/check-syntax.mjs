import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
function walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) walk(path);
    else if (path.endsWith('.js') || path.endsWith('.mjs')) {
      execFileSync(process.execPath, ['--check', path]);
      console.log('OK', path);
    }
  }
}
walk('src');
