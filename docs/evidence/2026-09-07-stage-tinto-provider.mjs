// Bounded controller preparation for this recovery only. No build or host lifecycle.
// Review: node <script> [--apply-after-close]
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProviderBundle, PROVIDER_STAGED_ROOT } from '../../dist/installer/provider-source.js';
import { evaluateAttributedEntry } from '../../dist/installer/attributed-drift.js';
import { parseCanonicalIntegrationManifest, serializeIntegrationManifest } from '../../dist/installer/manifest.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const project = resolve(root, '../tinto');
const apply = process.argv[2] === '--apply-after-close';
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && apply));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = (relative) => {
  const path = resolve(project, relative);
  assert.ok(path.startsWith(project + '\\') || path.startsWith(project + '/'));
  assert.ok(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink());
  assert.equal(realpathSync(path).toLowerCase(), path.toLowerCase());
  return readFileSync(path, 'utf8');
};
const manifestPath = '.pumarejo/integration-manifest.json';
const manifestSource = source(manifestPath);
const manifest = parseCanonicalIntegrationManifest(manifestSource);
assert.equal(manifest.state, 'applied');
const configSource = source('.pumarejo.json');
assert.equal(hash(configSource), '782aa3eb3ff15e6cd1c9df433613f1dc2013f0b01e84ee1af8f0cf7c13bab7b7', 'review configuration changes first');
const reviewed = new Map([
  ['src/platform/windows.rs', ['8dd8f4b47b96388e1f527e53f84c10bb2f9f4c404d45d40e23451a4645f14fea', 'e4152677757f995d43b33615e23d1b5fc75bf7aa601c742ca5838a5de9685e87']],
  ['src/server/handlers/window.rs', ['28d96c190f3fec93b5d4549def06b90b3c90715458687659748d22d1f8a4fcd8', '91ef68bc3c39b45dd226f397ad1b1cf41263da6431e0204e9b1288e2c0c4dffb']],
  ['src/server/router.rs', ['96c710d1a36b0621b199c1a21376aab0a19ea00ece569f88a27e4bd1f5f27de3', '9b07fd2a96ed6af34570a8a7e2dc7b28159801f7e527100c55bf1be42646e0a6']],
]);
const bundle = await readProviderBundle();
const changes = [];
assert.equal(bundle.length, 46);
for (const entry of manifest.changes.filter(e => e.kind !== 'provider')) {
  assert.equal(evaluateAttributedEntry(entry, source(entry.relativePath), { expectedWindow: 'main' }).owned, 'intact', entry.relativePath);
}
for (const entry of bundle) {
  const relativePath = `${PROVIDER_STAGED_ROOT}/${entry.sourceRelativePath}`;
  const recorded = manifest.changes.find(e => e.relativePath === relativePath && e.kind === 'provider');
  assert.ok(recorded, relativePath);
  const before = source(relativePath);
  assert.equal(hash(before), recorded.afterHash, `unreviewed staged work: ${relativePath}`);
  if (before === entry.content) continue;
  assert.deepEqual([hash(before), hash(entry.content)], reviewed.get(entry.sourceRelativePath), relativePath);
  changes.push({ relativePath, before, after: entry.content, beforeHash: hash(before), afterHash: hash(entry.content) });
}
assert.equal(changes.length, 3, 'only the three reviewed source replacements are allowed');
console.log(JSON.stringify({ project, apply, changes: changes.map(({ before, after, ...receipt }) => receipt),
  preserved: ['.pumarejo.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/src/lib.rs'],
  limitation: 'init still rejects the deliberate config full-file hash drift; its fingerprint is not rewritten. Doctor should accept its intact attributed projection after source staging.' }, null, 2));
if (apply) {
  // Conservative offline gate: any native Tinto or Tinto Tauri dev command blocks.
  const processes = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'tinto.exe' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'tinto[\\/].*tauri.* dev') } | Select-Object ProcessId,CreationDate,Name) | ConvertTo-Json -Compress"], { encoding: 'utf8', windowsHide: true }).trim() || '[]');
  assert.equal(Array.isArray(processes) ? processes.length : 1, 0, 'controller must close Tinto and its Tauri launcher first');
  const backup = resolve(project, '.pumarejo', `provider-recovery-backup-${Date.now()}`);
  mkdirSync(backup);
  writeFileSync(resolve(backup, 'integration-manifest.json'), manifestSource);
  writeFileSync(resolve(backup, 'receipt.json'), JSON.stringify(changes, null, 2));
  // Recheck the read set before writing. Manifest hashes change only for real copies.
  assert.equal(source(manifestPath), manifestSource);
  assert.equal(source('.pumarejo.json'), configSource);
  for (const c of changes) assert.equal(source(c.relativePath), c.before);
  for (const c of changes) {
    writeFileSync(resolve(project, c.relativePath), c.after);
    assert.equal(hash(source(c.relativePath)), c.afterHash);
    manifest.changes.find(e => e.relativePath === c.relativePath).afterHash = c.afterHash;
  }
  writeFileSync(resolve(project, manifestPath), serializeIntegrationManifest(manifest));
  console.log(`Source staged; reviewed originals and receipt: ${backup}. No executable or DLL written.`);
}
