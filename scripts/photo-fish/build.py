"""照片皮鱼生成（第 1 步，系统 Python：Pillow + numpy）

从一张侧面照片做出与 aquarium-editor 照片皮鱼同格式的网格数据：
  1. 按颜色抠出鱼形（闭运算连上描边、只留种子点所在的连通域、填洞，再外扩把鳍缘黑边带进来）
  2. 主轴摆正（身体掩码的 PCA），裁出贴图（RGBA，透明处颜色外扩，避免 mip 后鳍缘发黑）
  3. 身体 = 鱼形做大半径开运算去掉薄鳍，再在尾柄最细处截断（尾鳍归鳍）
  4. 网格：贴图上的规则格；身体顶点按每列的体高做椭圆截面鼓起（z = w·√(1−u²)），鳍是 z=0 的单层薄片；
     身体两面各一层，与鳍在 z=0 处无缝相接。部位 _FIN：身体 0、鳍 1（游动着色器按它给鳍透光）
输出 out/<id>/mesh.json + tex.png，交给 blender_export.py 在无头 Blender 里写 glb。

用法：python -I scripts/photo-fish/build.py scripts/photo-fish/clown.json
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

cfg_path = sys.argv[1]
cfg = json.load(open(cfg_path, encoding='utf8'))
root = os.path.abspath(os.path.join(os.path.dirname(cfg_path), '..', '..'))
out_dir = os.path.join(root, cfg['outDir'])
os.makedirs(out_dir, exist_ok=True)

photo = Image.open(os.path.join(root, cfg['photo'])).convert('RGB')
W, H = photo.size
S = 0.5                                          # 抠图在半分辨率上做


def as_img(b):
    return Image.fromarray((np.asarray(b) * 255).astype(np.uint8))


def disc_morph(b, r, op):
    """圆盘结构元的腐蚀 / 膨胀（逐偏移 OR / AND，r 较小时够快）"""
    b = np.asarray(b, bool)
    out = np.ones_like(b) if op == 'erode' else np.zeros_like(b)
    pad = np.pad(b, r, constant_values=(op == 'erode') and False)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r:
                continue
            sh = pad[r + dy:r + dy + b.shape[0], r + dx:r + dx + b.shape[1]]
            out = (out & sh) if op == 'erode' else (out | sh)
    return out


def flood(mask, seed, val):
    im = as_img(mask).copy()                     # fromarray 的图与数组共享只读内存：不 copy 漫水会静默无效
    ImageDraw.floodfill(im, seed, val)
    return np.asarray(im) == val


# ---------- 1. 抠图 ----------
sm = photo.resize((int(W * S), int(H * S)), Image.LANCZOS)
a = np.asarray(sm).astype(np.float32)
R, G, B = a[..., 0], a[..., 1], a[..., 2]
mx, mn = a.max(-1), a.min(-1)
keep = np.zeros(R.shape, bool)
rules = cfg['colors']
if 'warm' in rules:
    t = rules['warm']
    keep |= (R > t['minR']) & (R - B > t['minRB']) & (R > G)
if 'white' in rules:
    t = rules['white']
    keep |= (mn > t['minV']) & (mx - mn < t['maxSpread'])
roi = Image.new('L', sm.size, 0)
ImageDraw.Draw(roi).polygon([(x * S, y * S) for x, y in cfg['roi']], fill=255)
keep &= np.asarray(roi) > 0
k = cfg.get('closePx', 9)
keep = np.asarray(as_img(keep).filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))) > 127
fish = flood(keep, (int(cfg['seed'][0] * S), int(cfg['seed'][1] * S)), 128)
fish = ~flood(fish, (0, 0), 64)                                   # 填洞
fish = np.asarray(as_img(fish).filter(ImageFilter.MaxFilter(cfg.get('edgePx', 7)))) > 127   # 带上鳍缘黑边
alpha_full = as_img(fish).resize((W, H), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.2))

# ---------- 2. 摆正 + 裁切 ----------
q = 0.25                                                          # 身体形态学在 1/4 分辨率上做
fq = np.asarray(as_img(fish).resize((int(W * q), int(H * q)), Image.BILINEAR)) > 127
hq = fq.any(1).sum()
r_open = max(2, int(round(cfg['bodyOpen'] * hq)))
body_q = disc_morph(disc_morph(fq, r_open, 'erode'), r_open, 'dilate') & fq
ys, xs = np.nonzero(body_q)
c = np.cov(np.stack([xs, ys]))
ev, evec = np.linalg.eigh(c)
ax = evec[:, np.argmax(ev)]
ang = math.degrees(math.atan2(ax[1], ax[0]))
if ang > 90: ang -= 180
if ang < -90: ang += 180
ang += cfg.get('rotateExtra', 0.0)
print(f'主轴倾角 {ang:.1f}°，开运算半径 {r_open}px@1/4')

rgba = photo.copy(); rgba.putalpha(alpha_full)
rgba = rgba.rotate(ang, resample=Image.BICUBIC, expand=True)
body_full = as_img(body_q).resize((W, H), Image.BILINEAR).rotate(ang, resample=Image.BILINEAR, expand=True)
al = np.asarray(rgba)[..., 3]
yy, xx = np.nonzero(al > 127)
m = cfg.get('marginPx', 24)
box = (max(0, xx.min() - m), max(0, yy.min() - m), min(rgba.width, xx.max() + m), min(rgba.height, yy.max() + m))
rgba = rgba.crop(box); body_full = body_full.crop(box)
if cfg.get('headRight'):
    rgba = rgba.transpose(Image.FLIP_LEFT_RIGHT); body_full = body_full.transpose(Image.FLIP_LEFT_RIGHT)

# 贴图：长边 1024，透明处颜色外扩（预乘模糊再除回）
sc = cfg.get('texSize', 1024) / max(rgba.size)
TW, TH = int(round(rgba.width * sc)), int(round(rgba.height * sc))
tex = rgba.resize((TW, TH), Image.LANCZOS)
body = np.asarray(body_full.resize((TW, TH), Image.BILINEAR)) > 127
t = np.asarray(tex).astype(np.float32) / 255
A = t[..., 3:4]
rgb = t[..., :3].copy()
filled = A[..., 0] > 0.5
acc_c = rgb * filled[..., None]; acc_w = filled.astype(np.float32)
for rad in (2, 4, 8, 16, 32):
    bc = np.asarray(Image.fromarray((acc_c * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(rad))).astype(np.float32) / 255
    bw = np.asarray(Image.fromarray((acc_w * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(rad))).astype(np.float32) / 255
    take = (~filled) & (bw > 0.02)
    rgb[take] = bc[take] / bw[take][..., None]
    acc_c = np.where(take[..., None], rgb, acc_c); acc_w = np.where(take, 1.0, acc_w); filled |= take
alpha = (A[..., 0] > 0.5).astype(np.float32)                       # 照片鱼是 alphaTest 镂空：0/1
out = np.concatenate([rgb, alpha[..., None]], -1)
Image.fromarray((out * 255).round().astype(np.uint8), 'RGBA').save(os.path.join(out_dir, 'tex.png'))

# ---------- 3. 身体：尾柄截断 ----------
# 鳍宽而圆的鱼（小丑鱼的软背鳍、臀鳍）开运算分不开，配置里可直接给贴图坐标下的身体轮廓（对着 debug.png 描）
if cfg.get('bodyPolyTex'):
    bp = Image.new('L', (TW, TH), 0)
    ImageDraw.Draw(bp).polygon([tuple(p) for p in cfg['bodyPolyTex']], fill=255)
    body = (np.asarray(bp) > 127) & (alpha > 0)
# 鳍缘描边（小丑鱼鳍的黑边）：抠图按颜色会把它切掉；只沿鳍（非身体）往外长 finRimPx，且只收暗像素，头和身体不会多一圈黑晕
rim = cfg.get('finRimPx', 0)
if rim > 0:
    finm = (alpha > 0) & ~body
    grow = np.asarray(as_img(finm).filter(ImageFilter.MaxFilter(2 * rim + 1))) > 127
    orig = rgba.resize((TW, TH), Image.LANCZOS).convert('RGB')
    dark = np.asarray(orig.convert('L')) < cfg.get('finRimLum', 70)
    near_body = np.asarray(as_img(body).filter(ImageFilter.MaxFilter(2 * rim + 1))) > 127
    add = grow & dark & ~(alpha > 0) & ~near_body
    alpha = np.where(add, 1.0, alpha)
    out[..., 3] = alpha
    out[add, :3] = np.asarray(orig).astype(np.float32)[add] / 255   # 这些像素取照片原色（黑边），不是外扩出来的橙色
    Image.fromarray((out * 255).round().astype(np.uint8), 'RGBA').save(os.path.join(out_dir, 'tex.png'))
    print(f'鳍缘描边 +{int(add.sum())} px')
cols = body.any(0)
bx0, bx1 = np.nonzero(cols)[0][[0, -1]]
hcol = body.sum(0).astype(np.float32)
rear0 = int(bx0 + 0.6 * (bx1 - bx0))
ped = rear0 + int(np.argmin(hcol[rear0:bx1 + 1] + 1e-3 * np.arange(bx1 + 1 - rear0)))
body[:, ped + 1:] = False
print(f'身体 x {bx0}..{ped}（尾柄 {ped}），贴图 {TW}x{TH}')

# 每列身体上下沿（取最长的一段），平滑
top = np.full(TW, np.nan); bot = np.full(TW, np.nan)
for x in range(TW):
    idx = np.nonzero(body[:, x])[0]
    if len(idx) < 2:
        continue
    top[x], bot[x] = idx[0], idx[-1]
valid = ~np.isnan(top)


def smooth(v, r):
    out = v.copy()
    for x in np.nonzero(valid)[0]:
        lo, hi = max(0, x - r), min(TW, x + r + 1)
        w = v[lo:hi][valid[lo:hi]]
        out[x] = w.mean()
    return out


sr = max(2, TW // 120)
top, bot = smooth(top, sr), smooth(bot, sr)

# 调试图：身体着青、鳍着品红，画出上下沿与尾柄
dbg = (out[..., :3] * 255).astype(np.uint8).copy()
dbg[(alpha > 0) & body] = (dbg[(alpha > 0) & body] * 0.6 + np.array([0, 160, 160]) * 0.4).astype(np.uint8)
dbg[(alpha > 0) & ~body] = (dbg[(alpha > 0) & ~body] * 0.6 + np.array([200, 0, 200]) * 0.4).astype(np.uint8)
dimg = Image.fromarray(dbg); dd = ImageDraw.Draw(dimg)
for x in np.nonzero(valid)[0]:
    dd.point((int(x), int(top[x])), fill=(255, 255, 0)); dd.point((int(x), int(bot[x])), fill=(255, 255, 0))
dd.line([(ped, 0), (ped, TH)], fill=(255, 0, 0))
dimg.save(os.path.join(out_dir, 'debug.png'))
thick = cfg['thickness']                     # 半厚 / 半高


def zval(x, y):
    xi = int(min(TW - 1, max(0, round(x))))
    if not valid[xi]:
        return 0.0
    t0, t1 = top[xi], bot[xi]
    hh = (t1 - t0) / 2
    if hh <= 0:
        return 0.0
    u = (y - (t0 + t1) / 2) / hh
    if abs(u) >= 1:
        return 0.0
    # 尾柄附近收薄，头部前缘略圆
    fx = (x - bx0) / max(1, ped - bx0)
    taper = 1.0 - 0.55 * max(0.0, (fx - 0.7) / 0.3) ** 1.5
    return thick * hh * taper * math.sqrt(1 - u * u)


# ---------- 4. 网格 ----------
NC = cfg.get('cols', 110)
cell = TW / NC
NR = int(math.ceil(TH / cell))
gx = np.arange(NC + 1) * cell
gy = np.arange(NR + 1) * cell
cover = np.zeros((NR, NC), bool)
for j in range(NR):
    for i in range(NC):
        y0, y1 = int(gy[j]), min(TH, int(math.ceil(gy[j + 1])) + 1)
        x0, x1 = int(gx[i]), min(TW, int(math.ceil(gx[i + 1])) + 1)
        cover[j, i] = alpha[y0:y1, x0:x1].any()

ext = np.nonzero(alpha.any(0))[0]
x_min, x_max = ext[0], ext[-1]
eyy = np.nonzero(alpha.any(1))[0]
xc, yc = (x_min + x_max) / 2, (eyy[0] + eyy[-1]) / 2
L = cfg['lengthM']
kpx = L / (x_max - x_min)

verts, uvs, fins, faces = [], [], [], []
vid = {}


def vert(i, j, side):
    x, y = gx[i], min(gy[j], TH)
    z = zval(x, y)
    s = 0 if z <= 1e-6 else side
    key = (i, j, s)
    if key in vid:
        return vid[key]
    vid[key] = len(verts)
    verts.append([(xc - x) * kpx, (yc - y) * kpx, s * z * kpx])   # 头朝 +X（贴图里头在左）、上为 +Y、侧向 Z
    uvs.append([x / TW, y / TH])
    is_body = s != 0 or body[int(min(TH - 1, y)), int(min(TW - 1, x))]
    fins.append([0.0, 0.0, 0.0] if is_body else [1.0, 1.0, 0.0])
    return vid[key]


seen = set()


def tri(a, b, c, side):
    k3 = tuple(sorted((a, b, c)))
    if k3 in seen or len(set(k3)) < 3:            # 身体边缘格里全落在 z=0 的三角形两面会各出一次：只留一份
        return
    seen.add(k3)
    pa, pb, pc = (np.array(verts[v]) for v in (a, b, c))
    n = np.cross(pb - pa, pc - pa)
    want = side if side != 0 else 1
    faces.append([a, b, c] if n[2] * want >= 0 else [a, c, b])


for j in range(NR):
    for i in range(NC):
        if not cover[j, i]:
            continue
        corners = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
        is_b = any(zval(gx[ci], min(gy[cj], TH)) > 1e-6 for ci, cj in corners)
        for side in ((1, -1) if is_b else (0,)):
            vs = [vert(ci, cj, side if side else 1) for ci, cj in corners]
            tri(vs[0], vs[1], vs[2], side)
            tri(vs[0], vs[2], vs[3], side)

swim = dict(cfg['swim'])
swim.update(snout=round(L / 2, 5), length=L)
json.dump({'name': cfg['id'], 'positions': verts, 'uvs': uvs, 'fin': fins, 'faces': faces, 'swim': swim,
           'tex': os.path.join(out_dir, 'tex.png')}, open(os.path.join(out_dir, 'mesh.json'), 'w', encoding='utf8'))
nb = sum(1 for f in fins if f[0] == 0)
print(f'顶点 {len(verts)}（身体 {nb} / 鳍 {len(verts) - nb}），三角形 {len(faces)}，体长 {L} m')
