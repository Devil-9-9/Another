#!/usr/bin/env python3
"""Mixamo FBX -> small GLB for the game.
   python3 tools/fbx2glb.py --char Remy.fbx --out assets/models/remy.glb --anims "name=file.fbx" ...
Keeps the skeleton and skinned meshes, shrinks textures (JPEG 1024/512), drops root motion, resamples animations."""
import argparse, io, json, struct, sys, os
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from fbx_scene import Scene, rotm, quat
from fbx_parse import split_name

def texture_pool(S):
    pool = {}
    for i, n in S.M.items():
        if n.name == 'Video':
            c = n.find('Content'); fn = n.find('RelativeFilename')
            if c and c.props and isinstance(c.props[0], (bytes, bytearray)) and len(c.props[0]) > 100:
                key = os.path.basename((fn.props[0].decode('latin1') if fn else '').replace('\\', '/')).lower()
                pool[key] = bytes(c.props[0])
    return pool
def tex_key(S, tid):
    n = S.M[tid]; fn = n.find('RelativeFilename') or n.find('FileName')
    return os.path.basename(fn.props[0].decode('latin1').replace('\\', '/')).lower() if fn else ''

def load_img(pool, key, size, mode):
    b = pool.get(key)
    if b is None: return None
    im = Image.open(io.BytesIO(b)); im = im.convert(mode)
    if max(im.size) > size: im = im.resize((size, size * im.size[1] // im.size[0]) if im.size[0] >= im.size[1] else (size * im.size[0] // im.size[1], size), Image.LANCZOS)
    return im
def jpeg(im, q=84):
    o = io.BytesIO(); im.save(o, 'JPEG', quality=q, optimize=True); return o.getvalue()
def png(im):
    o = io.BytesIO(); im.save(o, 'PNG', optimize=True); return o.getvalue()

class GLB:
    def __init__(self): self.bin = bytearray(); self.views = []; self.acc = []; self.images = []
    def view(self, data, target=None):
        while len(self.bin) % 4: self.bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target: v['target'] = target
        self.bin += data; self.views.append(v); return len(self.views) - 1
    def accessor(self, arr, typ, comp, target=None, minmax=False, normalized=False):
        arr = np.ascontiguousarray(arr); vi = self.view(arr.tobytes(), target)
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[typ]
        a = {'bufferView': vi, 'componentType': comp, 'count': int(arr.size // n), 'type': typ}
        if normalized: a['normalized'] = True
        if minmax: f = arr.reshape(-1, n); a['min'] = [float(x) for x in f.min(0)]; a['max'] = [float(x) for x in f.max(0)]
        self.acc.append(a); return len(self.acc) - 1
    def write(self, path, doc):
        while len(self.bin) % 4: self.bin.append(0)
        doc['bufferViews'] = self.views; doc['accessors'] = self.acc; doc['buffers'] = [{'byteLength': len(self.bin)}]
        doc['asset'] = {'version': '2.0', 'generator': 'blockops fbx2glb'}
        js = json.dumps(doc, separators=(',', ':')).encode()
        while len(js) % 4: js += b' '
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, total)); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942)); f.write(bytes(self.bin))
        return total

def skeleton_nodes(S, order, scale):
    idx = {b: i for i, b in enumerate(order)}; nodes = []
    for b in order:
        L = S.local(b); t = L[:3, 3] * scale; q = quat(L[:3, :3] / np.cbrt(abs(np.linalg.det(L[:3, :3]))))
        nd = {'name': S.names[b], 'translation': [float(x) for x in t], 'rotation': [float(x) for x in q]}
        kids = [idx[c] for c in S.children.get(b, []) if c in idx and S.bone_parent(c) == b]
        if kids: nd['children'] = kids
        nodes.append(nd)
    return nodes, idx

def read_mesh(S, m, joint_of):
    g = m['geo']; V = g.find('Vertices').props[0].reshape(-1, 3); P = g.find('PolygonVertexIndex').props[0]
    ends = np.where(P < 0)[0]; pv = np.where(P < 0, -P - 1, P)
    def layer(name, arr, dim, idxname):
        L = g.find(name)
        if L is None: return None
        a = L.find(arr).props[0].reshape(-1, dim); mapping = L.find('MappingInformationType').props[0].decode(); ref = L.find('ReferenceInformationType').props[0].decode()
        ii = L.find(idxname).props[0] if (ref == 'IndexToDirect' and L.find(idxname)) else None
        if mapping == 'ByPolygonVertex': return a[ii] if ii is not None else a[:len(pv)]
        if mapping in ('ByVertice', 'ByVertex', 'ByControlPoint'): b = a[ii] if ii is not None else a; return b[pv]
        raise ValueError('mapping ' + mapping)
    N = layer('LayerElementNormal', 'Normals', 3, 'NormalsIndex'); UV = layer('LayerElementUV', 'UV', 2, 'UVIndex')
    # per-polygon material
    L = g.find('LayerElementMaterial'); npoly = len(ends)
    if L is not None and L.find('Materials') is not None and L.find('MappingInformationType').props[0] != b'AllSame': pm = L.find('Materials').props[0].astype(int)
    else: pm = np.zeros(npoly, int)
    # triangulate (fan)
    tris = []; tm = []; s = 0
    for p, e in enumerate(ends):
        for k in range(1, e - s): tris.append((s, s + k, s + k + 1)); tm.append(pm[p] if p < len(pm) else 0)
        s = e + 1
    tris = np.array(tris); tm = np.array(tm)
    cl = S.skin_clusters(m['geo_id']); assert cl, m['name'] + ' has no skin'
    Vw = V.astype(float)      # Mixamo exports vertices already in bind-pose world space (the cluster 'Transform' is not a mesh offset)
    J = np.zeros((len(V), 4), np.int64); W = np.zeros((len(V), 4)); fill = np.zeros(len(V), int)
    entries = [[] for _ in range(len(V))]
    for c in cl:
        for i, w in zip(c['idx'], c['w']):
            if w > 1e-5: entries[i].append((float(w), joint_of[c['bone']]))
    for i, e in enumerate(entries):
        e.sort(reverse=True); e = e[:4]; tot = sum(w for w, _ in e) or 1.0
        for k, (w, j) in enumerate(e): J[i, k] = j; W[i, k] = w / tot
        if not e: J[i, 0] = 0; W[i, 0] = 1
    return dict(Vw=Vw, pv=pv, N=N, UV=UV, tris=tris, tm=tm, J=J, W=W)

def convert_character(S, out_path, target_h, clips, pool):
    order = S.bone_order(); joint_of = {b: i for i, b in enumerate(order)}
    meshes = [(m, read_mesh(S, m, joint_of)) for m in S.meshes()]
    allp = np.vstack([d['Vw'] for _, d in meshes]); scale = target_h / (allp[:, 1].max() - allp[:, 1].min())
    print(f'  height {allp[:,1].max()-allp[:,1].min():.1f} fbx units -> scale {scale:.5f}')
    G = GLB(); doc = {'scene': 0, 'nodes': [], 'meshes': [], 'skins': [], 'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]}
    nodes, idx = skeleton_nodes(S, order, scale); doc['nodes'] = nodes
    ibm = np.array([np.linalg.inv(S.world(b)) for b in order]); ibm[:, :3, 3] *= scale   # (scale applies to translation of the INVERSE bind, which is in fbx units)
    # inverse bind: M^-1 maps scaled world back; vertices are scaled by `scale` too, so scale the inverse's translation column
    ibm_cols = np.transpose(ibm, (0, 2, 1)).reshape(-1)             # glTF wants column-major
    mat_cache = {}; prims = []
    def make_material(mid, ttl):
        if mid in mat_cache: return mat_cache[mid]
        tx = S.textures_of(mid) if mid is not None else {}; name = split_name(S.M[mid].props[1]) if mid is not None else 'default'
        mt = {'name': name, 'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 0.85}, 'doubleSided': False}
        if 'DiffuseColor' in tx:
            key = tex_key(S, tx['DiffuseColor']); big = ('body' in key or 'kachujin' in key or 'diffuse' in key and 'body' in key) 
            size = 1024 if big else 512
            if 'eyelash' in name.lower() and 'TransparentColor' in tx:   # eyelashes: solid dark colour, opacity map as alpha (tiny)
                op = load_img(pool, tex_key(S, tx['TransparentColor']), 256, 'L')
                if op is not None:
                    im = Image.new('RGBA', op.size, (20, 14, 12, 255)); im.putalpha(op); data, mime = png(im), 'image/png'
                    mt['alphaMode'] = 'MASK'; mt['alphaCutoff'] = 0.5; mt['doubleSided'] = True
                else: im = None
            elif 'TransparentColor' in tx:                         # hair: bake the opacity map into alpha
                im = load_img(pool, key, size, 'RGB'); op = load_img(pool, tex_key(S, tx['TransparentColor']), size, 'L')
                if im is not None and op is not None:
                    op = op.resize(im.size, Image.LANCZOS); im = im.convert('RGBA'); im.putalpha(op); data, mime = png(im), 'image/png'
                    mt['alphaMode'] = 'MASK'; mt['alphaCutoff'] = 0.5; mt['doubleSided'] = True
                else: im = None
            else:
                im = load_img(pool, key, size, 'RGB'); data, mime = (jpeg(im), 'image/jpeg') if im is not None else (None, None)
            if im is not None:
                doc['images'].append({'bufferView': G.view(data), 'mimeType': mime}); doc['textures'].append({'sampler': 0, 'source': len(doc['images']) - 1})
                mt['pbrMetallicRoughness']['baseColorTexture'] = {'index': len(doc['textures']) - 1}; print(f'    texture {key}: {im.size} {len(data)//1024} KB')
        if 'baseColorTexture' not in mt['pbrMetallicRoughness']: mt['pbrMetallicRoughness']['baseColorFactor'] = [0.6, 0.6, 0.62, 1]
        doc['materials'].append(mt); mat_cache[mid] = len(doc['materials']) - 1; return mat_cache[mid]
    total_v = 0
    for m, d in meshes:
        for slot in sorted(set(d['tm'].tolist())):
            tri = d['tris'][d['tm'] == slot]; flat = tri.reshape(-1)
            key = np.c_[d['pv'][flat], d['N'][flat] if d['N'] is not None else np.zeros((len(flat), 3)), d['UV'][flat] if d['UV'] is not None else np.zeros((len(flat), 2))].astype(np.float32)
            uniq, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True); inv = inv.reshape(-1); vi = d['pv'][flat][first]
            pos = (d['Vw'][vi] * scale).astype(np.float32)
            nrm = uniq[:, 1:4].astype(np.float32); nl = np.linalg.norm(nrm, axis=1, keepdims=True); nrm = nrm / np.maximum(nl, 1e-8)
            uv = uniq[:, 4:6].astype(np.float32).copy(); uv[:, 1] = 1 - uv[:, 1]
            jj = d['J'][vi].astype(np.uint8); ww = d['W'][vi].astype(np.float32)
            idxs = inv.astype(np.uint16 if len(uniq) < 65535 else np.uint32); total_v += len(uniq)
            mid = m['mats'][slot] if slot < len(m['mats']) else (m['mats'][0] if m['mats'] else None)
            prims.append({'attributes': {'POSITION': G.accessor(pos, 'VEC3', 5126, 34962, True), 'NORMAL': G.accessor(nrm, 'VEC3', 5126, 34962), 'TEXCOORD_0': G.accessor(uv, 'VEC2', 5126, 34962),
                                         'JOINTS_0': G.accessor(jj, 'VEC4', 5121, 34962), 'WEIGHTS_0': G.accessor(ww, 'VEC4', 5126, 34962)},
                          'indices': G.accessor(idxs, 'SCALAR', 5123 if idxs.dtype == np.uint16 else 5125, 34963), 'material': make_material(mid, m['name'])})
    print(f'  {total_v} vertices, {len(prims)} primitives')
    doc['skins'].append({'joints': list(range(len(order))), 'inverseBindMatrices': G.accessor(ibm_cols.astype(np.float32), 'MAT4', 5126), 'skeleton': 0})
    doc['meshes'].append({'name': 'Body', 'primitives': prims})
    doc['nodes'].append({'name': 'Mesh', 'mesh': 0, 'skin': 0}); roots = [idx[b] for b in order if S.bone_parent(b) is None]
    doc['scenes'] = [{'nodes': roots + [len(doc['nodes']) - 1]}]
    # ---- animations ----
    hips = next(b for b in order if S.names[b] == 'Hips'); char_hips_y = S.local(hips)[1, 3]
    pre = {b: rotm(np.array([float(x) for x in S.M[b].p70().get('PreRotation', [0, 0, 0])[:3]])) for b in order}
    doc['animations'] = []
    for name, path in clips:
        C = Scene(path); dur, t0, data, rest_y = C.clip(); ratio = char_hips_y / rest_y if rest_y else 1.0
        if not (0.3 < ratio < 3.5): ratio = 1.0
        by_name = {C.names[b]: v for b, v in data.items()}; samplers = []; channels = []
        for b in order:
            nm = S.names[b]
            if nm not in by_name: continue
            ch = by_name[nm]
            if 'R' in ch:
                ts, ev = ch['R']; q = np.array([quat(pre[b] @ rotm(e)) for e in ev])
                for i in range(1, len(q)):
                    if np.dot(q[i], q[i - 1]) < 0: q[i] = -q[i]
                samplers.append({'input': G.accessor((ts - t0).astype(np.float32), 'SCALAR', 5126, minmax=True), 'output': G.accessor(q.astype(np.float32), 'VEC4', 5126), 'interpolation': 'LINEAR'})
                channels.append({'sampler': len(samplers) - 1, 'target': {'node': idx[b], 'path': 'rotation'}})
            if 'T' in ch and nm == 'Hips':                     # root motion off: keep height bob, pin x/z to the first frame
                ts, tv = ch['T']; tv = tv * ratio * scale; tv[:, 0] = tv[0, 0]; tv[:, 2] = tv[0, 2]
                samplers.append({'input': G.accessor((ts - t0).astype(np.float32), 'SCALAR', 5126, minmax=True), 'output': G.accessor(tv.astype(np.float32), 'VEC3', 5126), 'interpolation': 'LINEAR'})
                channels.append({'sampler': len(samplers) - 1, 'target': {'node': idx[b], 'path': 'translation'}})
        doc['animations'].append({'name': name, 'samplers': samplers, 'channels': channels}); print(f'    clip {name}: {dur:.2f}s, {len(channels)} channels, hips ratio {ratio:.2f}')
    for k in ('textures', 'images', 'samplers'):
        if not doc[k]: del doc[k]
    return G.write(out_path, doc)

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--char', required=True); ap.add_argument('--out', required=True); ap.add_argument('--height', type=float, default=1.8)
    ap.add_argument('--anims', nargs='*', default=[]); a = ap.parse_args()
    clips = [tuple(x.split('=', 1)) for x in a.anims]
    S = Scene(a.char); pool = texture_pool(S); print('character', os.path.basename(a.char), len(S.bones), 'bones')
    size = convert_character(S, a.out, a.height, clips, pool); print('wrote', a.out, size // 1024, 'KB')
