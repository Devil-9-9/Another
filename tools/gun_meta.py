#!/usr/bin/env python3
"""Works out where a rifle should sit in the RightHand bone so it matches the 'idle' (rifle aim) pose of a converted GLB.
   gun_meta.py assets/models/meta.json assets/models/remy.glb remy [more.glb id ...]"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from preview_glb import load, pose

def mat_to_quat(m):
    from fbx_scene import quat
    return quat(m)

def gun_for(path):
    doc, b = load(path); W = pose(doc, b, 'idle', 0.5); names = {n['name']: i for i, n in enumerate(doc['nodes'])}
    rh, lh, grip = W[names['RightHand']], W[names['LeftHand']], W[names['RightHandMiddle1']]
    f = lh[:3, 3] - rh[:3, 3]; f /= np.linalg.norm(f)                    # barrel points from the trigger hand to the support hand
    up = np.array([0, 1.0, 0]); up = up - f * np.dot(up, f); up /= np.linalg.norm(up)
    x = np.cross(up, f); R = np.c_[x, up, f]                             # columns: right, up, forward (three.js handedness)
    origin = grip[:3, 3] - up * 0.045
    G = np.eye(4); G[:3, :3] = R; G[:3, 3] = origin
    L = np.linalg.inv(rh) @ G
    q = mat_to_quat(L[:3, :3])
    return {'p': [round(float(v), 4) for v in L[:3, 3]], 'q': [round(float(v), 5) for v in q]}

if __name__ == '__main__':
    out = sys.argv[1]; meta = json.load(open(out)) if os.path.exists(out) else {}
    args = sys.argv[2:]
    for glb, mid in zip(args[0::2], args[1::2]): meta.setdefault(mid, {})['gun'] = gun_for(glb); print(mid, meta[mid]['gun'])
    json.dump(meta, open(out, 'w'), indent=1)
