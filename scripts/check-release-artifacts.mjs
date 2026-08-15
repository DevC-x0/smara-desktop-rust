#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundleRoot = resolve(root, 'src-tauri/target/release/bundle');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const tauriConfig = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const version = packageJson.version;
const productName = tauriConfig.productName;

const expectedArtifacts = [
  join(bundleRoot, 'deb', `${productName}_${version}_amd64.deb`),
  join(bundleRoot, 'rpm', `${productName}-${version}-1.x86_64.rpm`),
];

const missing = expectedArtifacts.filter((artifact) => !existsSync(artifact));
if (missing.length > 0) {
  console.error('Release artifact check failed. Missing expected artifact(s):');
  for (const artifact of missing) {
    console.error(`- ${relative(root, artifact)}`);
  }
  console.error('Run `npm run build` first, then rerun `npm run check:release-artifacts`.');
  process.exit(1);
}

const lines = expectedArtifacts.map((artifact) => {
  const digest = createHash('sha256').update(readFileSync(artifact)).digest('hex');
  const bundleRelativePath = relative(bundleRoot, artifact).replaceAll('\\', '/');
  return `${digest}  ${bundleRelativePath}`;
});

const checksumPath = join(bundleRoot, 'SHA256SUMS');
writeFileSync(checksumPath, `${lines.join('\n')}\n`, 'utf8');

console.log(`Release artifacts verified for ${productName} ${version}:`);
for (const line of lines) {
  console.log(`- ${line}`);
}
console.log(`Wrote ${relative(root, checksumPath)}`);
