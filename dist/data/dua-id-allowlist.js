import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(HERE, '..', '..', 'data', 'dua-id-allowlist.json');
function load() {
    try {
        const ids = JSON.parse(readFileSync(FILE, 'utf-8'));
        return Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
    }
    catch {
        return [];
    }
}
export const DUA_ID_ALLOWLIST = load();
//# sourceMappingURL=dua-id-allowlist.js.map