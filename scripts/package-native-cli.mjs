// Development packaging: the distribution contains only the native executable.
import {mkdirSync,copyFileSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {supportedNativeTargets} from '../dist/src/target.js';
import {nonaVersion} from '../dist/src/version.js';
const [target,image,destination]=process.argv.slice(2);
if(!supportedNativeTargets.includes(target)||!image||!destination)throw new Error('Usage: package-native-cli <target> <image> <directory>');
const directory=resolve(destination);mkdirSync(directory,{recursive:true});
const output=join(directory,target.startsWith('win32-')?'nona.exe':'nona');
copyFileSync(resolve(image),output);chmodSync(output,0o755);
copyFileSync(resolve('LICENSE'),join(directory,'LICENSE'));
writeFileSync(join(directory,'VERSION'),nonaVersion+'\n');
writeFileSync(join(directory,'README.txt'),'Nona '+nonaVersion+' for '+target+'\n\nRun '+(target.startsWith('win32-')?'nona.exe':'./nona')+' --help.\nNo Node.js, JavaScript source tree, C toolchain or bundled library is required.\nOn POSIX hosts, run chmod +x nona if your archive extractor does not retain permissions.\n');
console.log('Packaged standalone compiler:',output);
