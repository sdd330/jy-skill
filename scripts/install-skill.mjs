#!/usr/bin/env node
/**
 * 将 npm 包安装到 Cursor skills 目录（jy）
 *
 * jy-skill install [--global] [--copy] [--force]
 */

import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_NAME = 'jy';

function printHelp() {
  console.log(`Usage: jy-skill install [options]

Install @sdd330dev/jy-skill into Cursor skills directory as "${SKILL_NAME}".

Options:
  --global   Install to ~/.cursor/skills/${SKILL_NAME}
  --copy     Copy files instead of symlink (default: symlink, fallback to copy)
  --force    Overwrite existing installation
  -h, --help Show this help
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    return { command: 'help' };
  }
  if (args[0] !== 'install') {
    console.error(`Unknown command: ${args[0] ?? '(none)'}`);
    printHelp();
    process.exit(1);
  }
  return {
    command: 'install',
    global: args.includes('--global'),
    copy: args.includes('--copy'),
    force: args.includes('--force'),
  };
}

function getTargetDir(global) {
  if (global) {
    return join(homedir(), '.cursor', 'skills', SKILL_NAME);
  }
  return join(process.cwd(), '.cursor', 'skills', SKILL_NAME);
}

function removeExisting(targetDir) {
  if (!existsSync(targetDir)) return;
  const stat = lstatSync(targetDir);
  if (stat.isSymbolicLink() || stat.isDirectory()) {
    rmSync(targetDir, { recursive: true, force: true });
    return;
  }
  rmSync(targetDir, { force: true });
}

function installWithSymlink(targetDir) {
  mkdirSync(dirname(targetDir), { recursive: true });
  symlinkSync(PACKAGE_ROOT, targetDir, 'dir');
}

function installWithCopy(targetDir) {
  mkdirSync(dirname(targetDir), { recursive: true });
  cpSync(PACKAGE_ROOT, targetDir, {
    recursive: true,
    filter: (src) => !src.includes(`${join(PACKAGE_ROOT, 'node_modules')}`),
  });
  mkdirSync(join(targetDir, 'save'), { recursive: true });
}

function install(options) {
  const targetDir = getTargetDir(options.global);

  if (existsSync(targetDir) && !options.force) {
    console.error(`Already installed at ${targetDir}`);
    console.error('Use --force to overwrite.');
    process.exit(1);
  }

  if (existsSync(targetDir)) {
    removeExisting(targetDir);
  }

  if (options.copy) {
    installWithCopy(targetDir);
    console.log(`Copied skill to ${targetDir}`);
  } else {
    try {
      installWithSymlink(targetDir);
      console.log(`Linked skill to ${targetDir}`);
    } catch {
      installWithCopy(targetDir);
      console.log(`Symlink failed; copied skill to ${targetDir}`);
    }
  }

  console.log('');
  console.log('Next: open the project in Cursor and say「jy」or「开始游戏」.');
}

const options = parseArgs(process.argv);

if (options.command === 'help') {
  printHelp();
  process.exit(0);
}

install(options);
