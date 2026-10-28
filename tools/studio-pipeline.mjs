import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(new URL('./studio-pipeline/package.json', import.meta.url));
const { runQA } = await import(pathToFileURL(require.resolve('@ratlab/studio-tools/qa')).href);
process.exitCode = await runQA({root:fileURLToPath(new URL('../',import.meta.url)),game:'umbral'});

