import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const readGit = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: 'inherit' });

if (readGit('branch', '--show-current') !== 'main') throw new Error('Deploy from main.');
if (readGit('status', '--porcelain')) throw new Error('Commit the reviewed source changes before deploying.');
const commit = readGit('rev-parse', 'HEAD');
const remote = readGit('remote', 'get-url', 'origin');
const author = readGit('config', 'user.name');
const email = readGit('config', 'user.email');

run('npm', ['run', 'build']);
run('git', ['push', 'origin', 'main']);
const staging = mkdtempSync(path.join(tmpdir(), 'swiftbook-pages-'));
try {
  run('git', ['clone', '--quiet', '--depth=1', '--single-branch', '--branch', 'gh-pages', remote, staging]);
  // Replace only generated files in this disposable clone, preserving Pages history.
  run('rsync', ['-a', '--delete', '--exclude=.git', '--exclude=server.cjs', '--exclude=server.cjs.map',
    `${path.join(root, 'dist')}/`, `${staging}/`]);
  writeFileSync(path.join(staging, '.nojekyll'), '');
  run('git', ['add', '-A'], staging);
  run('git', ['-c', `user.name=${author}`, '-c', `user.email=${email}`, 'commit', '--quiet', '-m',
    `Deploy Swiftbook from ${commit.slice(0, 7)}`], staging);
  run('git', ['push', 'origin', 'gh-pages'], staging);
  console.log(`Published source ${commit.slice(0, 7)} to gh-pages. Verify /swiftbook/build-info.json on the public site.`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
