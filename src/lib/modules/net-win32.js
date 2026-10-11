
import { define, lastError } from 'nona:ffi';
const WSAStartup = define('ws2_32.dll', 'WSAStartup', 'i32(u16,buf)');
const wsSocket = define('ws2_32.dll', 'socket', 'ptr(i32,i32,i32)');
const ioctlsocket = define('ws2_32.dll', 'ioctlsocket', 'i32(ptr,i32,buf)');
const wsBind = define('ws2_32.dll', 'bind', 'i32(ptr,buf,i32)');
const wsListen = define('ws2_32.dll', 'listen', 'i32(ptr,i32)');
const wsAccept = define('ws2_32.dll', 'accept', 'ptr(ptr,ptr,ptr)');
const wsConnect = define('ws2_32.dll', 'connect', 'i32(ptr,buf,i32)');
const wsSend = define('ws2_32.dll', 'send', 'i32(ptr,buf,i32,i32)');
const wsRecv = define('ws2_32.dll', 'recv', 'i32(ptr,buf,i32,i32)');
const wsShutdown = define('ws2_32.dll', 'shutdown', 'i32(ptr,i32)');
const closesocket = define('ws2_32.dll', 'closesocket', 'i32(ptr)');
const wsSetsockopt = define('ws2_32.dll', 'setsockopt', 'i32(ptr,i32,i32,buf,i32)');
const wsGetsockopt = define('ws2_32.dll', 'getsockopt', 'i32(ptr,i32,i32,buf,buf)');
const wsGetsockname = define('ws2_32.dll', 'getsockname', 'i32(ptr,buf,buf)');
const wsGetpeername = define('ws2_32.dll', 'getpeername', 'i32(ptr,buf,buf)');
const WSAPoll = define('ws2_32.dll', 'WSAPoll', 'i32(buf,u32,i32)');
const getaddrinfo = define('ws2_32.dll', 'getaddrinfo', 'i32(str,ptr,buf,buf)');
const freeaddrinfo = define('ws2_32.dll', 'freeaddrinfo', 'void(ptr)');
const RtlMoveMemory = define('kernel32.dll', 'RtlMoveMemory', 'void(buf,ptr,u64)');
const Sleep = define('kernel32.dll', 'Sleep', 'void(u32)');
const wsaErrors = { 10004: 4, 10009: 9, 10013: 13, 10014: 22, 10022: 22, 10024: 24, 10035: 11, 10036: 115, 10037: 114, 10047: 97, 10048: 98, 10049: 99,
  10050: 100, 10051: 101, 10053: 103, 10054: 104, 10055: 105, 10056: 106, 10057: 107, 10058: 32, 10060: 110, 10061: 111, 10065: 113 };
const uvErrors = { EACCES: -4092, EADDRINUSE: -4091, EADDRNOTAVAIL: -4090, EAFNOSUPPORT: -4089, EAGAIN: -4088, EALREADY: -4084, EBADF: -4083,
  ECONNABORTED: -4079, ECONNREFUSED: -4078, ECONNRESET: -4077, EHOSTUNREACH: -4065, EINTR: -4080, EINVAL: -4071, EISCONN: -4069, EMFILE: -4066,
  ENETDOWN: -4064, ENETUNREACH: -4062, ENOBUFS: -4060, ENOTCONN: -4053, EPIPE: -4047, ETIMEDOUT: -4039 };
function failure() { const error = lastError(); return -(wsaErrors[error] || 22); }
const one = new Uint32Array([1]), zero = new Uint32Array([0]), optionValue = new Uint32Array(1), optionLength = new Int32Array(1);
const nameBuffer = new Uint8Array(28), nameLength = new Int32Array(1);
let pollBuffer = new Uint8Array(16 * 64), pollView = new DataView(pollBuffer.buffer);
function setHandle(view, offset, handle) { view.setUint32(offset, handle % 4294967296, true); view.setUint32(offset + 4, Math.floor(handle / 4294967296), true); }
// Watched handles; WSAPoll gets the whole set on every wait.
const watched = [];
let readyList = [], readyMask = [];
const sys = {
  AF_INET: 2, AF_INET6: 23,
  watch(fd, want, had, handle) {
    handle._want = want;
    if (want !== 0 && had === 0) { handle._watchIndex = watched.length; watched.push(handle); }
    else if (want === 0 && had !== 0) {
      const i = handle._watchIndex, last = watched.pop();
      if (last !== handle) { watched[i] = last; last._watchIndex = i; }
    }
  },
  wait(timeout) {
    const count = watched.length;
    if (count === 0) { if (timeout !== 0) Sleep(timeout < 0 ? 0xffffffff : timeout); return 0; }
    if (pollBuffer.length < 16 * count) { pollBuffer = new Uint8Array(16 * count * 2); pollView = new DataView(pollBuffer.buffer); }
    const fds = [];
    let i = 0;
    for (const handle of watched) {
      const fd = handle._fd, want = handle._want;
      fds.push(fd);
      setHandle(pollView, 16 * i, fd);
      pollView.setInt16(16 * i + 8, (want & 1 ? 0x100 : 0) | (want & 2 ? 0x10 : 0), true);
      pollView.setInt16(16 * i + 10, 0, true);
      i++;
    }
    const n = WSAPoll(pollBuffer, count, timeout);
    readyList = []; readyMask = [];
    if (n <= 0) return 0;
    for (let k = 0; k < count; k++) {
      const r = pollView.getUint16(16 * k + 10, true);
      if (r === 0) continue;
      readyList.push(fds[k]);
      readyMask.push((r & 0x300 ? 1 : 0) | (r & 0x10 ? 2 : 0) | (r & 1 ? 4 : 0) | (r & 2 ? 8 : 0) | (r & 4 ? 4 : 0));
    }
    return readyList.length;
  },
  readyFd(i) { return readyList[i]; },
  readyEvents(i) { return readyMask[i]; },
  init() { const data = new Uint8Array(512); WSAStartup(0x202, data); },
  errno(errno, code) { return uvErrors[code] || -errno; },
  socket(family) {
    const fd = wsSocket(family, 1, 6);
    if (fd === -1) return failure();
    if (ioctlsocket(fd, -2147195266, one) !== 0) { const result = failure(); closesocket(fd); return result; }
    return fd;
  },
  setV6Only(fd, on) { wsSetsockopt(fd, 41, 27, on ? one : zero, 4); },
  // Windows SO_REUSEADDR lets another socket steal the port; libuv does not set it either.
  setReuseAddress(fd) {},
  setNoDelay(fd, on) { wsSetsockopt(fd, 6, 1, on ? one : zero, 4); },
  setKeepAlive(fd, on) { wsSetsockopt(fd, 0xffff, 8, on ? one : zero, 4); },
  bind(fd, address) { return wsBind(fd, address, address.length) === 0 ? 0 : failure(); },
  listen(fd, backlog) { return wsListen(fd, backlog) === 0 ? 0 : failure(); },
  accept(fd) { const result = wsAccept(fd, null, null); return result === -1 ? failure() : result; },
  connect(fd, address) { return wsConnect(fd, address, address.length) === 0 ? 0 : failure(); },
  socketError(fd) {
    optionLength[0] = 4;
    if (wsGetsockopt(fd, 0xffff, 0x1007, optionValue, optionLength) !== 0) return failure();
    return optionValue[0] === 0 ? 0 : -(wsaErrors[optionValue[0]] || 22);
  },
  send(fd, bytes, length) { const n = wsSend(fd, bytes, Math.min(length, 0x40000000), 0); return n < 0 ? failure() : n; },
  recv(fd, buffer) { const n = wsRecv(fd, buffer, buffer.length, 0); return n < 0 ? failure() : n; },
  shutdown(fd) { wsShutdown(fd, 1); },
  close(fd) { closesocket(fd); },
  sockname(fd) { nameLength[0] = 28; return wsGetsockname(fd, nameBuffer, nameLength) === 0 ? nameBuffer.slice(0, nameLength[0]) : null; },
  peername(fd) { nameLength[0] = 28; return wsGetpeername(fd, nameBuffer, nameLength) === 0 ? nameBuffer.slice(0, nameLength[0]) : null; },
  sleep(timeout) { Sleep(timeout < 0 ? 0xffffffff : timeout); },
  lookup(name) {
    const hints = new Uint8Array(48), hintsView = new DataView(hints.buffer), result = new Uint8Array(8), resultView = new DataView(result.buffer);
    hintsView.setInt32(4, 2, true); hintsView.setInt32(8, 1, true);
    if (getaddrinfo(name, null, hints, result) !== 0) return [];
    const head = resultView.getUint32(0, true) + resultView.getUint32(4, true) * 4294967296, out = [];
    const node = new Uint8Array(48), nodeView = new DataView(node.buffer), address = new Uint8Array(16);
    for (let pointer = head; pointer !== 0 && out.length < 16;) {
      RtlMoveMemory(node, pointer, 48);
      const family = nodeView.getInt32(4, true), addressPointer = nodeView.getUint32(32, true) + nodeView.getUint32(36, true) * 4294967296;
      if (family === 2 && addressPointer !== 0) { RtlMoveMemory(address, addressPointer, 16); out.push({ address: address[4] + '.' + address[5] + '.' + address[6] + '.' + address[7], family: 4 }); }
      pointer = nodeView.getUint32(40, true) + nodeView.getUint32(44, true) * 4294967296;
    }
    freeaddrinfo(head);
    return out;
  }
};
