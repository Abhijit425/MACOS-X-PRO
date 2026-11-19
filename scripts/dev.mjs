import { spawn, execSync } from 'node:child_process';
execSync('node scripts/build-main.mjs', { stdio: 'inherit' });
const vite = spawn('npx', ['vite'], { stdio: 'inherit', shell: true });
setTimeout(() => {
  const el = spawn('npx', ['electron', '.'], { stdio: 'inherit', shell: true, env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5173' } });
  el.on('exit', () => { vite.kill(); process.exit(0); });
}, 2500);
