# Shared helpers for the character build scripts (Blender 5.x, run headless).
# Convention: Z up, the character faces -Y (glTF export turns this into +Z forward, Y up in three.js).
# Every part is skinned rigidly to one bone through a vertex group named after that bone. We never use
# heat weighting: parts inside the head (eyes, teeth) then follow the head bone exactly.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
MODELS = os.path.join(REPO, "public", "models")
PREVIEWS = os.environ.get("CHAR_PREVIEWS", "")  # set to a folder to render EEVEE previews


def args():
    """Arguments after `--` on the Blender command line, as key=value pairs."""
    out = {}
    if "--" in sys.argv:
        for a in sys.argv[sys.argv.index("--") + 1:]:
            k, _, v = a.partition("=")
            out[k] = v
    return out


def reset(fps=30):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = fps
    MATS.clear()


# ---------- materials (cached by name; the name becomes the glTF material name the app looks up)
MATS = {}


def mat(name, rgb, rough=0.8, metal=0.0, emit=None, fur_bump=False):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = 3.0
    if fur_bump:  # preview-only fur: glTF drops procedural bumps, the app adds its own fur bump map
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 180.0
        noise.inputs["Detail"].default_value = 6.0
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.45
        nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    MATS[name] = m
    return m


def set_color(name, rgb):
    bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*rgb, 1)


def hexrgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


# ---------- parts
class Parts:
    """Collects part objects, each tagged with the bone it is rigidly bound to."""

    def __init__(self, lod=1.0):
        self.objs = []
        self.lod = lod  # multiplies segment counts (the seated crowd builds at a lower lod)

    def n(self, k, lo=4):
        return max(lo, int(round(k * self.lod)))

    def _finish(self, o, name, m, bone, smooth=True):
        o.name = name
        o.data.materials.append(m)
        vg = o.vertex_groups.new(name=bone)
        vg.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
        for p in o.data.polygons:
            p.use_smooth = smooth
        self.objs.append(o)
        return o

    def sphere(self, name, loc, radii, m, bone, rot=(0, 0, 0), seg=16, rings=10, taper=None, displace=0.0):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=self.n(seg, 6), ring_count=self.n(rings, 4), radius=1)
        o = bpy.context.active_object
        if taper:  # pull the top toward a point: taper=(start, amount); start in [-1,1] of local z
            s0, amt = taper
            for v in o.data.vertices:
                if v.co.z > s0:
                    k = (v.co.z - s0) / (1 - s0)
                    f = 1 - amt * k ** 1.3
                    v.co.x *= f
                    v.co.y *= f
        for v in o.data.vertices:
            v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        if displace:
            fuzz(o, displace)
        o.rotation_euler = rot
        o.location = loc
        apply_tf(o)
        return self._finish(o, name, m, bone)

    def cyl(self, name, loc, r1, r2, depth, m, bone, rot=(0, 0, 0), verts=12, scale=(1, 1, 1), cap=True):
        bpy.ops.mesh.primitive_cone_add(vertices=self.n(verts, 6), radius1=r1, radius2=r2, depth=depth,
                                        end_fill_type="NGON" if cap else "NOTHING")
        o = bpy.context.active_object
        for v in o.data.vertices:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
        o.rotation_euler = rot
        o.location = loc
        apply_tf(o)
        o = self._finish(o, name, m, bone)
        return o

    def box(self, name, loc, size, m, bone, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(size=1)
        o = bpy.context.active_object
        o.scale = size
        o.rotation_euler = rot
        o.location = loc
        apply_tf(o)
        return self._finish(o, name, m, bone, smooth=False)

    def torus(self, name, loc, R, r, m, bone, rot=(0, 0, 0), seg=20, minor=8, scale=(1, 1, 1)):
        bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=self.n(seg, 8), minor_segments=self.n(minor, 4))
        o = bpy.context.active_object
        for v in o.data.vertices:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
        o.rotation_euler = rot
        o.location = loc
        apply_tf(o)
        return self._finish(o, name, m, bone)

    def poly(self, name, verts, faces, m, bone, smooth=False):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in verts], [], faces)
        me.update()
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        return self._finish(o, name, m, bone, smooth=smooth)

    def text(self, name, body, m, bone, size, place):
        """Flat text mesh in the XZ plane (reads from -Y), then `place(v)` maps each vertex onto a surface."""
        bpy.ops.object.text_add()
        t = bpy.context.active_object
        t.data.body = body
        t.data.size = size
        t.data.align_x = "CENTER"
        t.data.align_y = "CENTER"
        t.data.resolution_u = 2
        t.data.fill_mode = "FRONT"
        t.rotation_euler = (math.pi / 2, 0, 0)
        bpy.ops.object.convert(target="MESH")
        o = bpy.context.active_object
        apply_tf(o)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.to_mesh(o.data)
        bm.free()
        for v in o.data.vertices:
            v.co = place(v.co)
        return self._finish(o, name, m, bone, smooth=False)

    def join(self, name, objs=None):
        objs = objs if objs is not None else self.objs
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        o = bpy.context.active_object
        o.name = name
        o.data.name = name
        if objs is self.objs:
            self.objs = []
        else:
            self.objs = [x for x in self.objs if x not in objs]
        return o


def apply_tf(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def fuzz(o, amount, size=0.035):
    """Lumpy fur silhouette: displace along normals with a fine cloud noise, applied to the mesh."""
    tex = bpy.data.textures.get("FurNoise") or bpy.data.textures.new("FurNoise", "CLOUDS")
    tex.noise_scale = size
    tex.noise_depth = 2
    d = o.modifiers.new("fuzz", "DISPLACE")
    d.texture = tex
    d.strength = amount
    d.mid_level = 0.5
    d.texture_coords = "GLOBAL"
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=d.name)


def ellipsoid_front(c, r, x, z, off=0.0):
    """Point on the front (-Y) surface of an ellipsoid at (x, z), pushed `off` outward along the normal."""
    u = 1 - ((x - c[0]) / r[0]) ** 2 - ((z - c[2]) / r[2]) ** 2
    y = c[1] - r[1] * math.sqrt(max(u, 0.0))
    p = Vector((x, y, z))
    n = Vector(((x - c[0]) / r[0] ** 2, (y - c[1]) / r[1] ** 2, (z - c[2]) / r[2] ** 2)).normalized()
    return p + n * off


# ---------- armature
def armature(name, bones):
    """bones: list of (name, head, tail, parent or None)."""
    data = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for bn, h, t, par in bones:
        b = data.edit_bones.new(bn)
        b.head, b.tail = Vector(h), Vector(t)
        # predictable axes: local Z points forward (-Y) where possible, so rotation about local Z is a
        # sideways swing in the XZ plane and rotation about local X is a forward/back swing
        d = (b.tail - b.head).normalized()
        fwd = Vector((0, -1, 0)) if abs(d.y) < 0.9 else Vector((0, 0, 1))
        b.align_roll(fwd)
        if par:
            b.parent = data.edit_bones[par]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    return rig


def bind(mesh, rig):
    """Parent with an armature modifier, keeping the explicit vertex groups."""
    mesh.parent = rig
    mod = mesh.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    missing = [g.name for g in mesh.vertex_groups if g.name not in rig.data.bones]
    assert not missing, f"vertex groups without bones: {missing}"
    for v in mesh.data.vertices:
        assert sum(g.weight for g in v.groups) > 0.99, f"unweighted vertex {v.index} in {mesh.name}"


# ---------- animation
class Anim:
    def __init__(self, rig):
        self.rig = rig
        self.pb = rig.pose.bones
        rig.animation_data_create()

    def reset(self):
        for pb in self.pb:
            pb.location = (0, 0, 0)
            pb.rotation_euler = (0, 0, 0)
            pb.scale = (1, 1, 1)

    def key(self, bone, prop, frame, value):
        pb = self.pb[bone]
        setattr(pb, prop, value)
        pb.keyframe_insert(prop, frame=frame)

    def keys(self, bone, prop, frames):
        for f, v in frames:
            self.key(bone, prop, f, v)

    def push(self, name, all_bones=True, end=None):
        """Key every bone at the clip's first frame (so clips fully override each other), then stash in NLA."""
        ad = self.rig.animation_data
        act = ad.action
        if all_bones:
            first = int(min(kp.co.x for fc in fcurves(act) for kp in fc.keyframe_points))
            last = int(max(kp.co.x for fc in fcurves(act) for kp in fc.keyframe_points))
            keyed = {fc.data_path for fc in fcurves(act)}
            for pb in self.pb:
                for prop, v in (("location", (0, 0, 0)), ("rotation_euler", (0, 0, 0)), ("scale", (1, 1, 1))):
                    if f'pose.bones["{pb.name}"].{prop}' not in keyed:  # per channel, so no channel leaks between clips
                        setattr(pb, prop, v)
                        pb.keyframe_insert(prop, frame=first)
                        pb.keyframe_insert(prop, frame=last)
        act.name = name
        act.use_fake_user = True
        tr = ad.nla_tracks.new()
        tr.name = name
        s = tr.strips.new(name, int(act.frame_range[0]), act)
        s.name = name
        ad.action = None
        self.reset()
        return act


def fcurves(act):
    """Blender 5 layered actions keep F-curves in channelbags; older ones on the action."""
    if hasattr(act, "fcurves") and len(getattr(act, "fcurves", [])):
        return list(act.fcurves)
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                out.extend(cb.fcurves)
    return out


def solo(rig, name):
    for t in rig.animation_data.nla_tracks:
        t.mute = t.name != name
        t.is_solo = False


def unmute_all(rig):
    for t in rig.animation_data.nla_tracks:
        t.mute = False


# ---------- stats + export
def tris(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in objs:
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
    return n


def export(path, objs, animations=True, skins=True):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    kw = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_skins=skins,
        export_animations=animations,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_yup=True,
    )
    if animations:
        kw.update(export_animation_mode="NLA_TRACKS", export_force_sampling=True)
    bpy.ops.export_scene.gltf(**kw)
    kb = os.path.getsize(path) / 1024
    print(f"[export] {os.path.basename(path)} {kb:.1f} KB")
    return kb


def bake_pose(mesh, rig, track, frame, name):
    """Copy of `mesh` frozen in the pose at `frame` of NLA track `track`, unparented, no skin."""
    solo(rig, track)
    bpy.context.scene.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(mesh.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
    o = bpy.data.objects.new(name, me)
    o.matrix_world = mesh.matrix_world.copy()
    bpy.context.scene.collection.objects.link(o)
    o.vertex_groups.clear()
    return o


# ---------- previews (EEVEE, headless)
def preview_setup(target_z, dist, height=None, lens=50, res=640):
    sc = bpy.context.scene
    names = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in names else "BLENDER_WORKBENCH"
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Standard"
    if not sc.world:
        w = bpy.data.worlds.new("Studio")
        sc.world = w
        w.use_nodes = True
        bg = w.node_tree.nodes["Background"]
        bg.inputs["Color"].default_value = (0.5, 0.52, 0.56, 1)
        bg.inputs["Strength"].default_value = 0.7
        cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
        sc.collection.objects.link(cam)
        sc.camera = cam
        for nm, loc, e, size in (("Key", (-2.5, -3.5, 4), 500, 3), ("Fill", (3.5, -2.5, 2), 220, 4), ("Rim", (0, 3.5, 3.5), 300, 2)):
            l = bpy.data.objects.new(nm, bpy.data.lights.new(nm, "AREA"))
            l.data.energy = e
            l.data.size = size
            l.location = loc
            sc.collection.objects.link(l)
            look(l, Vector((0, 0, 0.6)))
        bpy.ops.mesh.primitive_plane_add(size=30)
        fl = bpy.context.active_object
        fl.name = "PreviewFloor"
        fm = bpy.data.materials.new("PreviewFloor")
        fm.use_nodes = True
        fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.55, 0.57, 1)
        fl.data.materials.append(fm)
    cam = sc.camera
    cam.data.lens = lens
    return cam


def look(obj, at):
    obj.rotation_euler = (at - obj.location).to_track_quat("-Z", "Y").to_euler()


def shot(path, target, dist, yaw_deg=-30, elev=0.25, lens=50, res=640):
    """Camera `dist` from `target`, `yaw_deg` around Z from the front (-Y), raised by `elev` m."""
    cam = preview_setup(target[2], dist, lens=lens, res=res)
    a = math.radians(yaw_deg)
    t = Vector(target)
    cam.location = (t.x + dist * math.sin(a), t.y - dist * math.cos(a), t.z + elev)
    look(cam, t)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[preview] {path}")


def clips_preview(rig, name, shots):
    """shots: list of (clip, frame, target, dist, yaw, elev, suffix)."""
    if not PREVIEWS:
        return
    os.makedirs(PREVIEWS, exist_ok=True)
    for clip, frame, target, dist, yaw, elev, suffix in shots:
        solo(rig, clip)
        bpy.context.scene.frame_set(frame)
        fn = f"{name}_{clip}_f{frame}{suffix}.png"
        shot(os.path.join(PREVIEWS, fn), target, dist, yaw, elev)
    unmute_all(rig)
