// Small native probe also executed on the hosted BSD/macOS/ARM64 targets.
export const fsDescriptorProbe = {
    name: "fs-descriptors",
    source: String.raw`
import fs from "node:fs";
const dir=fs.mkdtempSync("nona-fd-"), path=dir+"/file";
try {
    const fd=fs.openSync(path,"wx+",0o600);
    try {
        const input=new Uint8Array([99,0,128,255,0,99]).subarray(1,5);
        if(fs.writeSync(fd,input,0,4,2)!==4) throw new Error("short write");
        const read=new Uint8Array(8).fill(77);
        console.log("read",fs.readSync(fd,read,1,7,0),Array.from(read).join(","));
        fs.writeSync(fd,new Uint8Array([42]));
        fs.ftruncateSync(fd,9);
        fs.writeSync(fd,new Uint8Array([43]));
        fs.fsyncSync(fd); fs.fdatasyncSync(fd);
        const tail=new Uint8Array(3).fill(88);
        fs.readSync(fd,tail,0,3,6);
        const stat=fs.fstatSync(fd), disk=fs.statfsSync(path);
        console.log("metadata",stat.size,stat.isFile(),stat.ino===fs.statSync(path).ino,disk.bsize>0,disk.blocks>0,Array.from(tail).join(","));
        fs.unlinkSync(path);
        console.log("unlinked",fs.fstatSync(fd).size);
    } finally {fs.closeSync(fd);}
} finally {fs.rmSync(dir,{recursive:true,force:true});}
`,
    expected:
        "read 6 77,0,0,0,128,255,0,77\nmetadata 9 true true true true 0,0,0\nunlinked 9\n",
};
