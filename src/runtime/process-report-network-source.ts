import { runtimeProcessReportNetwork } from "../lib/sources.generated.js";
/** Original native interface snapshots, inserted inside the process build. */
export const processReportNetworkIntrinsicsSource = String.raw`
  var networkIntrinsics={Uint8Array:Uint8Array,Uint32Array:Uint32Array,Int32Array:Int32Array,DataView:DataView,Map:Map,Set:Set,Math:{min:Math.min,max:Math.max,pow:Math.pow},String:{fromCharCode:String.fromCharCode},Array:{from:Array.from}};
`;
export const processReportNetworkSource = runtimeProcessReportNetwork;

/** The network snapshot adds OS services only to the corresponding target. */
export function processReportNetworkHosts(
    target: string,
): [string, string, string, string][] {
    if (target === "win32-x64")
        return [
            [
                "GetAdaptersAddresses",
                "IPHLPAPI.dll",
                "GetAdaptersAddresses",
                "u32(u32,u32,ptr,buf,buf)",
            ],
            ...processReportNetworkHosts("linux-x64"),
        ];
    if (target === "win32-arm64")
        return [
            [
                "GetAdaptersAddresses",
                "IPHLPAPI.dll",
                "GetAdaptersAddresses",
                "u32(u32,u32,ptr,buf,buf)",
            ],
        ];
    if (target.startsWith("darwin-"))
        return [
            [
                "getifaddrs",
                "/usr/lib/libSystem.B.dylib",
                "getifaddrs",
                "i32(buf)",
            ],
            [
                "freeifaddrs",
                "/usr/lib/libSystem.B.dylib",
                "freeifaddrs",
                "void(ptr)",
            ],
        ];
    if (target.startsWith("linux-")) {
        const arm = target.endsWith("arm64");
        return [
            [
                "networkSocket",
                "syscall",
                arm ? "198" : "41",
                "i64(i32,i32,i32)",
            ],
            [
                "networkSend",
                "syscall",
                arm ? "206" : "44",
                "i64(i64,buf,u64,i32,buf,u32)",
            ],
            [
                "networkReceive",
                "syscall",
                arm ? "207" : "45",
                "i64(i64,buf,u64,i32,ptr,ptr)",
            ],
        ];
    }
    return [];
}
