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
    "dumbledore": dict(name="Albus Dumbledore", robe="#4b2479", trim="#c9b6e8", skin="#efd2bd", hair="#f1f0ec", height=1.95),
    "mcgonagall": dict(name="Minerva McGonagall", robe="#0f3b2a", trim="#1b5a40", skin="#f0d6c4", hair="#5d5a58", height=1.78),
    "trelawney": dict(name="Sybill Trelawney", robe="#6b4a32", trim="#d9a441", skin="#f2dccb", hair="#8a6a4a", height=1.7),
    "slughorn": dict(name="Horace Slughorn", robe="#5a1f2e", trim="#c9a44a", skin="#efc9ae", hair="#bcb7ad", height=1.78),
    "snape": dict(name="Severus Snape", robe="#0b0b0d", trim="#1c1c22", skin="#e6dccf", hair="#0f0e10", height=1.88),
    "lockhart": dict(name="Gilderoy Lockhart", robe="#a77fd0", trim="#e6c9ff", skin="#f3d3bb", hair="#e8c870", height=1.85),
    "moody": dict(name="Alastor Moody", robe="#3a3a30", trim="#5a5240", skin="#d9b39a", hair="#8f8a80", height=1.85),
    "flitwick": dict(name="Filius Flitwick", robe="#22304f", trim="#3d5a8a", skin="#f0cfb4", hair="#f2f2f2", height=1.05),
    "hagrid": dict(name="Rubeus Hagrid", robe="#5b4330", trim="#3b2c1f", skin="#e2b28f", hair="#2e2219", height=2.7),
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
        "trim": lib.mat("Trim", h(p["trim"]), 0.7),
        "skin": lib.mat("Skin", h(p["skin"]), 0.55),
        "hair": lib.mat("Hair", h(p["hair"]), 0.9),
        "eye": lib.mat("EyeWhite", (0.95, 0.95, 0.93), 0.3),
        "pupil": lib.mat("Pupil", h("#1d1410"), 0.25),
        "mouth": lib.mat("Mouth", h("#6b2f2a"), 0.6),
        "teeth": lib.mat("Teeth", (0.97, 0.97, 0.95), 0.3),
        "wand": lib.mat("Wand", h("#3b2617"), 0.6),
        "tip": lib.mat("WandTip", h("#ffd6ea"), 0.3, emit=h("#ff4fa3")),
        "gold": lib.mat("Gold", h("#c9a44a"), 0.3, metal=0.9),
        "metal": lib.mat("Metal", h("#8a8f96"), 0.3, metal=0.9),
        "dark": lib.mat("Dark", h("#1a1410"), 0.7),
        "blush": lib.mat("Blush", h("#e8a49a"), 0.6),
    }


def base_body(Q, M, who):
    robe, trim, skin = M["robe"], M["trim"], M["skin"]
    belly = who == "slughorn"
    # robe skirt and torso
    Q.cyl("robe", (0, 0, 0.62), 0.37, 0.2, 1.24, robe, "spine", verts=24, cap=False)
    Q.cyl("hem", (0, 0, 0.035), 0.375, 0.37, 0.07, trim, "spine", verts=24, cap=False)
    Q.cyl("torso", (0, 0, 1.33), 0.2, 0.215, 0.3, robe, "chest", verts=20)
    Q.sphere("shoulders", (0, 0, 1.47), (0.27, 0.17, 0.09), robe, "chest", seg=20, rings=10)
    Q.box("placket", (0, -0.2, 1.05), (0.06, 0.012, 0.85), trim, "spine", rot=(-0.12, 0, 0))
    if belly:
        Q.sphere("belly", (0, -0.06, 1.1), (0.31, 0.3, 0.33), robe, "spine", seg=20, rings=12)
        for z in (1.18, 1.04, 0.92):
            Q.sphere(f"btn{z}", (0, -0.355, z), (0.02, 0.012, 0.02), M["gold"], "spine", seg=8, rings=5)
    Q.cyl("neck", (0, 0, 1.57), 0.05, 0.05, 0.1, skin, "head", verts=10)
    Q.torus("collar", (0, 0, 1.53), 0.075, 0.025, trim, "chest", seg=16, minor=6)
    # head
    Q.sphere("head", HEAD_C, HEAD_R, skin, "head", seg=20, rings=14)
    for s in (1, -1):
        Q.sphere(f"ear{s}", (0.12 * s, 0.0, 1.7), (0.02, 0.03, 0.038), skin, "head", seg=8, rings=6)
    # arms: upper sleeve, bell sleeve, hand
    for s, side in ((1, "L"), (-1, "R")):
        Q.cyl(f"upsleeve.{side}", (0.275 * s, 0, 1.33), 0.07, 0.065, 0.28, robe, f"upperarm.{side}", rot=(0, 0.15 * s, 0), verts=12)
        Q.cyl(f"bell.{side}", (0.305 * s, 0, 1.08), 0.11, 0.065, 0.24, robe, f"lowerarm.{side}", rot=(0, 0.03 * s, 0), verts=14, cap=False)
        Q.torus(f"cuff.{side}", (0.307 * s, 0, 0.965), 0.108, 0.012, trim, f"lowerarm.{side}", seg=14, minor=4)
        Q.sphere(f"hand.{side}", (0.31 * s, -0.02, 0.93), (0.042, 0.04, 0.055), skin, f"lowerarm.{side}", seg=10, rings=8)


def face(Q, M, who):
    ez = 1.722
    for s in (1, -1):
        x = 0.045 * s
        big = 1.35 if who == "trelawney" else 1.0
        Q.sphere(f"eyew{s}", head_pt(x, ez, -0.004), (0.022 * big, 0.012, 0.018 * big), M["eye"], "head", seg=10, rings=6)
        if who == "moody" and s == -1:
            Q.sphere("magiceye", head_pt(x, ez, 0.006), (0.032, 0.02, 0.032), lib.mat("MagicEye", lib.hexrgb("#3fa9ff"), 0.2, emit=lib.hexrgb("#3fa9ff")), "head", seg=12, rings=8)
            Q.sphere("magicpupil", head_pt(x, ez, 0.024), (0.01, 0.005, 0.01), M["pupil"], "head", seg=8, rings=4)
            Q.torus("magicring", head_pt(x, ez, 0.012), 0.036, 0.007, M["metal"], "head", rot=(math.pi / 2, 0, 0), seg=14, minor=4)
            Q.box("strap", (0.0, -0.02, ez + 0.03), (0.25, 0.25, 0.012), M["dark"], "head", rot=(0, -0.45, 0))
        else:
            Q.sphere(f"pupil{s}", head_pt(x, ez - 0.002, 0.006), (0.011 * big, 0.006, 0.012 * big), M["pupil"], "head", seg=8, rings=6)
        # brows
        brow_col = M["hair"] if who not in ("dumbledore", "flitwick") else lib.mat("BrowWhite", (0.9, 0.9, 0.9), 0.9)
        tilt = (0.3 if who in ("snape", "mcgonagall") else -0.12) * s
        Q.box(f"brow{s}", head_pt(0.047 * s, ez + 0.034, 0.004), (0.045, 0.012, 0.011), brow_col, "head", rot=(0, tilt, 0))
    Q.sphere("nose", head_pt(0, 1.69, 0.006), (0.02, 0.028, 0.026), M["skin"], "head", seg=10, rings=6)
    if who == "lockhart":
        Q.sphere("smile", head_pt(0, 1.645, 0.012), (0.056, 0.012, 0.03), M["teeth"], "head", seg=12, rings=6)
        Q.box("smileline", head_pt(0, 1.645, 0.024), (0.085, 0.004, 0.003), M["mouth"], "head")
    elif who in ("snape", "mcgonagall"):
        Q.box("mouth", head_pt(0, 1.645, 0.0), (0.045, 0.01, 0.008), M["mouth"], "head")
    else:
        Q.sphere("mouth", head_pt(0, 1.646, 0.0), (0.03, 0.01, 0.009), M["mouth"], "head", seg=10, rings=4)
    if who not in ("snape", "moody"):
        for s in (1, -1):
            Q.sphere(f"blush{s}", head_pt(0.07 * s, 1.675, -0.002), (0.022, 0.008, 0.014), M["blush"], "head", seg=8, rings=4)


def wand(Q, M, side="R"):
    s = 1 if side == "L" else -1
    Q.cyl("wand", (0.31 * s, -0.17, 0.93), 0.009, 0.006, 0.3, M["wand"], f"lowerarm.{side}", rot=(math.pi / 2, 0, 0), verts=8)
    Q.sphere("wandtip", (0.31 * s, -0.325, 0.93), (0.016, 0.016, 0.016), M["tip"], f"lowerarm.{side}", seg=8, rings=6)


def extras(Q, M, who):
    hair = M["hair"]
    if who == "dumbledore":
        Q.sphere("hairback", (0, 0.03, 1.73), (0.135, 0.12, 0.14), hair, "head", seg=16, rings=10)
        Q.box("hairfall", (0, 0.1, 1.5), (0.24, 0.05, 0.38), hair, "chest")
        Q.cyl("beard", (0, -0.17, 1.25), 0.02, 0.11, 0.75, hair, "chest", rot=(-0.06, 0, 0), verts=12)
        Q.sphere("beardtop", (0, -0.12, 1.6), (0.105, 0.06, 0.07), hair, "head", seg=12, rings=8)
        Q.box("mustache", head_pt(0, 1.663, 0.01), (0.11, 0.02, 0.022), hair, "head")
        gl = Q.torus("glassesL", head_pt(0.046, 1.716, 0.022), 0.025, 0.004, M["gold"], "head", rot=(math.pi / 2, 0, 0), seg=16, minor=4)
        cut_half(gl, Q.T((0, 0, 1.716))[2] + 0.002)
        gr = Q.torus("glassesR", head_pt(-0.046, 1.716, 0.022), 0.025, 0.004, M["gold"], "head", rot=(math.pi / 2, 0, 0), seg=16, minor=4)
        cut_half(gr, Q.T((0, 0, 1.716))[2] + 0.002)
        Q.box("bridge", head_pt(0, 1.716, 0.028), (0.03, 0.004, 0.004), M["gold"], "head")
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
        Q.sphere("hair", (0, 0.02, 1.75), (0.13, 0.12, 0.12), hair, "head", seg=16, rings=10)
        Q.sphere("bun", (0, 0.12, 1.72), (0.055, 0.05, 0.05), hair, "head", seg=10, rings=8)
        for s in (1, -1):
            Q.torus(f"glass{s}", head_pt(0.046 * s, 1.722, 0.022), 0.026, 0.004, M["dark"], "head", rot=(math.pi / 2, math.pi / 4, 0), seg=4, minor=4)
        Q.box("bridge", head_pt(0, 1.722, 0.028), (0.03, 0.004, 0.004), M["dark"], "head")
        hat = lib.mat("Hat", lib.hexrgb("#0a2219"), 0.85)
        Q.cyl("hatbrim", (0, 0, 1.82), 0.3, 0.3, 0.015, hat, "head", verts=24)
        Q.cyl("hat", (0, 0.01, 2.07), 0.14, 0.0, 0.5, hat, "head", verts=16, rot=(-0.1, 0, 0))
        Q.torus("hatband", (0, 0, 1.84), 0.135, 0.012, M["trim"], "head", seg=16, minor=4)
        Q.cyl("brooch", (0, -0.21, 1.47), 0.035, 0.035, 0.012, M["gold"], "chest", rot=(math.pi / 2, 0, 0), verts=10)
        wand(Q, M)
    elif who == "trelawney":
        for i in range(14):
            a = i / 14 * math.tau
            Q.sphere(f"frizz{i}", (math.cos(a) * 0.14, math.sin(a) * 0.09 + 0.03, 1.74 + math.sin(a * 2) * 0.05), (0.07, 0.07, 0.08), hair, "head", seg=8, rings=6)
        Q.sphere("hairtop", (0, 0.02, 1.83), (0.15, 0.12, 0.08), hair, "head", seg=12, rings=8)
        for s in (1, -1):
            Q.torus(f"glass{s}", head_pt(0.05 * s, 1.722, 0.024), 0.04, 0.006, M["gold"], "head", rot=(math.pi / 2, 0, 0), seg=16, minor=4)
        shawl = lib.mat("Shawl", lib.hexrgb("#b5643c"), 0.9)
        Q.cyl("shawl", (0, 0, 1.43), 0.255, 0.225, 0.18, shawl, "chest", verts=20, cap=False)
        Q.cyl("shawlfringe", (0, 0, 1.31), 0.275, 0.255, 0.06, lib.mat("Fringe", lib.hexrgb("#3f7a5a"), 0.9), "chest", verts=20, cap=False)
        for i in range(3):
            Q.torus(f"beads{i}", (0, -0.03, 1.42 - i * 0.05), 0.13 - i * 0.008, 0.01, M["gold"], "chest", rot=(1.25, 0, 0), seg=16, minor=4)
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
        Q.sphere("hair", (0, 0.015, 1.755), (0.138, 0.13, 0.12), hair, "head", seg=16, rings=10)
        for s in (1, -1):
            Q.box(f"curtain{s}", (0.118 * s, -0.01, 1.62), (0.035, 0.2, 0.26), hair, "head")
        Q.box("hairback", (0, 0.09, 1.6), (0.24, 0.06, 0.28), hair, "head")
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
        Q.sphere("knob", (0.31, -0.06, 1.92), (0.04, 0.04, 0.04), lib.mat("Staff", lib.hexrgb("#4a3524"), 0.8), "lowerarm.L", seg=8, rings=6)
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
        Q.sphere("hair", (0, 0.06, 1.78), (0.17, 0.15, 0.13), hair, "head", seg=16, rings=10)
        Q.sphere("beard", (0, -0.07, 1.55), (0.16, 0.12, 0.11), hair, "head", seg=16, rings=10)
        for i in range(12):
            a = i / 12 * math.tau
            Q.sphere(f"bush{i}", (math.cos(a) * 0.15, 0.03 + abs(math.sin(a)) * 0.02, 1.66 + math.sin(a) * 0.14), (0.06, 0.06, 0.06), hair, "head", seg=8, rings=6)
        # keep the eyes and nose clear of the beard: the beard sits below z=1.68
        Q.box("belt", (0, -0.03, 1.12), (0.44, 0.44, 0.06), M["dark"], "spine")
        Q.box("buckle", (0, -0.25, 1.12), (0.07, 0.02, 0.07), M["gold"], "spine")
        pink = lib.mat("Umbrella", lib.hexrgb("#f4a6c8"), 0.7)
        Q.cyl("ushaft", (-0.31, -0.08, 0.75), 0.008, 0.008, 0.75, M["wand"], "lowerarm.R", rot=(-0.12, 0, 0), verts=8)
        Q.cyl("ucanopy", (-0.31, -0.05, 0.62), 0.045, 0.012, 0.45, pink, "lowerarm.R", rot=(-0.12, 0, 0), verts=10)
        Q.torus("uhandle", (-0.31, -0.12, 1.0), 0.03, 0.008, M["wand"], "lowerarm.R", rot=(0, math.pi / 2, 0), seg=10, minor=4)
        Q.sphere("wandtip", (-0.31, -0.02, 0.38), (0.012, 0.012, 0.012), M["tip"], "lowerarm.R", seg=6, rings=4)


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
