"""Minimal binary-FBX reader (FBX 7.x, the Mixamo format). Returns a node tree with array properties as numpy arrays."""
import struct, zlib
import numpy as np

ARR = {b'f': ('<f4', 4), b'd': ('<f8', 8), b'i': ('<i4', 4), b'l': ('<i8', 8), b'b': ('?', 1)}

def parse(data):
    ver = struct.unpack_from('<I', data, 23)[0]
    wide = ver >= 7500
    hdr = 25 if wide else 13
    fmt = '<QQQB' if wide else '<IIIB'

    def prop(p, t):
        if t in b'YCIFDL':
            f, n = {b'Y': ('<h', 2), b'C': ('<b', 1), b'I': ('<i', 4), b'F': ('<f', 4), b'D': ('<d', 8), b'L': ('<q', 8)}[t]
            return struct.unpack_from(f, data, p)[0], p + n
        if t in ARR:
            n, enc, cl = struct.unpack_from('<III', data, p); p += 12
            raw = data[p:p + cl]
            if enc: raw = zlib.decompress(raw)
            return np.frombuffer(raw, dtype=ARR[t][0], count=n).copy(), p + cl
        if t in b'SR':
            n = struct.unpack_from('<I', data, p)[0]
            return bytes(data[p + 4:p + 4 + n]), p + 4 + n
        raise ValueError(t)

    def node(p):
        end, nprops, plen, nlen = struct.unpack_from(fmt, data, p)
        if end == 0: return None, p + hdr
        name = data[p + hdr:p + hdr + nlen].decode('latin1'); q = p + hdr + nlen; props = []
        for _ in range(nprops):
            t = data[q:q + 1]; q += 1
            v, q = prop(q, t); props.append(v)
        kids = []
        while q < end:
            k, q = node(q)
            if k is None: break
            kids.append(k)
        return Node(name, props, kids), end

    out = []; pos = 27
    while pos < len(data) - hdr:
        n, pos = node(pos)
        if n is None: break
        out.append(n)
    return out

class Node:
    def __init__(self, name, props, kids): self.name, self.props, self.kids = name, props, kids
    def find(self, name): return next((k for k in self.kids if k.name == name), None)
    def all(self, name): return [k for k in self.kids if k.name == name]
    def p70(self):
        """Properties70 as {name: value-list}"""
        pr = self.find('Properties70'); d = {}
        if pr:
            for p in pr.kids:
                d[p.props[0].decode()] = p.props[4:]
        return d

def split_name(b):
    s = b.split(b'\x00\x01')
    return s[0].decode('latin1')
