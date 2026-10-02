// A Windows GUI program: build it with "No console window".
import { MessageBoxW, MB_OK, MB_ICONINFORMATION } from 'nona:win32';

const MB_YESNO = 0x4, MB_ICONQUESTION = 0x20, IDYES = 6;
const answer = MessageBoxW(null, 'Was this executable compiled in your browser?', 'Nona', MB_YESNO | MB_ICONQUESTION);
const reply = answer === IDYES
  ? 'It was: the compiler ran in the browser and produced this .exe.'
  : 'It was, actually: no server was involved.';
MessageBoxW(null, reply, 'Nona', MB_OK | MB_ICONINFORMATION);
