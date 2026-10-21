#!/usr/bin/env node
// Gzips raw logs under logs/ and regenerates index.json. Run from repo root.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const LOGS = path.join(ROOT, 'logs');
const INDEX = path.join(ROOT, 'index.json');
const EXTS = ['.wpilog', '.wpilogxz', '.rlog', '.dslog', '.dsevents', '.csv'];
const WARN_BYTES = 95 * 1024 * 1024;
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

const warnings = [];
const converted = [];
const warn = (m) => { warnings.push(m); console.warn('WARNING: ' + m); };

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || /^readme/i.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}
const rel = (p, base) => path.relative(base, p).split(path.sep).join('/');

function classify(name) {
  const lower = name.toLowerCase();
  const gz = lower.endsWith('.gz');
  const base = gz ? lower.slice(0, -3) : lower;
  const ext = EXTS.find((e) => base.endsWith(e));
  return { gz, ext };
}

// Convert raw files, warn on unknown ones
for (const f of walk(LOGS).sort()) {
  const name = path.basename(f);
  const { gz, ext } = classify(name);
  if (!ext) {
    warn(`Unrecognized or unsupported file (left alone): ${rel(f, ROOT)}`);
    continue;
  }
  if (gz || ext === '.wpilogxz') continue;
  const before = fs.statSync(f).size;
  const data = zlib.gzipSync(fs.readFileSync(f), { level: 9 });
  fs.writeFileSync(f + '.gz', data);
  fs.unlinkSync(f);
  console.log(`Compressed ${rel(f, ROOT)}: ${mb(before)} -> ${mb(data.length)}`);
  converted.push(rel(f, ROOT));
  if (data.length > WARN_BYTES) {
    warn(`${rel(f + '.gz', ROOT)} is ${mb(data.length)}; GitHub rejects files over 100 MB.`);
  }
}

// Git first-added dates in a single pass (oldest wins)
function gitDates() {
  const map = new Map();
  try {
    const out = execFileSync('git', ['-c', 'core.quotepath=false', 'log', '--diff-filter=A', '--no-renames',
      '--name-only', '--format=%x01%cI', '--', 'logs'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    // git log is newest first; later assignments (older commits) overwrite
    for (const chunk of out.split('\x01')) {
      const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) continue;
      for (const file of lines.slice(1)) map.set(file, lines[0]);
    }
  } catch { /* not a repo / no commits: fall back to mtime */ }
  return map;
}
const gitDate = gitDates();

function uncompressedSize(f, stored) {
  if (stored < 4) return 0;
  const fd = fs.openSync(f, 'r');
  try {
    const b = Buffer.alloc(4);
    fs.readSync(fd, b, 0, 4, stored - 4);
    return b.readUInt32LE(0);
  } finally { fs.closeSync(fd); }
}

const AKIT = /akit_(\d{2})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/;
const logs = [];
for (const f of walk(LOGS)) {
  const name = path.basename(f);
  const { gz, ext } = classify(name);
  if (!ext) continue;
  const st = fs.statSync(f);
  const file = rel(f, ROOT);
  let date = null;
  const m = AKIT.exec(name);
  if (m) {
    date = `20${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
    if (isNaN(Date.parse(date))) date = null;
  }
  if (!date) {
    const g = gitDate.get(file);
    date = g ? new Date(g).toISOString() : st.mtime.toISOString();
  }
  const size = gz ? uncompressedSize(f, st.size) : st.size;
  if (size === 0) {
    warn(`Empty log (not indexed; consider deleting it): ${file}`);
    continue;
  }
  logs.push({
    path: rel(f, LOGS).replace(/\.gz$/i, ''),
    file,
    encoding: gz ? 'gzip' : null,
    size,
    compressedSize: st.size,
    date,
  });
}
logs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

let changed = true;
if (fs.existsSync(INDEX)) {
  try {
    const old = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
    changed = JSON.stringify(old.logs) !== JSON.stringify(logs);
  } catch { changed = true; }
}
if (changed) {
  fs.writeFileSync(INDEX, JSON.stringify({ generatedAt: new Date().toISOString(), logs }, null, 1) + '\n');
  console.log(`Wrote index.json (${logs.length} logs)`);
} else {
  console.log(`index.json unchanged (${logs.length} logs)`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  let md = `### Log index\n\n- Logs indexed: ${logs.length}\n- index.json ${changed ? 'updated' : 'unchanged'}\n- Converted: ${converted.length}\n`;
  for (const c of converted) md += `  - \`${c}\`\n`;
  if (warnings.length) {
    md += `\n**Warnings**\n`;
    for (const w of warnings) md += `- ${w}\n`;
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}
