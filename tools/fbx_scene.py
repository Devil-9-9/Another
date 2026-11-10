"""Turns a parsed Mixamo FBX into plain python/numpy structures: skeleton, skinned meshes, materials/textures, animation clips."""
import numpy as np
from fbx_parse import parse, split_name

KTIME = 46186158000.0
def rotm(deg):
    x, y, z = np.radians(deg)
    cx, sx, cy, sy, cz, sz = np.cos(x), np.sin(x), np.cos(y), np.sin(y), np.cos(z), np.sin(z)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]); Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx                     # FBX eEulerXYZ: X applied first
def quat(m):
    t = np.trace(m)
    if t > 0: s = np.sqrt(t + 1) * 2; q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]: s = np.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; q = [s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]: s = np.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; q = [(m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else: s = np.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s]
    q = np.array(q); return q / np.linalg.norm(q)          # x y z w
def mat4(vals): return np.array(vals, dtype=float).reshape(4, 4).T

class Scene:
    def __init__(self, path):
        t = parse(open(path, 'rb').read())
        self.obj = next(n for n in t if n.name == 'Objects'); self.conn = next(n for n in t if n.name == 'Connections')
        self.M = {n.props[0]: n for n in self.obj.kids}
        self.parent = {}; self.children = {}; self.opc = []   # object-object and object-property connections
        for c in self.conn.kids:
            kind, child, par = c.props[0], c.props[1], c.props[2]
            if kind == b'OO': self.parent.setdefault(child, []).append(par); self.children.setdefault(par, []).append(child)
            else: self.opc.append((child, par, c.props[3].decode()))
        gs = next((n for n in t if n.name == 'GlobalSettings'), None)
        self.unit = 1.0
        if gs: self.unit = float(gs.find('Properties70').kids and next((p.props[4] for p in gs.find('Properties70').kids if p.props[0] == b'UnitScaleFactor'), 1.0))
        self.bones = {i: n for i, n in self.M.items() if n.name == 'Model' and n.props[2] == b'LimbNode'}
        self.names = {i: split_name(n.props[1]).replace('mixamorig:', '') for i, n in self.M.items() if n.name == 'Model'}
        self._world = {}

    def bone_parent(self, i):
        return next((p for p in self.parent.get(i, []) if p in self.bones), None)
    def local(self, i):
        pp = self.M[i].p70(); g = lambda k, d: np.array([float(x) for x in pp[k][:3]]) if k in pp else np.array(d, float)
        assert int(pp.get('RotationOrder', [0])[0]) == 0, 'only XYZ rotation order supported'
        m = np.eye(4); m[:3, 3] = g('Lcl Translation', [0, 0, 0])
        R = rotm(g('PreRotation', [0, 0, 0])) @ rotm(g('Lcl Rotation', [0, 0, 0])) @ np.linalg.inv(rotm(g('PostRotation', [0, 0, 0])))
        S = np.diag(g('Lcl Scaling', [1, 1, 1]))
        m[:3, :3] = R @ S; return m
    def world(self, i):
        if i not in self._world:
            p = self.bone_parent(i); self._world[i] = (self.world(p) if p else np.eye(4)) @ self.local(i)
        return self._world[i]
    def bone_order(self):
        """parents before children, stable"""
        order = []; roots = [i for i in self.bones if self.bone_parent(i) is None]
        def walk(i):
            order.append(i)
            for c in self.children.get(i, []):
                if c in self.bones: walk(c)
        for r in roots: walk(r)
        return order

    # ---------- meshes ----------
    def meshes(self):
        out = []
        for i, n in self.M.items():
            if n.name != 'Model' or n.props[2] != b'Mesh': continue
            geo = next(c for c in self.children_of(i) if self.M[c].name == 'Geometry')
            mats = [c for c in self.children_of(i) if self.M[c].name == 'Material']
            out.append(dict(id=i, name=split_name(n.props[1]), geo=self.M[geo], geo_id=geo, mats=mats))
        return out
    def children_of(self, i):   # objects connected INTO i (child -> i)
        return self.children.get(i, [])
    def skin_clusters(self, geo_id):
        sk = [c for c in self.children_of(geo_id) if self.M[c].name == 'Deformer' and self.M[c].props[2] == b'Skin']
        res = []
        for s in sk:
            for cl in self.children_of(s):
                node = self.M[cl]
                if node.name != 'Deformer': continue
                bone = next((c for c in self.children_of(cl) if c in self.bones), None)
                res.append(dict(bone=bone, idx=node.find('Indexes').props[0] if node.find('Indexes') else np.zeros(0, int), w=node.find('Weights').props[0] if node.find('Weights') else np.zeros(0),
                                tf=mat4(node.find('Transform').props[0]), tl=mat4(node.find('TransformLink').props[0])))
        return res
    def textures_of(self, mat_id):
        res = {}
        for child, par, prop in self.opc:
            if par == mat_id and self.M.get(child) is not None and self.M[child].name == 'Texture': res[prop] = child
        return res
    def texture_bytes(self, tex_id):
        for v in self.children_of(tex_id):
            if self.M[v].name == 'Video':
                c = self.M[v].find('Content')
                if c and c.props and isinstance(c.props[0], (bytes, bytearray)) and len(c.props[0]) > 100: return bytes(c.props[0])
        return None

    # ---------- animation ----------
    def clip(self):
        """-> (duration_s, {bone_id: {'R': (times, eulers[n,3]), 'T': (times, vals[n,3])}}, rest_hips_y)"""
        stacks = [i for i, n in self.M.items() if n.name == 'AnimationStack']
        best = None
        for s in stacks:
            layers = [c for c in self.children_of(s) if self.M[c].name == 'AnimationLayer']
            nodes = [c for l in layers for c in self.children_of(l) if self.M[c].name == 'AnimationCurveNode']
            if best is None or len(nodes) > best[1]: best = (s, len(nodes), nodes)
        stack, _, nodes = best
        pp = self.M[stack].p70(); t0 = float(pp.get('LocalStart', [0] * 5)[0]) / KTIME if 'LocalStart' in pp else 0.0; t1 = float(pp['LocalStop'][0]) / KTIME
        data = {}
        for cn in nodes:
            target = next(((par, prop) for child, par, prop in self.opc if child == cn and par in self.bones), None)
            if not target: continue
            bone, prop = target; kind = {'Lcl Rotation': 'R', 'Lcl Translation': 'T'}.get(prop)
            if not kind: continue
            dp = self.M[cn].p70(); chans = {}
            for child, par, p in self.opc:
                if par == cn and self.M.get(child) is not None and self.M[child].name == 'AnimationCurve': chans[p[-1]] = self.M[child]
            default = [float(dp.get('d|' + a, [0])[0]) for a in 'XYZ']
            times = None; cols = []
            for k, a in enumerate('XYZ'):
                cv = chans.get(a)
                if cv is None: cols.append((None, default[k])); continue
                ts = cv.find('KeyTime').props[0] / KTIME; vs = cv.find('KeyValueFloat').props[0].astype(float); cols.append((ts, vs))
                if times is None or len(ts) > len(times): times = ts
            if times is None: continue
            vals = np.zeros((len(times), 3))
            for k, (ts, vs) in enumerate(cols): vals[:, k] = vs if ts is None and False else (np.interp(times, ts, vs) if ts is not None else vs)
            data.setdefault(bone, {})[kind] = (times, vals)
        hips = next(i for i in self.bones if self.names[i] == 'Hips')
        return t1 - t0, t0, data, float(self.local(hips)[1, 3])
