"""照片皮鱼生成（第 2 步，无头 Blender）：mesh.json + tex.png → glb

与 aquarium-editor 的照片皮鱼同格式（同一个 Khronos glTF 导出器）：
  - 顶点属性 _FIN（部位, 权重, 收拢角）/ _PIV（转动中心，Blender Z 向上原样导出）
  - 节点 extras.swim（游动参数），贴图 WebP（EXT_texture_webp）
坐标：mesh.json 是 glTF 的 Y 向上（头 +X、侧向 Z）；Blender 里写成 (x, -z, y)，导出器换回 Y 向上。

用法（headless 优先，独立进程）：
  blender -b --factory-startup --python scripts/photo-fish/blender_export.py -- _fish_build/out/clown/mesh.json public/fish-models/species/species-clown-photo.glb
"""
import json
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst = argv[0], argv[1]
d = json.load(open(src, encoding='utf8'))

bpy.ops.wm.read_factory_settings(use_empty=True)
P = [(x, -z, y) for x, y, z in d['positions']]
me = bpy.data.meshes.new(d['name'])
me.from_pydata(P, [], [tuple(f) for f in d['faces']])
me.update()

uv = me.uv_layers.new(name='UVMap')
uvs = d['uvs']
for loop in me.loops:
    u, v = uvs[loop.vertex_index]
    uv.data[loop.index].uv = (u, 1.0 - v)

fin = me.attributes.new('_FIN', 'FLOAT_VECTOR', 'POINT')
piv = me.attributes.new('_PIV', 'FLOAT_VECTOR', 'POINT')
pv = d.get('piv') or [[0.0, 0.0, 0.0]] * len(d['fin'])
for i, f in enumerate(d['fin']):
    fin.data[i].vector = f
    x, y, z = pv[i]
    piv.data[i].vector = (x, -z, y)                # 与顶点同样换到 Blender 坐标：导出器不转换自定义属性，着色器按 (x, z, -y) 读回
for p in me.polygons:
    p.use_smooth = True

img = bpy.data.images.load(d['tex'])
img.alpha_mode = 'STRAIGHT'
mat = bpy.data.materials.new(d['name'])
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes['Principled BSDF']
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(tn.outputs['Alpha'], bsdf.inputs['Alpha'])
bsdf.inputs['Roughness'].default_value = 0.4
bsdf.inputs['Metallic'].default_value = 0.0
mat.blend_method = 'BLEND' if hasattr(mat, 'blend_method') else None
mat.use_backface_culling = False
me.materials.append(mat)

ob = bpy.data.objects.new(d['name'], me)
bpy.context.scene.collection.objects.link(ob)
ob['swim'] = d['swim']
bpy.context.view_layer.objects.active = ob
ob.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=dst, export_format='GLB', use_selection=True,
    export_attributes=True, export_extras=True, export_yup=True,
    export_image_format='WEBP', export_animations=False, export_skins=False, export_morph=False,
    export_tangents=False, export_normals=True, export_texcoords=True, export_materials='EXPORT')
print('EXPORTED', dst, len(P), 'verts', len(d['faces']), 'tris')
