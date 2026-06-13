#!/usr/bin/env node
// snapshot.mjs — emit `relpath<TAB>sha256` for every file under a root, sorted.
// Used to mechanically diff the implement-screen-001 run dir between checkpoints
// without mutating the run dir or relying on a git repo. (dry-run evaluation helper)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.argv[2]);
const rows = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      walk(full);
    } else if (e.isFile()) {
      const rel = path.relative(root, full).split(path.sep).join('/');
      const hash = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      rows.push(`${rel}\t${hash}`);
    }
  }
}
walk(root);
rows.sort();
process.stdout.write(rows.join('\n') + '\n');
