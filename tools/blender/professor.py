# Hogwarts professors, one rigged GLB each. Headless:
#   blender -b -P tools/blender/professor.py                 -> all nine public/models/professor_<key>.glb
#   blender -b -P tools/blender/professor.py -- who=snape    -> one
# Modeled in a 1.9 m reference figure; every coordinate is multiplied by s = height / 1.9 (x and y also by
# the width factor) before it reaches Blender, so each GLB is already at its real height and the app
# never scales it. Faces -Y, feet at z = 0, wand in the right hand (at -X).
import bpy, bmesh, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

PROFESSORS = {
    "dumbledore": dict(name="Albus Dumbledore", robe="#4b2479", trim="#c9b6e8", skin="#efd2bd", hair="#f1f0ec", iris="#3f7fc6", height=1.95),
    "mcgonagall": dict(name="Minerva McGonagall", robe="#0f3b2a", trim="#1b5a40", skin="#f0d6c4", hair="#5d5a58", iris="#5d7a5a", height=1.78),
    "trelawney": dict(name="Sybill Trelawney", robe="#6b4a32", trim="#d9a441", skin="#f2dccb", hair="#8a6a4a", iris="#8a6a2e", height=1.7),
    "slughorn": dict(name="Horace Slughorn", robe="#5a1f2e", trim="#c9a44a", skin="#efc9ae", hair="#bcb7ad", iris="#6b8a5a", height=1.78),
    "snape": dict(name="Severus Snape", robe="#0b0b0d", trim="#1c1c22", skin="#e6dccf", hair="#0f0e10", iris="#1a1416", height=1.88),
    "lockhart": dict(name="Gilderoy Lockhart", robe="#a77fd0", trim="#e6c9ff", skin="#f3d3bb", hair="#e8c870", iris="#3f86d6", height=1.85),
    "moody": dict(name="Alastor Moody", robe="#3a3a30", trim="#5a5240", skin="#d9b39a", hair="#8f8a80", iris="#5a4632", height=1.85),
    "flitwick": dict(name="Filius Flitwick", robe="#22304f", trim="#3d5a8a", skin="#f0cfb4", hair="#f2f2f2", iris="#4a3426", height=1.05),
    "hagrid": dict(name="Rubeus Hagrid", robe="#5b4330", trim="#3b2c1f", skin="#e2b28f", hair="#2e2219", iris="#24170f", height=2.7),
}
WIDE = {"hagrid": 1.3, "slughorn": 1.12}

HEAD_C, HEAD_R = (0.0, 0.0, 1.7), (0.12, 0.125, 0.14)
SH_X, SH_Z, EL_Z, WR_Z = 0.25, 1.46, 1.2, 0.98


class Sc:
    """Parts wrapper that maps reference-figure coordinates to the real figure."""

    def __init__(self, P, s, w):
        self.P, self.s, self.w = P, s, w

    def T(self, v):
        return (v[0] * self.s * self.w, v[1] * self.s * self.w, v[2] * self.s)

    def R(self, r):
        return (r[0] * self.s * self.w, r[1] * self.s * self.w, r[2] * self.s)

    def sphere(self, name, loc, radii, m, bone, **kw):
        return self.P.sphere(name, self.T(loc), self.R(radii), m, bone, **kw)

    def cyl(self, name, loc, r1, r2, depth, m, bone, **kw):
        sw = self.s * self.w
        return self.P.cyl(name, self.T(loc), r1 * sw, r2 * sw, depth * self.s, m, bone, **kw)

    def box(self, name, loc, size, m, bone, **kw):
        return self.P.box(name, self.T(loc), self.R(size), m, bone, **kw)

    def torus(self, name, loc, R, r, m, bone, **kw):
        sw = self.s * self.w
        return self.P.torus(name, self.T(loc), R * sw, r * sw, m, bone, **kw)

    def strand(self, name, pts, r0, r1, m, bone, blend=None, **kw):
        sw = self.s * self.w
        if blend:
            blend = (blend[0], blend[1] * self.s, blend[2] * self.s)
        return self.P.strand(name, [self.T(q) for q in pts], r0 * sw, r1 * sw, m, bone, blend=blend, **kw)

    def lathe(self, name, profile, m, bone, loc=(0, 0, 0), disp=None, **kw):
        sw = self.s * self.w
        d = (lambda th, z: disp(th, z / self.s) * sw) if disp else None
        return self.P.lathe(name, [(r * sw, z * self.s) for r, z in profile], m, bone, loc=self.T(loc), disp=d, **kw)


def head_pt(x, z, off=0.0):
    return lib.ellipsoid_front(HEAD_C, HEAD_R, x, z, off)


def cut_half(o, keep_below_z):
    """Keep the part of mesh `o` below world z (half-moon glasses)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, keep_below_z), plane_no=(0, 0, 1), clear_outer=True)
    bm.to_mesh(o.data)
    bm.free()


def materials(p):
    h = lib.hexrgb
    return {
        "robe": lib.mat("Robe", h(p["robe"]), 0.85),
        # inside of the sleeves: the robe colour in shadow
        "lining": lib.mat("Lining", tuple(c * 0.35 for c in h(p["robe"])), 0.9),
        "trim": lib.mat("Trim", h(p["trim"]), 0.7),
        "skin": lib.mat("Skin", h(p["skin"]), 0.55),
        "hair": lib.mat("Hair", h(p["hair"]), 0.9),
        "eye": lib.mat("EyeWhite", (0.95, 0.95, 0.93), 0.3),
        "pupil": lib.mat("Pupil", h("#0d0907"), 0.25),
        "iris": lib.mat("Iris", h(p["iris"]), 0.2),
        "glint": lib.mat("EyeGlint", (1, 1, 1), 0.1, emit=(1, 1, 1)),
        "mouth": lib.mat("Mouth", h("#6b2f2a"), 0.6),
        "teeth": lib.mat("Teeth", (0.97, 0.97, 0.95), 0.3),
        "wand": lib.mat("Wand", h("#3b2617"), 0.6),
        "tip": lib.mat("WandTip", h("#ffd6ea"), 0.3, emit=h("#ff4fa3")),
        "gold": lib.mat("Gold", h("#c9a44a"), 0.3, metal=0.9),
        "metal": lib.mat("Metal", h("#8a8f96"), 0.3, metal=0.9),
        "dark": lib.mat("Dark", h("#1a1410"), 0.7),
        "blush": lib.mat("Blush", h("#e8a49a"), 0.6),
    }


def robe_folds(th, z):
    """Radial offset of the robe: nine irregular pleats that deepen toward the hem, plus three soft
    horizontal fold rings (reference-figure meters)."""
    a = 0.022 * max(0.0, (0.95 - z) / 0.95) ** 1.5
    pleat = a * math.sin(9 * th + 0.6 * math.sin(3 * th))
    rings = 0.006 * sum(math.exp(-(((z - zk) / 0.035) ** 2)) for zk in (0.3, 0.55, 0.78))
    return pleat + rings


def base_body(Q, M, who):
    robe, trim, skin = M["robe"], M["trim"], M["skin"]
    belly = who == "slughorn"
    # robe skirt: a 12 mm thick lathed shell with pleats and fold rings; the hem is a rolled trim band
    r_out = lambda z: 0.37 - 0.137 * z
    outer = [(r_out(z), z) for z in [0.0] + [0.03 + 0.093 * i for i in range(14)]]
    outer[-1] = (r_out(1.24), 1.24)
    inner = [(r_out(z) - 0.012, z) for z in (1.24, 0.3, 0.1, 0.0)]
    Q.lathe("robe", outer + inner, robe, "spine", seg=36, disp=robe_folds, closed=True)
    hem = [(0.37, 0.0), (0.384, 0.004), (0.389, 0.02), (0.389, 0.058), (0.384, 0.074), (0.371, 0.079),
           (0.358, 0.075), (0.353, 0.06), (0.353, 0.014), (0.358, 0.002)]
    Q.lathe("hem", hem, trim, "spine", seg=36, disp=robe_folds, closed=True)
    Q.cyl("torso", (0, 0, 1.33), 0.2, 0.215, 0.3, robe, "chest", verts=24)
    Q.sphere("shoulders", (0, 0, 1.47), (0.27, 0.17, 0.09), robe, "chest", seg=12, rings=6, subd=1)
    Q.box("placket", (0, -0.2, 1.05), (0.06, 0.012, 0.85), trim, "spine", rot=(-0.12, 0, 0))
    if belly:
        Q.sphere("belly", (0, -0.06, 1.1), (0.31, 0.3, 0.33), robe, "spine", seg=20, rings=12, subd=1)
        for z in (1.18, 1.04, 0.92):
            Q.sphere(f"btn{z}", (0, -0.355, z), (0.02, 0.012, 0.02), M["gold"], "spine", seg=8, rings=5)
    Q.cyl("neck", (0, 0, 1.57), 0.05, 0.05, 0.1, skin, "head", verts=12)
    Q.torus("collar", (0, 0, 1.53), 0.075, 0.025, trim, "chest", seg=12, minor=4, subd=1)
    # head: smooth skull, ears
    Q.sphere("head", HEAD_C, HEAD_R, skin, "head", seg=16, rings=10, subd=1)
    for s in (1, -1):
        Q.sphere(f"ear{s}", (0.12 * s, 0.0, 1.7), (0.02, 0.03, 0.038), skin, "head", seg=6, rings=4, subd=1)
    # arms: upper sleeve, a thick bell sleeve with a few pleats, cuff, and a mitt hand. A lining
    # disc closes the bell 6 cm above the opening, so a raised arm shows dark cloth instead of
    # the hollow tube; the mitt (wrist, flat palm, thumb) starts inside the cuff
    bell = [(0.11, -0.12), (0.095, -0.06), (0.08, 0.0), (0.068, 0.12), (0.056, 0.12), (0.069, 0.0), (0.084, -0.06), (0.099, -0.116)]
    for s, side in ((1, "L"), (-1, "R")):
        Q.cyl(f"upsleeve.{side}", (0.275 * s, 0, 1.33), 0.07, 0.065, 0.28, robe, f"upperarm.{side}", rot=(0, 0.15 * s, 0), verts=14)
        Q.lathe(f"bell.{side}", bell, robe, f"lowerarm.{side}", seg=20, loc=(0.305 * s, 0, 1.08), rot=(0, 0.03 * s, 0),
                disp=lambda th, z: 0.006 * math.sin(7 * th) * (0.12 - z) / 0.24, closed=True)
        Q.torus(f"cuff.{side}", (0.307 * s, 0, 0.965), 0.108, 0.012, trim, f"lowerarm.{side}", seg=16, minor=4)
        Q.cyl(f"sleevecap.{side}", (0.305 * s, 0, 1.02), 0.086, 0.086, 0.012, M["lining"], f"lowerarm.{side}", rot=(0, 0.03 * s, 0), verts=20)
        Q.cyl(f"wrist.{side}", (0.31 * s, -0.012, 0.985), 0.03, 0.028, 0.07, skin, f"lowerarm.{side}", verts=10)
        Q.sphere(f"hand.{side}", (0.31 * s, -0.018, 0.918), (0.027, 0.046, 0.058), skin, f"lowerarm.{side}", seg=10, rings=6, subd=1)
        Q.sphere(f"thumb.{side}", (0.29 * s, -0.05, 0.935), (0.015, 0.016, 0.032), skin, f"lowerarm.{side}", rot=(0.5, 0, 0), seg=8, rings=5, subd=1)


def face(Q, M, who):
    """Brow ridge, nose bridge and nostrils, eyes with whites, coloured irises, pupils and a highlight,
    strand eyebrows, mouth, blush."""
    ez = 1.722
    skin = M["skin"]
    Q.sphere("browridge", head_pt(0, ez + 0.02, -0.011), (0.072, 0.024, 0.014), skin, "head", seg=8, rings=6, subd=1)
    Q.sphere("bridge", head_pt(0, 1.706, -0.004), (0.013, 0.02, 0.03), skin, "head", seg=8, rings=6, subd=1)
    Q.sphere("nose", head_pt(0, 1.684, 0.012), (0.019, 0.022, 0.019), skin, "head", seg=8, rings=6, subd=1)
    for s in (1, -1):
        Q.sphere(f"nostril{s}", head_pt(0.013 * s, 1.676, 0.004), (0.011, 0.013, 0.009), skin, "head", seg=6, rings=4, subd=1)
    brow_col = M["hair"] if who not in ("dumbledore", "flitwick") else lib.mat("BrowWhite", (0.9, 0.9, 0.9), 0.9)
    big = 1.3 if who == "trelawney" else 1.0  # magnified by her glasses
    for s in (1, -1):
        x = 0.045 * s
        Q.sphere(f"eyew{s}", head_pt(x, ez, -0.004), (0.022 * big, 0.012, 0.017 * big), M["eye"], "head", seg=8, rings=6, subd=1)
        if who == "moody" and s == -1:
            Q.sphere("magiceye", head_pt(x, ez, 0.006), (0.032, 0.02, 0.032), lib.mat("MagicEye", lib.hexrgb("#3fa9ff"), 0.2, emit=lib.hexrgb("#3fa9ff")), "head", seg=12, rings=8, subd=1)
            Q.sphere("magicpupil", head_pt(x, ez, 0.024), (0.01, 0.005, 0.01), M["pupil"], "head", seg=8, rings=4)
            Q.torus("magicring", head_pt(x, ez, 0.012), 0.036, 0.007, M["metal"], "head", rot=(math.pi / 2, 0, 0), seg=16, minor=5)
            Q.box("strap", (0.0, -0.02, ez + 0.03), (0.25, 0.25, 0.012), M["dark"], "head", rot=(0, -0.45, 0))
        else:
            Q.sphere(f"iris{s}", head_pt(x, ez - 0.001, 0.005), (0.0115 * big, 0.004, 0.0115 * big), M["iris"], "head", seg=12, rings=6)
            Q.sphere(f"pupil{s}", head_pt(x, ez - 0.001, 0.0075), (0.0055 * big, 0.003, 0.0055 * big), M["pupil"], "head", seg=8, rings=4)
            Q.sphere(f"glint{s}", head_pt(x - 0.004, ez + 0.004, 0.0095), (0.0025, 0.0012, 0.0025), M["glint"], "head", seg=6, rings=4)
        # eyebrow: a flat tapered strand along the brow ridge, slanted per character
        tilt = 0.012 if who in ("snape", "mcgonagall") else (-0.006 if who in ("dumbledore", "hagrid", "slughorn") else 0.0)
        pts = [head_pt(s * (0.018 + 0.056 * k), ez + 0.039 + 0.008 * math.sin(math.pi * k) - tilt * (k - 0.5) * 2, 0.004) for k in (0, 0.33, 0.66, 1.0)]
        thick = 0.0085 if who in ("dumbledore", "hagrid", "moody", "slughorn") else 0.0055
        Q.strand(f"brow{s}", pts, thick, 0.002, brow_col, "head", sides=4, flat=0.45, wide=(0, 0, 1))
    if who == "lockhart":
        Q.sphere("smile", head_pt(0, 1.645, 0.012), (0.056, 0.012, 0.03), M["teeth"], "head", seg=12, rings=6)
        Q.box("smileline", head_pt(0, 1.645, 0.024), (0.085, 0.004, 0.003), M["mouth"], "head")
    elif who in ("snape", "mcgonagall"):
        Q.box("mouth", head_pt(0, 1.645, 0.0), (0.045, 0.01, 0.008), M["mouth"], "head")
    else:
        Q.sphere("mouth", head_pt(0, 1.646, 0.0), (0.03, 0.01, 0.009), M["mouth"], "head", seg=10, rings=4, subd=1)
    if who not in ("snape", "moody"):
        for s in (1, -1):
            Q.sphere(f"blush{s}", head_pt(0.07 * s, 1.675, -0.002), (0.022, 0.008, 0.014), M["blush"], "head", seg=8, rings=4)


def wand(Q, M, side="R"):
    s = 1 if side == "L" else -1
    Q.cyl("wand", (0.31 * s, -0.17, 0.93), 0.009, 0.006, 0.3, M["wand"], f"lowerarm.{side}", rot=(math.pi / 2, 0, 0), verts=8)
    Q.sphere("wandtip", (0.31 * s, -0.33, 0.93), (0.014, 0.014, 0.014), M["tip"], f"lowerarm.{side}", seg=8, rings=6)
    # a little silver ferrule at the tip and a pommel at the handle end
    Q.cyl("wandferrule", (0.31 * s, -0.31, 0.93), 0.0075, 0.0068, 0.03, M["metal"], f"lowerarm.{side}", rot=(math.pi / 2, 0, 0), verts=10)
    Q.sphere("wandpommel", (0.31 * s, -0.02, 0.93), (0.012, 0.012, 0.012), M["metal"], f"lowerarm.{side}", seg=8, rings=6)


def curve(ctrl, n):
    """n points on a Catmull-Rom spline through the control points (ends clamped)."""
    C = [ctrl[0]] + list(ctrl) + [ctrl[-1]]
    out = []
    for k in range(n):
        u = k / (n - 1) * (len(ctrl) - 1)
        i = min(int(u), len(ctrl) - 2)
        t = u - i
        p0, p1, p2, p3 = (C[i + j] for j in range(4))
        out.append(tuple(0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t * t
                                + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t ** 3) for d in range(3)))
    return out


def jit(i, k=0):
    """Deterministic pseudo-random number in [-1, 1] for strand i (so rebuilds are identical)."""
    return math.sin(i * 12.9898 + k * 78.233) * 43758.5453 % 1.0 * 2 - 1


def temples(Q, m, x_frame, z, off):
    """Glasses arms: from the outer edge of each frame back along the side of the head to the ear."""
    for s in (1, -1):
        a = head_pt(s * x_frame, z, off)
        Q.strand(f"temple{s}", curve([a, (s * 0.118, -0.06, z + 0.004), (s * 0.128, 0.0, z - 0.004), (s * 0.12, 0.03, z - 0.03)], 6),
                 0.0028, 0.0024, m, "head", sides=4)


def dumbledore_hair(Q, M):
    hair = M["hair"]
    Q.sphere("hairback", (0, 0.03, 1.73), (0.135, 0.12, 0.14), hair, "head", seg=10, rings=6, subd=1)
    Q.sphere("beardtop", (0, -0.115, 1.6), (0.105, 0.06, 0.07), hair, "head", seg=10, rings=6, subd=1)
    # beard core behind the locks (no gaps), tapering to the point of the beard
    Q.sphere("beardcore", (0, -0.235, 1.22), (0.085, 0.032, 0.3), hair, "chest", rot=(math.pi, 0, 0), seg=8, rings=8, taper=(0.0, 0.8), subd=1)
    # beard: three layers of tapered locks from the jaw, the centre ones longest
    i = 0
    for layer, (dy, n) in enumerate(((0.0, 11), (0.022, 9), (0.044, 7))):
        for k in range(n):
            u = -1 + 2 * (k + 0.5) / n
            x0, z0 = 0.09 * u, 1.645 - 0.03 * (1 - u * u)
            root = head_pt(x0, z0, -0.008)
            tipz = 0.9 + 0.2 * abs(u) ** 1.2 + 0.07 * layer + 0.03 * jit(i)
            y = lambda z: -(0.245 + 0.045 * (1.45 - z) / 0.55) + dy
            sway = 0.012 * jit(i, 1)
            ctrl = [root, (x0 * 1.1, root[1] - 0.05, z0 - 0.07), (x0 * 1.05 + sway, y(1.45), 1.45),
                    (x0 * 0.78 - sway, y(1.22), 1.22), (x0 * 0.45 + sway, y(1.05), (1.05 + tipz) / 2 + 0.06), (x0 * 0.25, y(tipz), tipz)]
            Q.strand(f"beard{i}", curve(ctrl, 7), 0.021, 0.002, hair, "head", sides=5, flat=0.55, wide=(1, 0, 0), blend=("chest", 1.6, 1.45))
            i += 1
    # mustache: locks from under the nose sweeping out and down past the mouth corners
    for s in (1, -1):
        for k in range(5):
            a = head_pt(s * (0.006 + 0.004 * k), 1.668 - 0.002 * k, 0.014)
            b = head_pt(s * (0.045 + 0.006 * k), 1.655 - 0.004 * k, 0.016)
            c = head_pt(s * (0.07 + 0.008 * k), 1.618 - 0.01 * k, 0.012)
            Q.strand(f"mst{s}{k}", curve([a, b, c], 6), 0.009, 0.0018, hair, "head", sides=4, flat=0.6, wide=(0, 0, 1))
    # long hair: locks from under the hat brim over the sides and down the back
    for k in range(16):
        a = math.radians(-105 + 210 * k / 15)  # 0 = straight back (+Y)
        sx, cy = math.sin(a), math.cos(a)
        side = abs(sx)
        z_end = 1.56 + 0.2 * side ** 2 * (1 if cy < 0.3 else 0.5) - 0.25 * max(cy, 0) + 0.03 * jit(k, 2)
        ctrl = [(0.12 * sx, 0.115 * cy + 0.02, 1.76), (0.142 * sx, 0.14 * cy + 0.03, 1.67), (0.16 * sx, 0.17 * cy + 0.05, 1.56),
                (0.165 * sx, 0.2 * cy + 0.07, max(z_end + 0.05, 1.42)), (0.165 * sx, 0.21 * cy + 0.08, z_end)]
        Q.strand(f"hair{k}", curve(ctrl, 6), 0.026, 0.003, hair, "head", sides=4, flat=0.35, wide=(cy, -sx, 0), blend=("chest", 1.6, 1.48))


def mcgonagall_hair(Q, M):
    hair = M["hair"]
    Q.sphere("hair", (0, 0.02, 1.75), (0.13, 0.12, 0.12), hair, "head", seg=10, rings=6, subd=1)
    # bun: one thick strand coiled 2.5 turns, facing back
    c = (0, 0.138, 1.715)
    pts = []
    for k in range(34):
        t = k / 33
        a = t * 2.5 * math.tau
        r = 0.05 * (1 - t) + 0.01
        pts.append((c[0] + r * math.cos(a), c[1] + 0.02 * t, c[2] + r * math.sin(a)))
    Q.strand("bun", pts, 0.017, 0.009, hair, "head", sides=6)
    # hair combed from the hairline back to the bun
    for k in range(12):
        s = 1 if k < 6 else -1
        a = math.radians(55 + 22 * (k % 6))  # angle from the back
        ctrl = []
        for t in (0.0, 0.35, 0.7, 1.0):
            aa = a * (1 - t)
            ctrl.append((s * 0.136 * math.sin(aa), 0.126 * math.cos(aa) + 0.02, 1.765 - 0.045 * t))
        Q.strand(f"comb{k}", curve(ctrl, 6), 0.012, 0.006, hair, "head", sides=4, flat=0.5, wide=(0, 0, 1))


def trelawney_hair(Q, M):
    hair = M["hair"]
    for i in range(10):
        a = i / 10 * math.tau
        Q.sphere(f"frizz{i}", (math.cos(a) * 0.14, math.sin(a) * 0.09 + 0.03, 1.74 + math.sin(a * 2) * 0.05), (0.07, 0.07, 0.08), hair, "head", seg=6, rings=4, subd=1)
    Q.sphere("hairtop", (0, 0.02, 1.83), (0.15, 0.12, 0.08), hair, "head", seg=8, rings=6, subd=1)
    Q.sphere("haircap", (0, 0.025, 1.76), (0.138, 0.13, 0.125), hair, "head", seg=8, rings=6, subd=1)
    # corkscrew curls hanging round the sides and back (none over the face)
    for k in range(20):
        a = math.radians(-140 + 280 * k / 19)  # 0 = back
        sx, cy = math.sin(a), math.cos(a)
        top = (0.17 * sx, 0.14 * cy + 0.03, 1.73 + 0.03 * jit(k))
        length = 0.2 + 0.06 * jit(k, 1)
        pts = []
        for j in range(12):
            t = j / 11
            w = t * 2.2 * math.tau + k
            r = 0.028 * (1 - 0.3 * t)
            pts.append((top[0] * (1 + 0.15 * t) + r * math.cos(w) * cy, top[1] * (1 + 0.15 * t) + r * math.cos(w) * -sx, top[2] - length * t + r * math.sin(w)))
        Q.strand(f"curl{k}", pts, 0.015, 0.006, hair, "head", sides=4)


def hair_sheet(Q, name, m, a0, a1, z_top, z_bot, r, thick=0.012, cols=18, rows=8):
    """A closed shell of hair hanging round the head from z_top to z_bot at radius r (x, y radii), open
    over the face: angles a0..a1 measured from the back (+Y). It fills the gaps between the strand locks."""
    verts, faces = [], []
    for side, dr in (("out", 0.0), ("in", -thick)):
        for i in range(rows + 1):
            z = z_top + (z_bot - z_top) * i / rows
            k = min(1.0, (z_top - z) / 0.08)  # rounds in over the crown
            for j in range(cols + 1):
                a = a0 + (a1 - a0) * j / cols
                rr = (0.6 + 0.4 * k ** 0.5)
                verts.append(((r[0] * rr + dr) * math.sin(a), (r[1] * rr + dr) * math.cos(a) + 0.015, z))
    W = cols + 1
    off = (rows + 1) * W
    for i in range(rows):
        for j in range(cols):
            q = i * W + j
            faces.append((q, q + W, q + W + 1, q + 1))  # outer, facing out
            faces.append((off + q, off + q + 1, off + q + W + 1, off + q + W))  # inner, facing in
    for i in range(rows):  # side edges
        for j, flip in ((0, False), (cols, True)):
            q = i * W + j
            f = (q, off + q, off + q + W, q + W)
            faces.append(f[::-1] if flip else f)
    for j in range(cols):  # bottom edge
        q = rows * W + j
        faces.append((q, q + 1, off + q + 1, off + q))
    return Q.P.poly(name, [Q.T(v) for v in verts], faces, m, "head", smooth=True)


def snape_hair(Q, M):
    hair = M["hair"]
    Q.sphere("hair", (0, 0.015, 1.755), (0.138, 0.13, 0.12), hair, "head", seg=10, rings=6, subd=1)
    hair_sheet(Q, "curtain", hair, math.radians(-148), math.radians(148), 1.84, 1.54, (0.147, 0.14))
    # curtains: locks from a centre parting over the skull and straight down to the jaw, framing the face
    for k in range(34):
        s = 1 if k % 2 else -1
        a = math.radians(170 - 340 * (k // 2) / 16) * s  # from the front parting round to the back
        sx, cy = abs(math.sin(a)) * s, math.cos(a)
        front = cy < -0.55
        z_end = (1.57 if front else 1.53) + 0.02 * jit(k)
        ctrl = [(0.02 * s, 0.12 * cy * 0.3 - 0.02, 1.875), (0.12 * sx, 0.12 * cy, 1.82), (0.148 * sx, 0.142 * cy + 0.01, 1.72),
                (0.152 * sx, 0.146 * cy + 0.015, 1.62), (0.15 * sx, 0.15 * cy + 0.02, z_end)]
        if front and abs(sx) < 0.75:
            continue  # keep the face clear
        Q.strand(f"lock{k}", curve(ctrl, 7), 0.034, 0.006, hair, "head", sides=4, flat=0.28, wide=(cy, -sx, 0))


def hagrid_hair(Q, M):
    hair = M["hair"]
    Q.sphere("hair", (0, 0.06, 1.78), (0.17, 0.15, 0.13), hair, "head", seg=10, rings=6, subd=1)
    Q.sphere("beard", (0, -0.07, 1.55), (0.16, 0.12, 0.11), hair, "head", seg=10, rings=6, subd=1)
    for i in range(12):
        a = i / 12 * math.tau
        Q.sphere(f"bush{i}", (math.cos(a) * 0.15, 0.03 + abs(math.sin(a)) * 0.02, 1.66 + math.sin(a) * 0.14), (0.06, 0.06, 0.06), hair, "head", seg=6, rings=4, subd=1)
    # wild wavy strands: out of the beard (down and forward) and the hair (up and out)
    for k in range(44):
        beard = k < 26
        if beard:
            a = math.radians(-80 + 160 * (k / 25))  # round the front of the beard
            base = (0.15 * math.sin(a), -0.07 - 0.11 * math.cos(a), 1.53 - 0.04 * abs(math.sin(a)))
            out = (math.sin(a) * 0.3, -math.cos(a) * 0.45, -1.0)
        else:
            a = (k - 26) / 18 * math.tau
            base = (0.16 * math.cos(a), 0.06 + 0.14 * math.sin(a), 1.8 + 0.04 * math.sin(3 * a))
            out = (math.cos(a) * 0.55, math.sin(a) * 0.55, -0.6)
        L = 0.065 + 0.02 * jit(k)
        ctrl = []
        for j in range(5):
            t = j / 4
            wig = 0.014 * math.sin(t * 7 + k)
            ctrl.append((base[0] + out[0] * L * t + wig, base[1] + out[1] * L * t, base[2] + out[2] * L * t + wig * 0.5))
        Q.strand(f"wild{k}", curve(ctrl, 6), 0.018, 0.004, hair, "head", sides=4)


def extras(Q, M, who):
    hair = M["hair"]
    if who == "dumbledore":
        dumbledore_hair(Q, M)
        # half-moon spectacles: torus frames cut at the middle, a bridge, and arms back to the ears
        gl = Q.torus("glassesL", head_pt(0.046, 1.716, 0.024), 0.025, 0.0035, M["gold"], "head", rot=(math.pi / 2, 0, 0), seg=24, minor=5)
        cut_half(gl, Q.T((0, 0, 1.716))[2] + 0.002)
        gr = Q.torus("glassesR", head_pt(-0.046, 1.716, 0.024), 0.025, 0.0035, M["gold"], "head", rot=(math.pi / 2, 0, 0), seg=24, minor=5)
        cut_half(gr, Q.T((0, 0, 1.716))[2] + 0.002)
        Q.strand("bridge", curve([head_pt(-0.022, 1.716, 0.026), head_pt(0, 1.722, 0.03), head_pt(0.022, 1.716, 0.026)], 5), 0.0028, 0.0028, M["gold"], "head")
        temples(Q, M["gold"], 0.072, 1.717, 0.012)
        hat = lib.mat("Hat", lib.hexrgb(PROFESSORS["dumbledore"]["robe"]), 0.85)
        Q.cyl("hatbrim", (0, 0, 1.81), 0.19, 0.19, 0.02, hat, "head", verts=20)
        Q.cyl("hat1", (0, 0, 1.98), 0.15, 0.08, 0.34, hat, "head", verts=16, rot=(0.08, 0, 0))
        Q.cyl("hat2", (0, 0.04, 2.25), 0.082, 0.0, 0.26, hat, "head", verts=12, rot=(0.35, 0, 0))
        Q.torus("hatband", (0, 0, 1.84), 0.145, 0.012, M["trim"], "head", seg=16, minor=4)
        for i in range(4):
            a = i * 1.6
            Q.sphere(f"star{i}", (math.sin(a) * 0.1, -math.cos(a) * 0.1 - 0.04, 1.9 + i * 0.07), (0.015, 0.008, 0.015), M["gold"], "head", seg=6, rings=4)
        wand(Q, M)
    elif who == "mcgonagall":
        mcgonagall_hair(Q, M)
        for s in (1, -1):
            Q.torus(f"glass{s}", head_pt(0.046 * s, 1.722, 0.024), 0.026, 0.0035, M["dark"], "head", rot=(math.pi / 2, math.pi / 4, 0), seg=4, minor=6)
        Q.box("bridge", head_pt(0, 1.722, 0.03), (0.03, 0.004, 0.004), M["dark"], "head")
        temples(Q, M["dark"], 0.072, 1.722, 0.012)
        hat = lib.mat("Hat", lib.hexrgb("#0a2219"), 0.85)
        Q.cyl("hatbrim", (0, 0, 1.82), 0.3, 0.3, 0.015, hat, "head", verts=24)
        Q.cyl("hat", (0, 0.01, 2.07), 0.14, 0.0, 0.5, hat, "head", verts=16, rot=(-0.1, 0, 0))
        Q.torus("hatband", (0, 0, 1.84), 0.135, 0.012, M["trim"], "head", seg=16, minor=4)
        Q.cyl("brooch", (0, -0.21, 1.47), 0.035, 0.035, 0.012, M["gold"], "chest", rot=(math.pi / 2, 0, 0), verts=10)
        wand(Q, M)
    elif who == "trelawney":
        trelawney_hair(Q, M)
        for s in (1, -1):
            Q.torus(f"glass{s}", head_pt(0.05 * s, 1.722, 0.026), 0.04, 0.005, M["gold"], "head", rot=(math.pi / 2, 0, 0), seg=20, minor=5)
        Q.strand("bridge", curve([head_pt(-0.012, 1.722, 0.03), head_pt(0, 1.728, 0.034), head_pt(0.012, 1.722, 0.03)], 5), 0.003, 0.003, M["gold"], "head")
        temples(Q, M["gold"], 0.09, 1.722, 0.016)
        shawl = lib.mat("Shawl", lib.hexrgb("#b5643c"), 0.9)
        Q.cyl("shawl", (0, 0, 1.43), 0.255, 0.225, 0.18, shawl, "chest", verts=20, cap=False)
        Q.cyl("shawlfringe", (0, 0, 1.31), 0.275, 0.255, 0.06, lib.mat("Fringe", lib.hexrgb("#3f7a5a"), 0.9), "chest", verts=20, cap=False)
        for i in range(3):
            Q.torus(f"beads{i}", (0, -0.03, 1.42 - i * 0.05), 0.13 - i * 0.008, 0.01, M["gold"], "chest", rot=(1.25, 0, 0), seg=12, minor=4)
        Q.sphere("crystal", (0.31, -0.08, 0.86), (0.1, 0.1, 0.1), lib.mat("Crystal", lib.hexrgb("#bfe3ff"), 0.05, emit=lib.hexrgb("#7fb2ff")), "lowerarm.L", seg=16, rings=10)
        wand(Q, M)
    elif who == "slughorn":
        for s in (1, -1):
            Q.sphere(f"sidehair{s}", (0.11 * s, 0.02, 1.71), (0.045, 0.08, 0.07), hair, "head", seg=10, rings=6)
        Q.sphere("backhair", (0, 0.08, 1.68), (0.1, 0.05, 0.07), hair, "head", seg=10, rings=6)
        for s in (1, -1):
            Q.sphere(f"mustache{s}", head_pt(0.045 * s, 1.662, 0.016), (0.05, 0.022, 0.025), hair, "head", rot=(0, -0.35 * s, 0), seg=10, rings=6)
            Q.sphere(f"droop{s}", head_pt(0.08 * s, 1.64, 0.008), (0.022, 0.018, 0.035), hair, "head", seg=8, rings=6)
        wand(Q, M)
    elif who == "snape":
        snape_hair(Q, M)
        for i in range(8):
            Q.sphere(f"btn{i}", (0, -0.212 - 0.005 * i, 1.46 - i * 0.075), (0.012, 0.01, 0.012), lib.mat("Button", lib.hexrgb("#2a2a33"), 0.4), "chest" if i < 3 else "spine", seg=6, rings=4)
        wand(Q, M)
    elif who == "lockhart":
        Q.sphere("hair", (0, 0.01, 1.78), (0.145, 0.13, 0.11), hair, "head", seg=16, rings=10)
        Q.sphere("quiff", (0, -0.07, 1.84), (0.12, 0.07, 0.06), hair, "head", rot=(0.4, 0, 0), seg=12, rings=8)
        for s in (1, -1):
            Q.sphere(f"wave{s}", (0.12 * s, 0.0, 1.7), (0.045, 0.1, 0.09), hair, "head", seg=10, rings=8)
        Q.sphere("cravat", (0, -0.19, 1.5), (0.065, 0.04, 0.05), lib.mat("Cravat", lib.hexrgb("#f2e6ff"), 0.6), "chest", seg=10, rings=6)
        Q.sphere("star", (0, -0.21, 1.4), (0.025, 0.008, 0.025), lib.mat("Star", lib.hexrgb("#ffd700"), 0.3, emit=lib.hexrgb("#ffd700")), "chest", seg=6, rings=4)
        wand(Q, M)
    elif who == "moody":
        for i in range(10):
            a = math.pi * 0.1 + i / 9 * math.pi * 0.8
            Q.sphere(f"shag{i}", (math.cos(a) * 0.13, math.sin(a) * 0.09 + 0.02, 1.74 + math.sin(a) * 0.05), (0.06, 0.06, 0.12), hair, "head", seg=8, rings=6)
        scar = lib.mat("Scar", lib.hexrgb("#9c6a5a"), 0.7)
        Q.box("scar1", head_pt(0.06, 1.68, 0.002), (0.05, 0.006, 0.006), scar, "head", rot=(0, 0.7, 0))
        Q.box("scar2", head_pt(-0.03, 1.66, 0.003), (0.006, 0.006, 0.05), scar, "head", rot=(0, 0.3, 0))
        Q.cyl("staff", (0.31, -0.06, 0.95), 0.022, 0.022, 1.9, lib.mat("Staff", lib.hexrgb("#4a3524"), 0.8), "lowerarm.L", verts=8)
        Q.sphere("knob", (0.31, -0.06, 1.92), (0.04, 0.04, 0.04), lib.mat("Staff", lib.hexrgb("#4a3524"), 0.8), "lowerarm.L", seg=8, rings=6, subd=1)
        Q.cyl("staffcap", (0.31, -0.06, 0.03), 0.026, 0.024, 0.06, M["metal"], "lowerarm.L", verts=10)
        wand(Q, M)
    elif who == "flitwick":
        for s in (1, -1):
            Q.sphere(f"tuft{s}", (0.12 * s, 0.0, 1.75), (0.07, 0.08, 0.08), hair, "head", seg=10, rings=6)
        Q.sphere("tufttop", (0, 0.02, 1.83), (0.08, 0.08, 0.05), hair, "head", seg=10, rings=6)
        Q.box("mustache", head_pt(0, 1.663, 0.012), (0.13, 0.025, 0.02), hair, "head")
        for s in (1, -1):
            Q.cyl(f"mtip{s}", head_pt(0.07 * s, 1.62, 0.01), 0.022, 0.0, 0.09, hair, "head", rot=(math.pi, 0, 0), verts=8)
        wand(Q, M)
    elif who == "hagrid":
        hagrid_hair(Q, M)
        # keep the eyes and nose clear of the beard: the beard sits below z=1.68
        Q.box("belt", (0, -0.03, 1.12), (0.44, 0.44, 0.06), M["dark"], "spine")
        Q.box("buckle", (0, -0.25, 1.12), (0.07, 0.02, 0.07), M["gold"], "spine")
        pink = lib.mat("Umbrella", lib.hexrgb("#f4a6c8"), 0.7)
        Q.cyl("ushaft", (-0.31, -0.08, 0.75), 0.008, 0.008, 0.75, M["wand"], "lowerarm.R", rot=(-0.12, 0, 0), verts=8)
        Q.cyl("ucanopy", (-0.31, -0.05, 0.62), 0.045, 0.012, 0.45, pink, "lowerarm.R", rot=(-0.12, 0, 0), verts=10)
        Q.torus("uhandle", (-0.31, -0.12, 1.0), 0.03, 0.008, M["wand"], "lowerarm.R", rot=(0, math.pi / 2, 0), seg=10, minor=4)
        Q.sphere("wandtip", (-0.31, -0.02, 0.38), (0.012, 0.012, 0.012), M["tip"], "lowerarm.R", seg=6, rings=4)
        Q.cyl("uferrule", (-0.31, -0.018, 0.4), 0.009, 0.007, 0.03, M["metal"], "lowerarm.R", rot=(-0.12, 0, 0), verts=8)


BONES_REF = [
    ("root", (0, 0, 0), (0, 0, 0.2), None),
    ("spine", (0, 0, 0.3), (0, 0, 1.2), "root"),
    ("chest", (0, 0, 1.2), (0, 0, 1.55), "spine"),
    ("head", (0, 0, 1.55), (0, 0, 1.95), "chest"),
    ("upperarm.L", (SH_X, 0, SH_Z), (0.3, 0, EL_Z), "chest"),
    ("lowerarm.L", (0.3, 0, EL_Z), (0.31, 0, WR_Z), "upperarm.L"),
    ("upperarm.R", (-SH_X, 0, SH_Z), (-0.3, 0, EL_Z), "chest"),
    ("lowerarm.R", (-0.3, 0, EL_Z), (-0.31, 0, WR_Z), "upperarm.R"),
]


def build_one(who, lod=1.0):
    lib.reset()
    p = PROFESSORS[who]
    s, w = p["height"] / 1.9, WIDE.get(who, 1.0)
    M = materials(p)
    P = lib.Parts(lod)
    Q = Sc(P, s, w)
    base_body(Q, M, who)
    face(Q, M, who)
    extras(Q, M, who)
    mesh = P.join(f"Professor_{who}")
    rig = lib.armature(f"ProfessorRig_{who}", [(n, Q.T(h), Q.T(t), par) for n, h, t, par in BONES_REF])
    lib.bind(mesh, rig)
    return rig, mesh


# Rotation conventions (probed): upperarm.R local X + swings the arm forward and up; local Z - swings it
# out to the side. upperarm.L local X + forward; local Z + out. head/chest local X + nods forward.
def animate(rig, who=""):
    A = lib.Anim(rig)
    A.reset()
    # Idle: 120 frames, breathe and a gentle sway, wand arm slightly forward
    for f, k in ((1, 0), (31, 1), (61, 0), (91, -1), (121, 0)):
        A.key("spine", "rotation_euler", f, (0, 0, 0.025 * k))
        A.key("chest", "scale", f, (1 + 0.012 * abs(k), 1, 1 + 0.012 * abs(k)))
        A.key("head", "rotation_euler", f, (0.03 * abs(k), 0, -0.06 * k))
        A.key("upperarm.R", "rotation_euler", f, (0.25, 0, 0))
        A.key("lowerarm.R", "rotation_euler", f, (0.35 + 0.03 * k, 0, 0))
        A.key("upperarm.L", "rotation_euler", f, (0.05, 0, 0.04))
        A.key("lowerarm.L", "rotation_euler", f, (0.15, 0, 0))
    A.push("Idle")
    # Lecture: 60 frames, open-palm gesture with the left arm out toward the class
    for f, k in ((1, 0), (16, 1), (31, 0.3), (46, 1), (61, 0)):
        if who == "moody":  # his left hand holds the staff, so he gestures with the wand hand
            A.key("upperarm.R", "rotation_euler", f, (0.3 + 0.3 * k, 0, -0.4 - 0.35 * k))
            A.key("lowerarm.R", "rotation_euler", f, (0.8 + 0.3 * k, 0, 0))
            A.key("upperarm.L", "rotation_euler", f, (0.05, 0, 0.04))
            A.key("lowerarm.L", "rotation_euler", f, (0.15, 0, 0))
        else:
            A.key("upperarm.L", "rotation_euler", f, (0.3 + 0.3 * k, 0, 0.4 + 0.35 * k))
            A.key("lowerarm.L", "rotation_euler", f, (0.8 + 0.3 * k, 0, 0))
            A.key("upperarm.R", "rotation_euler", f, (0.25, 0, 0))
            A.key("lowerarm.R", "rotation_euler", f, (0.35, 0, 0))
        A.key("head", "rotation_euler", f, (-0.04 * k, 0, 0.1 * k))
        A.key("chest", "rotation_euler", f, (0, 0, 0.06 * k))
    A.push("Lecture")
    # WandRaise: 73 frames (2.4 s): from the idle pose, wand arm sweeps up and forward, holds, comes back
    for f, k in ((1, 0), (16, 0.75), (25, 1), (49, 1), (61, 0.35), (73, 0)):
        A.key("upperarm.R", "rotation_euler", f, (0.25 + 1.5 * k, 0, -0.75 * k))
        A.key("lowerarm.R", "rotation_euler", f, (0.35 + 0.25 * k, 0, 0))
        A.key("upperarm.L", "rotation_euler", f, (0.05, 0, 0.04 + 0.15 * k))
        A.key("lowerarm.L", "rotation_euler", f, (0.15, 0, 0))
        A.key("head", "rotation_euler", f, (-0.1 * k, 0, 0))
        A.key("chest", "rotation_euler", f, (-0.05 * k, 0, 0))
    A.push("WandRaise")
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 120


def build(who, previews=True):
    rig, mesh = build_one(who)
    animate(rig, who)
    n = lib.tris([mesh])
    path = os.path.join(lib.MODELS, f"professor_{who}.glb")
    os.makedirs(lib.MODELS, exist_ok=True)
    kb = lib.export(path, [rig, mesh])
    print(f"[professor] {who} tris={n} kb={kb:.1f}")
    if previews and lib.PREVIEWS:
        H = PROFESSORS[who]["height"]
        s = H / 1.9
        lib.clips_preview(rig, f"professor-{who}", [
            ("Idle", 1, (0, 0, H * 0.55), H * 1.75 + 1.0, -25, 0.2, ""),
            ("Idle", 1, (0, 0, 1.7 * s), 0.75 * s + 0.15, 0, 0.0, "_face"),
            ("Lecture", 16, (0, 0, H * 0.55), H * 1.75 + 1.0, 20, 0.2, ""),
            ("WandRaise", 37, (0, 0, H * 0.6), H * 1.9 + 1.0, -45, 0.2, ""),
        ])
    return n, kb


if __name__ == "__main__":
    a = lib.args()
    keys = [a["who"]] if "who" in a else list(PROFESSORS)
    for k in keys:
        build(k)
