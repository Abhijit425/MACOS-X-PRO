// Packages MACOS X PRO for Windows x64:
//  1. electron-builder → release/win-unpacked
//  2. embed icon + version info into the .exe (pure JS, no Wine needed)
//  3. compile the NSIS installer with uninstaller, shortcuts and Add/Remove Programs entry
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as ResEdit from 'resedit';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
execSync('npx electron-builder --win dir --x64', { stdio: 'inherit' });

const exePath = path.resolve('release/win-unpacked/MACOS X PRO.exe');
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync('build/icon.ico'));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const gid = groups[0]?.id ?? 1, glang = groups[0]?.lang ?? 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, glang, ico.icons.map((i) => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
const [a, b, c] = version.split('.').map(Number);
vi.setFileVersion(a, b, c, 0, 1033);
vi.setProductVersion(a, b, c, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  ProductName: 'MACOS X PRO', FileDescription: 'MACOS X PRO', CompanyName: 'Abhijit', LegalCopyright: '© 2026 Abhijit',
  OriginalFilename: 'MACOS X PRO.exe', InternalName: 'MACOS X PRO', FileVersion: version, ProductVersion: version,
});
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('✓ icon and version info embedded');

// makensis: MAKENSIS env (e.g. NSIS installed on Windows), else the copy electron-builder caches
let makensis = process.env.MAKENSIS;
let nsisEnv = {};
if (!makensis) {
  const cacheRoot = process.env.ELECTRON_BUILDER_CACHE || (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache') : process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Caches/electron-builder') : path.join(os.homedir(), '.cache/electron-builder'));
  const base = path.join(cacheRoot, 'nsis-3.0.4.1');
  const nsisDir = fs.existsSync(base) ? fs.readdirSync(base).map((d) => path.join(base, d)).find((d) => fs.statSync(d).isDirectory()) : null;
  if (!nsisDir) throw new Error('NSIS not found: set MAKENSIS to makensis(.exe), or run "npx electron-builder --win nsis" once to cache it.');
  makensis = process.platform === 'win32' ? path.join(nsisDir, 'Bin', 'makensis.exe') : path.join(nsisDir, process.platform === 'darwin' ? 'mac' : 'linux', 'makensis');
  nsisEnv = { NSISDIR: nsisDir };
}
const out = path.resolve(`release/MACOS-X-PRO-Setup-${version}.exe`);
execSync(`"${makensis}" -V2 -INPUTCHARSET UTF8 -DVERSION=${version} -DSRCDIR="${path.resolve('release/win-unpacked')}" -DOUTFILE="${out}" installer.nsi`, { stdio: 'inherit', cwd: 'build', env: { ...process.env, ...nsisEnv } });
console.log(`✓ installer: ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
