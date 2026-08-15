#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
}

function readCargoVersion() {
  const cargoToml = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8');
  const match = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error('Could not find package version in src-tauri/Cargo.toml');
  }
  return match[1];
}

const versions = {
  'package.json': readJson('package.json').version,
  'src-tauri/Cargo.toml': readCargoVersion(),
  'src-tauri/tauri.conf.json': readJson('src-tauri/tauri.conf.json').version,
};

const uniqueVersions = new Set(Object.values(versions));

if (uniqueVersions.size !== 1) {
  console.error('Desktop version mismatch:');
  for (const [file, version] of Object.entries(versions)) {
    console.error(`- ${file}: ${version ?? '<missing>'}`);
  }
  process.exit(1);
}

console.log(`Desktop versions aligned: ${versions['package.json']}`);
