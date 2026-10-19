import { define } from "nona:ffi";
const sysRead = define("syscall", "0", "i64(i64,buf,i64)");
const sysWrite = define("syscall", "1", "i64(i64,buf,i64)");
const sysOpen = define("syscall", "2", "i64(buf,i64,i64)");
const sysClose = define("syscall", "3", "i64(i64)");
const sysPoll = define("syscall", "7", "i64(buf,i64,i64)");
const sysSocket = define("syscall", "41", "i64(i64,i64,i64)");
const sysConnect = define("syscall", "42", "i64(i64,buf,i64)");
const sysSendto = define("syscall", "44", "i64(i64,buf,i64,i64,ptr,i64)");
const sysShutdown = define("syscall", "48", "i64(i64,i64)");
const sysBind = define("syscall", "49", "i64(i64,buf,i64)");
const sysListen = define("syscall", "50", "i64(i64,i64)");
const sysGetsockname = define("syscall", "51", "i64(i64,buf,buf)");
const sysGetpeername = define("syscall", "52", "i64(i64,buf,buf)");
const sysSetsockopt = define("syscall", "54", "i64(i64,i64,i64,buf,i64)");
const sysGetsockopt = define("syscall", "55", "i64(i64,i64,i64,buf,buf)");
const sysAccept4 = define("syscall", "288", "i64(i64,ptr,ptr,i64)");
const sysEpollWait = define("syscall", "232", "i64(i64,buf,i64,i64)");
const sysEpollCtl = define("syscall", "233", "i64(i64,i64,i64,buf)");
const sysEpollCreate1 = define("syscall", "291", "i64(i64)");
// struct epoll_event is packed on x86-64: u32 events, u64 data (the descriptor).
const EPOLL_MAX = 256,
    epollEvents = new Int32Array(3 * EPOLL_MAX),
    epollEvent = new Int32Array(3);
let epollFd = -1;
const NONBLOCK_CLOEXEC = 0x800 | 0x80000,
    MSG_NOSIGNAL = 0x4000;
const one = new Int32Array([1]),
    zero = new Int32Array([0]),
    optionValue = new Int32Array(1),
    optionLength = new Int32Array(1);
const nameBuffer = new Uint8Array(28),
    nameLength = new Int32Array(1);
let pollBuffer = new Uint8Array(8 * 64),
    pollView = new DataView(pollBuffer.buffer);
const textDecoder = new TextDecoder(),
    textEncoder = new TextEncoder();
function readText(path) {
    const bytes = textEncoder.encode(path),
        name = new Uint8Array(bytes.length + 1);
    name.set(bytes);
    const fd = sysOpen(name, 0x80000, 0);
    if (fd < 0) return null;
    const chunks = [],
        buffer = new Uint8Array(65536);
    try {
        for (;;) {
            const n = sysRead(fd, buffer, buffer.length);
            if (n <= 0) break;
            chunks.push(textDecoder.decode(buffer.subarray(0, n)));
        }
    } finally {
        sysClose(fd);
    }
    return chunks.join("");
}
function hostsLookup(name) {
    const text = readText("/etc/hosts");
    if (text === null) return [];
    const out = [];
    for (const line of text.split("\n")) {
        const fields = line.replace(/#.*/, "").trim().split(/\s+/);
        if (fields.length < 2) continue;
        for (let i = 1; i < fields.length; i++)
            if (
                fields[i].toLowerCase() === name &&
                /^\d+\.\d+\.\d+\.\d+$/.test(fields[0])
            )
                out.push({ address: fields[0], family: 4 });
    }
    return out;
}
/** One A query over UDP to the first nameserver in /etc/resolv.conf. */
function dnsLookup(name) {
    const conf = readText("/etc/resolv.conf") || "";
    const match = /^\s*nameserver\s+(\d+\.\d+\.\d+\.\d+)/m.exec(conf);
    const server = match ? match[1] : "127.0.0.1";
    const id = (Date.now() * 7919) & 0xffff;
    const labels = name.split(".").filter((label) => label !== "");
    const query = [id >> 8, id & 255, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0];
    for (const label of labels) {
        const bytes = textEncoder.encode(label);
        query.push(bytes.length);
        for (const b of bytes) query.push(b);
    }
    query.push(0, 0, 1, 0, 1);
    const fd = sysSocket(2, 2 | NONBLOCK_CLOEXEC, 0);
    if (fd < 0) return [];
    const out = [];
    try {
        const address = new Uint8Array(16);
        address[0] = 2;
        address[3] = 53;
        server.split(".").forEach((part, i) => {
            address[4 + i] = Number(part);
        });
        if (sysConnect(fd, address, 16) < 0) return [];
        const packet = new Uint8Array(query),
            reply = new Uint8Array(1500),
            pollfd = new Uint8Array(8),
            pv = new DataView(pollfd.buffer);
        for (let attempt = 0; attempt < 2 && out.length === 0; attempt++) {
            if (sysWrite(fd, packet, packet.length) < 0) return [];
            pv.setInt32(0, fd, true);
            pv.setInt16(4, 1, true);
            pv.setInt16(6, 0, true);
            if (sysPoll(pollfd, 1, 2500) <= 0) continue;
            const n = sysRead(fd, reply, reply.length);
            if (n < 12 || reply[0] !== packet[0] || reply[1] !== packet[1])
                continue;
            if ((reply[3] & 15) !== 0) return [];
            const answers = (reply[6] << 8) | reply[7],
                view = new DataView(reply.buffer);
            let offset = packet.length;
            const skipName = () => {
                while (offset < n) {
                    const length = reply[offset];
                    if (length === 0) {
                        offset++;
                        return;
                    }
                    if ((length & 0xc0) === 0xc0) {
                        offset += 2;
                        return;
                    }
                    offset += length + 1;
                }
            };
            for (let i = 0; i < answers && offset < n; i++) {
                skipName();
                const type = view.getUint16(offset),
                    length = view.getUint16(offset + 8);
                offset += 10;
                if (type === 1 && length === 4)
                    out.push({
                        address:
                            reply[offset] +
                            "." +
                            reply[offset + 1] +
                            "." +
                            reply[offset + 2] +
                            "." +
                            reply[offset + 3],
                        family: 4,
                    });
                offset += length;
            }
        }
    } finally {
        sysClose(fd);
    }
    return out;
}
const sys = {
    AF_INET: 2,
    AF_INET6: 10,
    /** Closing a descriptor removes it from the epoll set: no epoll_ctl before close. */
    closeDropsWatch: true,
    init() {
        epollFd = sysEpollCreate1(0x80000);
    },
    /** Changes the readiness interest of fd from had to want (READ 1, WRITE 2; 0 removes it). */
    watch(fd, want, had) {
        epollEvent[0] = (want & 1 ? 1 : 0) | (want & 2 ? 4 : 0);
        epollEvent[1] = fd;
        epollEvent[2] = 0;
        sysEpollCtl(
            epollFd,
            had === 0 ? 1 : want === 0 ? 2 : 3,
            fd,
            epollEvent,
        );
    },
    /** Waits up to timeout ms (-1: no limit); returns the number of ready descriptors. */
    wait(timeout) {
        const n = sysEpollWait(epollFd, epollEvents, EPOLL_MAX, timeout);
        return n > 0 ? n : 0;
    },
    readyFd(i) {
        return epollEvents[3 * i + 1];
    },
    // EPOLLIN 1, EPOLLOUT 4, EPOLLERR 8, EPOLLHUP 16 -> READ 1, WRITE 2, ERROR 4, HANGUP 8.
    readyEvents(i) {
        const r = epollEvents[3 * i];
        return (r & 1) | ((r >> 1) & 14);
    },
    errno(errno) {
        return -errno;
    },
    socket(family) {
        return sysSocket(family, 1 | NONBLOCK_CLOEXEC, 0);
    },
    setV6Only(fd, on) {
        sysSetsockopt(fd, 41, 26, on ? one : zero, 4);
    },
    setReuseAddress(fd) {
        sysSetsockopt(fd, 1, 2, one, 4);
    },
    setNoDelay(fd, on) {
        sysSetsockopt(fd, 6, 1, on ? one : zero, 4);
    },
    setKeepAlive(fd, on) {
        sysSetsockopt(fd, 1, 9, on ? one : zero, 4);
    },
    bind(fd, address) {
        return sysBind(fd, address, address.length);
    },
    listen(fd, backlog) {
        return sysListen(fd, backlog);
    },
    accept(fd) {
        return sysAccept4(fd, null, null, NONBLOCK_CLOEXEC);
    },
    connect(fd, address) {
        return sysConnect(fd, address, address.length);
    },
    socketError(fd) {
        optionLength[0] = 4;
        const result = sysGetsockopt(fd, 1, 4, optionValue, optionLength);
        return result < 0 ? result : -optionValue[0];
    },
    send(fd, bytes, length) {
        return sysSendto(fd, bytes, length, MSG_NOSIGNAL, null, 0);
    },
    recv(fd, buffer) {
        return sysRead(fd, buffer, buffer.length);
    },
    shutdown(fd) {
        sysShutdown(fd, 1);
    },
    close(fd) {
        sysClose(fd);
    },
    sockname(fd) {
        nameLength[0] = 28;
        return sysGetsockname(fd, nameBuffer, nameLength) === 0
            ? nameBuffer.slice(0, nameLength[0])
            : null;
    },
    peername(fd) {
        nameLength[0] = 28;
        return sysGetpeername(fd, nameBuffer, nameLength) === 0
            ? nameBuffer.slice(0, nameLength[0])
            : null;
    },
    sleep(timeout) {
        sysPoll(pollBuffer, 0, timeout);
    },
    lookup(name) {
        const hosts = hostsLookup(name);
        return hosts.length > 0 ? hosts : dnsLookup(name);
    },
};
