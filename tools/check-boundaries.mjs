#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const ALLOWED = {
  ui: ['ui', 'application', 'domain', 'campusops'],
  application: ['application', 'domain', 'campusops'],
  domain: ['domain', 'campusops'],
  infrastructure: ['infrastructure', 'domain', 'campusops'],
};

function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function layerOf(file) {
  const rel = relative(SRC, file);
  return rel.split(sep)[0] ?? null;
}

function isRelative(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function parseImports(source) {
  const specifiers = [];
  const staticRegex = /(?:import|export)\s+(?:type\s+)?(?:[\w$*{},\s]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let match = staticRegex.exec(source);
  while (match) {
    specifiers.push(match[1]);
    match = staticRegex.exec(source);
  }
  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  match = dynamicRegex.exec(source);
  while (match) {
    specifiers.push(match[1]);
    match = dynamicRegex.exec(source);
  }
  return specifiers;
}

function main() {
  const violations = [];
  let checked = 0;
  for (const file of listFiles(SRC)) {
    const fromLayer = layerOf(file);
    if (!fromLayer || fromLayer === 'campusops') {
      continue;
    }
    const source = readFileSync(file, 'utf8');
    for (const specifier of parseImports(source)) {
      if (!isRelative(specifier)) {
        continue;
      }
      const target = resolve(dirname(file), specifier);
      if (!target.startsWith(SRC + sep)) {
        continue;
      }
      const toLayer = layerOf(target);
      if (!toLayer || toLayer === 'campusops') {
        continue;
      }
      checked += 1;
      if (ALLOWED[fromLayer] && !ALLOWED[fromLayer].includes(toLayer)) {
        violations.push(
          `${relative(ROOT, file)} -> ${relative(ROOT, target)} (${fromLayer} -> ${toLayer})`,
        );
      }
    }
  }
  if (violations.length > 0) {
    console.error('Arquitectura: se detectaron violaciones de límites:');
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `OK: ${checked} dependencias internas respetan los límites (ui/application/domain/infrastructure).`,
    );
  }
}

main();