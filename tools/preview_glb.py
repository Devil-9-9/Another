#!/usr/bin/env python3
"""CPU preview of a GLB (skinning + textures) so conversions can be checked without a GPU:  preview_glb.py model.glb out.png [clip] [time]"""
import json, struct, sys, io
import numpy as np
from PIL import Image, ImageDraw

def load(path):
    d = open(path, 'rb').read(); jl = struct.unpack_from('<I', d, 12)[0]; doc = json.loads(d[20:20 + jl]); b = d[20 + jl + 8:]
    return doc, b
def acc(doc, b, i):
    a = doc['accessors'][i]; v = doc['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]; dt = {5126: '<f4', 5121: 'u1', 5123: '<u2', 5125: '<u4'}[a['componentType']]
    return np.frombuffer(b, dtype=dt, count=a['count'] * n, offset=v['byteOffset'] + a.get('byteOffset', 0)).reshape(a['count'], n).astype(float if dt == '<f4' else int)
def q2m(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
def pose(doc, b, clip=None, t=0.0):
    nodes = doc['nodes']; T = [np.array(n.get('translation', [0, 0, 0]), float) for n in nodes]; R = [np.array(n.get('rotation', [0, 0, 0, 1]), float) for n in nodes]
    if clip is not None:
        an = next(a for a in doc['animations'] if a['name'] == clip)
        for ch in an['channels']:
            s = an['samplers'][ch['sampler']]; ts = acc(doc, b, s['input'])[:, 0]; vs = acc(doc, b, s['output']); k = int(np.clip(np.searchsorted(ts, t, 'right') - 1, 0, len(ts) - 1)); k2 = min(k + 1, len(ts) - 1)
            f = 0 if ts[k2] == ts[k] else np.clip((t - ts[k]) / (ts[k2] - ts[k]), 0, 1); v = vs[k] * (1 - f) + vs[k2] * f
            if ch['target']['path'] == 'rotation': R[ch['target']['node']] = v / np.linalg.norm(v)
            else: T[ch['target']['node']] = v
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []): parent[c] = i
    W = {}
    def w(i):
        if i not in W:
            m = np.eye(4); m[:3, :3] = q2m(R[i]); m[:3, 3] = T[i]; W[i] = (w(parent[i]) if i in parent else np.eye(4)) @ m
        return W[i]
    return [w(i) for i in range(len(nodes))]
def render(path, out, clip=None, t=0.0, size=520, yaws=(0, 0.8, 1.57, 3.14), gun=None):
    doc, b = load(path); W = pose(doc, b, clip, t); sk = doc['skins'][0]
    ibm = acc(doc, b, sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1); JM = np.array([W[j] @ ibm[k] for k, j in enumerate(sk['joints'])])
    imgs = []
    for im in doc.get('images', []):
        v = doc['bufferViews'][im['bufferView']]; imgs.append(Image.open(io.BytesIO(b[v['byteOffset']:v['byteOffset'] + v['byteLength']])).convert('RGBA'))
    H = 1.9; outs = []
    for y_i, yaw in enumerate(yaws):
        c, s_ = np.cos(yaw), np.sin(yaw); Ry = np.array([[c, 0, s_], [0, 1, 0], [-s_, 0, c]]); polys = []
        for pr in doc['meshes'][0]['primitives']:
            a = pr['attributes']; P = acc(doc, b, a['POSITION']); J = acc(doc, b, a['JOINTS_0']); Wt = acc(doc, b, a['WEIGHTS_0']); UV = acc(doc, b, a['TEXCOORD_0']); I = acc(doc, b, pr['indices']).reshape(-1, 3)
            Ph = np.c_[P, np.ones(len(P))]; M = np.einsum('nk,nkij->nij', Wt, JM[J]); Pw = np.einsum('nij,nj->ni', M, Ph)[:, :3] @ Ry.T
            mat = doc['materials'][pr['material']]; bt = mat['pbrMetallicRoughness'].get('baseColorTexture'); tex = imgs[doc['textures'][bt['index']]['source']] if bt else None
            col = mat['pbrMetallicRoughness'].get('baseColorFactor', [.6, .6, .6, 1]); cut = mat.get('alphaMode') == 'MASK'
            tri = Pw[I]; cen = tri.mean(1); uvc = UV[I].mean(1)
            for k in range(len(I)):
                if tex is not None:
                    px = tex.getpixel((int(np.clip(uvc[k, 0] % 1, 0, .9999) * tex.width), int(np.clip(uvc[k, 1] % 1, 0, .9999) * tex.height)))
                    if cut and px[3] < 128: continue
                    rgb = px[:3]
                else: rgb = tuple(int(x * 255) for x in col[:3])
                n = np.cross(tri[k, 1] - tri[k, 0], tri[k, 2] - tri[k, 0]); nl = np.linalg.norm(n)
                sh = 0.65 + 0.35 * abs(n[2] / nl) if nl > 0 else 0.8
                polys.append((cen[k, 2], tri[k], tuple(int(v * sh) for v in rgb)))
        if gun:                                            # draw a box-rifle where the game will attach it
            names = {n['name']: i for i, n in enumerate(doc['nodes'])}; G = np.eye(4); G[:3, :3] = q2m(gun['q']); G[:3, 3] = gun['p']; G = W[names['RightHand']] @ G
            for (cx, cy, cz, sx, sy, sz, rgb) in [(0, 0.04, 0.2, .06, .09, .5, (50, 50, 55)), (0, 0.045, 0.62, .02, .02, .3, (30, 30, 30)), (0, 0.0, -0.17, .04, .09, .24, (80, 55, 35)), (0, -0.09, 0.12, .035, .16, .07, (40, 40, 40))]:
                c8 = np.array([[cx + a * sx / 2, cy + b2 * sy / 2, cz + c_ * sz / 2, 1] for a in (-1, 1) for b2 in (-1, 1) for c_ in (-1, 1)]); w8 = (c8 @ G.T)[:, :3] @ Ry.T
                for f in [(0, 1, 3, 2), (4, 5, 7, 6), (0, 1, 5, 4), (2, 3, 7, 6), (0, 2, 6, 4), (1, 3, 7, 5)]: polys.append((w8[list(f)][:, 2].mean() + 0.01, w8[list(f)], rgb))
        polys.sort(key=lambda p: p[0]); img = Image.new('RGB', (size, size), (159, 211, 245)); dr = ImageDraw.Draw(img); sc = size * 0.9 / H
        for _, tr, rgb in polys: dr.polygon([(size / 2 + p[0] * sc, size * 0.95 - p[1] * sc) for p in tr], fill=rgb)
        outs.append(img)
    sheet = Image.new('RGB', (size * len(outs), size))
    for i, im in enumerate(outs): sheet.paste(im, (i * size, 0))
    sheet.save(out)
if __name__ == '__main__':
    a = sys.argv; gun = None
    if len(a) > 5: gun = json.load(open(a[5]))[a[6]]['gun']
    render(a[1], a[2], a[3] if len(a) > 3 and a[3] != '-' else None, float(a[4]) if len(a) > 4 else 0.0, gun=gun)
