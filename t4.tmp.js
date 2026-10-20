const c = new Uint8Array(8);
try { structuredClone(c.buffer, { transfer: [c.buffer] }); console.log('ok', c.length); } catch (e) { console.log('err', e.constructor.name, e.message); }
