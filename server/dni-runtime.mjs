import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAutoSync } from './dni-auto-sync.mjs';
import './dni-server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

await startAutoSync({
  root: ROOT,
  onUpdated: async ({ head }) => {
    console.log(`[DNI AUTO-SYNC] restart requested for ${head.slice(0, 12)}`);
    setTimeout(() => process.exit(75), 500);
  }
});
