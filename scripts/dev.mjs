import { spawn } from 'node:child_process';

const procs = [
  ['engine', 'npm', ['run', 'dev', '--prefix', 'backend'], '\x1b[36m'],
  ['web   ', 'npm', ['run', 'dev', '--prefix', 'frontend'], '\x1b[35m'],
];

for (const [name, cmd, args, color] of procs) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const pipe = (stream) =>
    stream.on('data', (d) =>
      String(d)
        .split('\n')
        .filter(Boolean)
        .forEach((line) => console.log(`${color}[${name}]\x1b[0m ${line}`)),
    );
  pipe(p.stdout);
  pipe(p.stderr);
  p.on('exit', (code) => console.log(`${color}[${name}]\x1b[0m exited with ${code}`));
}
