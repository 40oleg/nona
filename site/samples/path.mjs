import path, {posix, win32, matchesGlob} from 'node:path';
import bare from 'path';
console.log(path === bare);
console.log(posix.normalize('/a/../b/'));
console.log(win32.basename('C:\\temp\\file.txt'));
console.log(path.join('data', 'report.txt'));
console.log(matchesGlob('src/main.js', '**/*.js'));
