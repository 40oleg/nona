// museum.win32.mjs — show a different painting as the desktop wallpaper
// every few minutes. Windows only (nona:win32).
// Usage: museum <folder with .jpg/.png/.bmp files> [minutes] [--install]
import { readdirSync, existsSync } from 'node:fs';
import {
  SystemParametersInfoW, MessageBoxW, CreateMutexW,
  RegCreateKeyExW, RegSetValueExW, RegCloseKey,
  SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE,
  MB_OK, MB_ICONERROR, ERROR_ALREADY_EXISTS, ERROR_SUCCESS,
  HKEY_CURRENT_USER, KEY_WRITE, REG_SZ,
  lastError, wideString, readHandle,
} from 'nona:win32';

// Step 1: arguments. process.argv[0] is the executable, argv[1] the first argument.
const folder = process.argv[1];
const minutes = Number(process.argv[2] ?? 30);
const install = process.argv.includes('--install');

function fail(message) {
  MessageBoxW(null, message, 'Museum', MB_OK | MB_ICONERROR);
  process.exit(1);
}

if (!folder || !existsSync(folder)) fail('Usage: museum <folder> [minutes] [--install]');
if (!(minutes > 0)) fail('The interval must be a positive number of minutes.');

// Step 2: the pictures. There is no node:path, so paths are joined by hand.
const pictures = readdirSync(folder)
  .filter(name => /\.(jpe?g|png|bmp)$/i.test(name))
  .sort()
  .map(name => folder.replace(/[\\/]+$/, '') + '\\' + name);
if (pictures.length === 0) fail(`No pictures in ${folder}`);

// Step 3: a single instance. The mutex lives as long as the process.
CreateMutexW(null, false, 'Local\\NonaMuseum');
if (lastError() === ERROR_ALREADY_EXISTS) process.exit(0);

// Step 7 (optional): start with Windows by writing HKCU\...\Run.
if (install) {
  const key = new Uint8Array(8);
  const runKey = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  if (RegCreateKeyExW(HKEY_CURRENT_USER, runKey, 0, null, 0, KEY_WRITE, null, key, null) !== ERROR_SUCCESS)
    fail('Cannot open the Run key.');
  const command = wideString(`"${process.execPath}" "${folder}" ${minutes}`);
  const handle = readHandle(key);
  RegSetValueExW(handle, 'NonaMuseum', 0, REG_SZ, command, command.byteLength);
  RegCloseKey(handle);
}

// Step 4: set the wallpaper.
let next = Math.floor(Math.random() * pictures.length);
function showNext() {
  const picture = pictures[next];
  next = (next + 1) % pictures.length;
  if (!SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, picture, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE))
    console.log(`cannot show ${picture} (error ${lastError()})`);
}

// Step 5: rotate. The pending interval keeps the process alive; between
// ticks it sleeps without using the CPU.
showNext();
setInterval(showNext, minutes * 60 * 1000);
