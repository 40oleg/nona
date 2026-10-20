export const pathParitySources: Record<string, string> = {
    "nested extglob regressions": String.raw`
const pairs=[['a.js','!(@(a|b)).js'],['b.js','!(@(a|b)).js'],['a.js','!(?(a|b)).js'],['a.js','!(*(a|b)).js'],['a.js','!(+(a|b)).js'],['a','!(@(a|b))'],['ax.js','!(@(a|b)x).js'],['a.js','!(@(a)|b).js'],['a','!(!(a|b))'],['c','!(!(a|b))'],['.','@(?(a)*)'],['..','@(?(a)*)'],['.a','@(?(a)*)'],['.','@(.*)'],['','+(?(a))'],['','+(*(a))'],['a','+(?(a))'],['b','+(?(a))b'],['','?(a|b)+(*)']];
pairs.push(['a.js','!(!(a|b)).js'],['','+(!(a|b))'],['','@(?(a))'],['','@(*(a))']);
for(const p of [path.posix,path.win32])for(const pair of pairs)console.log(pair[0],pair[1],p.matchesGlob(...pair));
`,
    "concatenated extglob regressions": String.raw`
const pairs=[['b','!(a|b)!(a)'],['a','!(a|b)?(a|b)'],['b','!(a|b)*(a|b)'],['a','!(a)?(a|b)'],['a','!(a)*(a|b)'],['a','!(a)*'],['aa','!(a)*'],['.a','?(a|b)*'],['.a','?(a|b)!(a|b)'],['.a','?(a|b)!(a)'],['.a','*(a|b)*'],['.a','*(a|b)!(a|b)'],['.a','*(a|b)!(a)'],['.','?(a|b)?'],['..','*(a|b)*'],['a/b','!(a|b)?(a|b)']];
for(const p of [path.posix,path.win32])for(const pair of pairs)console.log(pair[0],pair[1],p.matchesGlob(...pair));
`,
    "path components and normalization": String.raw`
const paths=['','.', '..','../..','a/./b/../c/','///a//b///','//','/','/..','/a/.hidden','a..','a.','..foo','..','C:','C:/','C:foo/..','C:\\foo\\bar\\..\\','\\\\server\\share','\\\\server\\share\\foo','\\\\?\\C:\\foo','\\\\.\\pipe\\x','foo:bar','NUL:foo','é/😀.txt'];
for(const p of [path.posix,path.win32]) for(const s of paths) {
 console.log(JSON.stringify([p.normalize(s),p.dirname(s),p.basename(s),p.basename(s,'.txt'),p.extname(s),p.isAbsolute(s),p.parse(s),p.format(p.parse(s)),p.toNamespacedPath(s)]));
}
`,
    "path resolution and formatting": String.raw`
for(const p of [path.posix,path.win32]) {
 for(const parts of [[],[''],['a','b','..','c/'],['/a','/b'],['//server','share','x'],['C:','foo'],['C:/x','../y']])console.log(p.join(...parts),p.resolve(...parts));
 for(const pair of [['/a/b','/a/c'],['/a','/a'],['','x'],['C:/a','c:/B'],['C:/a','D:/b'],['//server/share/a','//server/share/b'],['/','//'],['//','/a'],['/a','//'],['//','\\\\?\\C:\\a./server\\CON:\\foo.txt'],['\\\\?\\C:\\a./server\\CON:\\foo.txt','//'],['C:/a','//'],['//','C:/a'],['/a','/ab'],['/ab','/abc'],['/abc','/ab'],['/server','//server/share'],['/server/share','//server/share']])console.log(p.relative(...pair));
 for(const obj of [{},{root:'/',name:'a',ext:'txt'},{dir:'/tmp',root:'/',name:'a',base:'b',ext:'.txt'},{root:'C:\\',name:'x',ext:'.js'}])console.log(p.format(obj));
}
console.log(path===path.win32, path===path.posix,path.sep,path.delimiter,path.posix.win32===path.win32,path.win32.posix===path.posix);
`,
    // The primitives node:fs shares through nona:internal/path-core (#439).
    "core primitives": String.raw`
const paths=['a','./a','../a','a/./b/../../c','/a/./b/..','/../a','папка/ü/😀','/папка/./ü/../😀.txt','C:\\a\\..\\b','C:rel','C:rel\\..\\..\\x','c:/A/./b','\\\\server\\share\\x','\\\\server\\share\\x\\..\\..','//server/share/папка','\\\\?\\C:\\a\\..\\b','\\\\.\\pipe\\x','/usr//lib/./x/','x/','.'];
for(const p of [path.posix,path.win32]) {
 for(const s of paths)console.log(JSON.stringify([s,p.normalize(s),p.dirname(s),p.join(s,'..','ü'),p.join('base',s),p.isAbsolute(s),p.resolve('/root',s)]));
 for(const parts of [['папка','..','😀'],['C:\\x','y','..','z'],['\\\\server','share','x'],['/','a','..'],['a','/b','./c']])console.log(p.join(...parts),p.resolve('/r',...parts));
}
for(const p of [path,path.posix,path.win32])console.log(Object.keys(p).join(),Object.keys(p).filter(k=>k!=='format').map(k=>typeof p[k]==='function'?p[k].name:typeof p[k]).join());
console.log(path.posix.resolve===path.posix.resolve,path.resolve===(path.sep==='/'?path.posix:path.win32).resolve,path._makeLong===path.toNamespacedPath);
`,
    "argument validation": String.raw`
for(const p of [path.posix,path.win32]) {
 for(const name of ['normalize','dirname','basename','extname','isAbsolute','parse','resolve','join','relative','matchesGlob'])for(const value of [undefined,null,1,true,[],{},()=>{}]) {
  try { p[name](value,'x'); console.log('accepted',name); } catch(e) { console.log(name,e.name,e.code); }
 }
 for(const value of [undefined,null,1,true,()=>{}])try{p.format(value);console.log('accepted format')}catch(e){console.log('format',e.name,e.code)}
 try{p.basename('a',null)}catch(e){console.log(e.name,e.code)}
 try{p.matchesGlob('a',null)}catch(e){console.log(e.name,e.code)}
 console.log(p.toNamespacedPath(null),p.toNamespacedPath(1));
}
`,
    "glob matching": String.raw`
const pairs=[['a.js','*.js'],['a/b.js','*.js'],['a/b.js','**/*.js'],['.x','*'],['a/.x','**/*'],['a/b/c','a/**'],['a','!a'],['#x','#x'],['a.js','*.{js,ts}'],['b','[a-c]'],['d','[!a-c]'],['x','@(x|y)'],['xyxy','+(xy|z)'],['a','?(a|b)'],['c','!(a|b)'],['a/b','a/**/b'],['a/../b','b'],['a/b','a/*/../b'],['file3','file{1..4}'],['FOO','foo'],['C:\\a\\b.js','C:/**/*.js'],['a/b','a\\b'],['',''],['a/','a'],['😀','?'],['[','[']];
for(const p of [path,path.posix,path.win32])for(const pair of pairs)console.log(pair[0],pair[1],p.matchesGlob(...pair));
`,
};
