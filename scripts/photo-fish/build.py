"""照片皮鱼生成（第 1 步，系统 Python：Pillow + numpy）

从一张侧面照片做出与 aquarium-editor 照片皮鱼同格式的网格数据：
  1. 按颜色抠出鱼形（闭运算连上描边、只留种子点所在的连通域、填洞，再外扩把鳍缘黑边带进来）
  2. 主轴摆正（身体掩码的 PCA），裁出贴图（RGBA，透明处颜色外扩，避免 mip 后鳍缘发黑）
  3. 身体 = 鱼形做大半径开运算去掉薄鳍，再在尾柄最细处截断（尾鳍归鳍）
  4. 网格：贴图上的规则格；身体顶点按每列的体高做椭圆截面鼓起（z = w·√(1−u²)），鳍是 z=0 的单层薄片；
     身体两面各一层，与鳍在 z=0 处无缝相接。部位 _FIN：身体 0、鳍 1（游动着色器按它给鳍透光）
  5. 胸鳍 / 腹鳍（配置 flaps，贴图坐标下手描轮廓 + 鳍基线）：从照片剪下放进贴图下方的图集条，
     伸出体外的部分从原位挖掉（身体上画着的保留，或 inpaint 补平）；左右各做一片绕鳍基离开体侧张开的活动鳍
     （_FIN 部位 4/5，鳍基 0 → 鳍梢 1，_PIV = 鳍基中点，游动着色器让它划水 / 开合）
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


def boxf(a, r):
    """浮点数组的可分离盒式模糊（边缘复制填充）"""
    for ax in (0, 1):
        pad = [(r + 1, r) if i == ax else (0, 0) for i in range(a.ndim)]
        c = np.cumsum(np.pad(a, pad, mode='edge'), axis=ax)
        n = c.shape[ax]
        a = (np.take(c, range(2 * r + 1, n), axis=ax) - np.take(c, range(0, n - 2 * r - 1), axis=ax)) / (2 * r + 1)
    return a


def bleed(rgb, known, todo=None, radii=(1, 2, 4, 8, 16, 32, 64)):
    """已知像素的颜色由近及远外扩到 todo（默认 = 全部未知像素）：贴图透明处防 mip 黑边，也用来补平剪走胸鳍的体侧"""
    rgb = rgb.copy(); filled = known.copy()
    todo = ~known if todo is None else todo
    acc_c = rgb * filled[..., None]; acc_w = filled.astype(np.float32)
    for rad in radii:
        bc = boxf(acc_c, rad); bw = boxf(acc_w, rad)
        take = todo & ~filled & (bw > 0.02)
        rgb[take] = bc[take] / bw[take][..., None]
        acc_c[take] = rgb[take]; acc_w[take] = 1.0; filled |= take
    return rgb


# ---------- 1. 抠图 ----------
sm = photo.resize((int(W * S), int(H * S)), Image.LANCZOS)
a = np.asarray(sm).astype(np.float32)
R, G, B = a[..., 0], a[..., 1], a[..., 2]
mx, mn = a.max(-1), a.min(-1)
keep = np.zeros(R.shape, bool)
rules = cfg['colors']
if isinstance(rules, dict):                      # 旧格式 { warm:{…}, white:{…} }
    rules = [dict(t, type=k) for k, t in rules.items()]
lum = 0.299 * R + 0.587 * G + 0.114 * B
# 抠图规则（并集）：按背景挑——蓝水用 notBlue、黑底用 bright、白底用 notWhite，再按鱼身颜色补 warm / white / blue
for t in rules:
    k = t['type']
    if k == 'warm':      keep |= (R > t['minR']) & (R - B > t['minRB']) & (R > G)
    elif k == 'white':   keep |= (mn > t['minV']) & (mx - mn < t['maxSpread'])
    elif k == 'notBlue': keep |= ~((B - R > t['minBR']) & (B > G - t.get('slackG', 0)))
    elif k == 'bright':                          # 黑底：亮度阈值；blur>0 先模糊，暗鳍膜（只比背景亮一点）连成片、背景噪点被平均掉
        l2 = lum if not t.get('blur') else np.asarray(Image.fromarray(lum.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(t['blur']))).astype(np.float32)
        keep |= (l2 > t['minLum']) & (lum > t.get('minRaw', -1))   # minRaw：原图也要略亮于背景，避免模糊把一圈背景带进来
    elif k == 'notWhite': keep |= (mn < t['maxV']) | (mx - mn > t['minSpread'])
    elif k == 'blue':    keep |= (B - R > t['minBR']) & (B > t['minB'])
    elif k == 'sat':     keep |= mx - mn > t['minSpread']           # 杂乱底（碎石）：轮廓靠手描 roi，里面按饱和 / 暗收
    elif k == 'dark':    keep |= lum < t['maxLum']
    elif k == 'red':     keep |= R > t['minR']                     # 纯蓝水（红通道近 0）：鱼身哪怕是蓝色也带一点红
    else: raise ValueError(f'未知抠图规则 {k}')
# 减去的规则：碎石底的浅色石子（亮而不饱和）——在取连通域之前减掉，鱼身上的高光小洞后面填洞会补回
for t in cfg.get('drop', []):
    if t['type'] == 'pale': keep &= ~((lum > t['minLum']) & (mx - mn < t['maxSpread']))
    else: raise ValueError(f'未知减去规则 {t["type"]}')
roi = Image.new('L', sm.size, 0)
ImageDraw.Draw(roi).polygon([(x * S, y * S) for x, y in cfg['roi']], fill=255)
keep &= np.asarray(roi) > 0
k = cfg.get('closePx', 9)
keep = np.asarray(as_img(keep).filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))) > 127
fish = flood(keep, (int(cfg['seed'][0] * S), int(cfg['seed'][1] * S)), 128)
fish = ~flood(fish, (0, 0), 64)                                   # 填洞
shrink = cfg.get('shrinkPx', 0)
if shrink > 1:                                   # 先开运算去掉轮廓上粘着的碎屑
    fish = np.asarray(as_img(fish).filter(ImageFilter.MinFilter(shrink)).filter(ImageFilter.MaxFilter(shrink))) > 127
    fish = flood(fish, (int(cfg['seed'][0] * S), int(cfg['seed'][1] * S)), 128)
edge = cfg.get('edgePx', 7)
if edge > 1:                                     # Pillow 的 MaxFilter(1) 会在 C 层整数除零直接崩进程（退出码 127）
    fish = np.asarray(as_img(fish).filter(ImageFilter.MaxFilter(edge))) > 127   # 带上鳍缘黑边
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
if 'rotate' in cfg:                              # 鳍面积大的鱼（狮子鱼）PCA 会被鳍带偏：直接给角度
    ang = cfg['rotate']
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
rgb = bleed(t[..., :3], A[..., 0] > 0.5)
alpha = (A[..., 0] > 0.5).astype(np.float32)                       # 照片鱼是 alphaTest 镂空：0/1
out = np.concatenate([rgb, alpha[..., None]], -1)
photo_rgb = np.asarray(rgba.resize((TW, TH), Image.LANCZOS).convert('RGB')).astype(np.float32) / 255   # 照片原色（不含外扩），剪鳍片用

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
for f in cfg.get('flaps', []):                   # 鳍片轮廓（绿）与鳍基线（橙）
    dd.line([tuple(p) for p in f['poly']] + [tuple(f['poly'][0])], fill=(0, 255, 0))
    dd.line([tuple(p) for p in f['base']], fill=(255, 128, 0), width=3)
for g in range(0, max(TW, TH), 50):              # 50 px 刻度，方便对着描轮廓
    dd.line([(g, 0), (g, 8)], fill=(255, 255, 255)); dd.line([(0, g), (8, g)], fill=(255, 255, 255))
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


ext = np.nonzero(alpha.any(0))[0]
x_min, x_max = ext[0], ext[-1]
eyy = np.nonzero(alpha.any(1))[0]
xc, yc = (x_min + x_max) / 2, (eyy[0] + eyy[-1]) / 2
L = cfg['lengthM']
kpx = L / (x_max - x_min)

# ---------- 3b. 胸鳍 / 腹鳍：剪下来放进图集条 ----------
# 原位置：伸出体外的部分挖掉（活动鳍片替它）；身体上画着的那片默认保留——aquarium-editor 的照片皮鱼也这样，
# 鳍片张开后底下是"贴着身体的鳍影"，比糊一块补色自然。inpaint:true 才按周围体色补平（体色均匀的鱼可用）
flaps = []
PAD = 6
shelf_x = shelf_y = shelf_h = 0
for f in cfg.get('flaps', []):
    pm = Image.new('L', (TW, TH), 0)
    ImageDraw.Draw(pm).polygon([tuple(p) for p in f['poly']], fill=255)
    pmk = np.asarray(pm) > 127
    grow = f.get('growPx', 4)                    # 手描轮廓往外长几像素：把鳍缘的深色描边一起带走
    if grow > 0:
        pmk = np.asarray(as_img(pmk).filter(ImageFilter.MaxFilter(2 * grow + 1))) > 127
    ys_, xs_ = np.nonzero(pmk)
    cx0, cy0 = max(0, xs_.min() - PAD), max(0, ys_.min() - PAD)
    cx1, cy1 = min(TW, xs_.max() + PAD + 1), min(TH, ys_.max() + PAD + 1)
    cw, ch = cx1 - cx0, cy1 - cy0
    if shelf_x + cw > TW:                        # 一行放不下就换行（简单货架排布）
        shelf_x, shelf_y, shelf_h = 0, shelf_y + shelf_h, 0
    flaps.append(dict(f, mask=pmk, crop=(cx0, cy0, cx1, cy1), at=(shelf_x, shelf_y),
                      rgb=photo_rgb[cy0:cy1, cx0:cx1].copy(), a=pmk[cy0:cy1, cx0:cx1].astype(np.float32)))
    shelf_x += cw; shelf_h = max(shelf_h, ch)
    hole = np.asarray(as_img(pmk).filter(ImageFilter.MaxFilter(5))) > 127
    if f.get('inpaint', False):
        solid = (out[..., 3] > 0) & body
        out[..., :3] = bleed(out[..., :3], solid & ~hole, todo=hole & solid)
    out[hole & ~body, 3] = 0.0
alpha = out[..., 3]
TH2 = TH + shelf_y + shelf_h
atlas = np.zeros((TH2, TW, 4), np.float32)
atlas[:TH] = out
for f in flaps:
    ax_, ay_ = f['at']; h_, w_ = f['a'].shape
    atlas[TH + ay_:TH + ay_ + h_, ax_:ax_ + w_, :3] = f['rgb']
    atlas[TH + ay_:TH + ay_ + h_, ax_:ax_ + w_, 3] = f['a']
if TH2 > TH:                                     # 图集条的透明处同样颜色外扩
    atlas[TH:, :, :3] = bleed(atlas[TH:, :, :3], atlas[TH:, :, 3] > 0.5)
Image.fromarray((atlas * 255).round().clip(0, 255).astype(np.uint8), 'RGBA').save(os.path.join(out_dir, 'tex.png'))

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

verts, uvs, fins, faces, pivs = [], [], [], [], []
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
    uvs.append([x / TW, y / TH2])
    is_body = s != 0 or body[int(min(TH - 1, y)), int(min(TW - 1, x))]
    fins.append([0.0, 0.0, 0.0] if is_body else [1.0, 1.0, 0.0])
    pivs.append([0.0, 0.0, 0.0])
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



def flap_mesh(f, side):
    """贴图点 p 绕鳍基线转出 splay 角：沿鳍基的分量不变，垂直分量一部分留在侧面（cos）、一部分离开体侧（sin）；
    鳍基略嵌进体表（张开 / 划水时根部不露缝）。side = ±1 左右镜像"""
    b0, b1 = np.array(f['base'][0], float), np.array(f['base'][1], float)
    av = (b1 - b0) / np.linalg.norm(b1 - b0)
    nv = np.array([-av[1], av[0]])
    th = math.radians(f.get('splay', 40))
    cx0, cy0, cx1, cy1 = f['crop']; ax_, ay_ = f['at']
    pmk = f['mask']
    ys_, xs_ = np.nonzero(pmk)
    dmax = max(float(np.abs((np.stack([xs_, ys_], 1) - b0) @ nv).max()), 1.0)
    fc = cell * f.get('cellK', 0.5)
    nx, ny = int(math.ceil((cx1 - cx0) / fc)), int(math.ceil((cy1 - cy0) / fc))
    bm = (b0 + b1) / 2
    piv = [(xc - bm[0]) * kpx, (yc - bm[1]) * kpx, side * max(zval(bm[0], bm[1]) * 0.9, 1.0) * kpx]   # 腹鳍基在腹缘 z≈0：至少偏出 1px，着色器靠 sign(piv.z) 分左右
    fid = {}

    def fv(i, j):
        if (i, j) not in fid:
            p = np.array([min(cx0 + i * fc, cx1), min(cy0 + j * fc, cy1)])
            d = p - b0; al = float(d @ av); q = b0 + al * av; dp = d - al * av; dist = float(np.linalg.norm(dp))
            X = q + dp * math.cos(th)
            fid[(i, j)] = len(verts)
            verts.append([(xc - X[0]) * kpx, (yc - X[1]) * kpx, side * (zval(q[0], q[1]) * 0.9 + dist * math.sin(th)) * kpx])
            uvs.append([(ax_ + p[0] - cx0) / TW, (TH + ay_ + p[1] - cy0) / TH2])
            fins.append([float(f.get('part', 4)), min(1.0, dist / dmax), 0.0])
            pivs.append(piv)
        return fid[(i, j)]

    for j in range(ny):
        for i in range(nx):
            y0, y1 = int(cy0 + j * fc), min(cy1, int(math.ceil(cy0 + (j + 1) * fc)) + 1)
            x0, x1 = int(cx0 + i * fc), min(cx1, int(math.ceil(cx0 + (i + 1) * fc)) + 1)
            if not pmk[y0:y1, x0:x1].any():
                continue
            vs = [fv(i, j), fv(i + 1, j), fv(i + 1, j + 1), fv(i, j + 1)]
            tri(vs[0], vs[1], vs[2], side)
            tri(vs[0], vs[2], vs[3], side)
    return nx, ny


for fi, f in enumerate(flaps):
    for side in (1, -1):
        nx, ny = flap_mesh(f, side)
    print(f'鳍片 {fi}：部位 {f.get("part", 4)}，张开 {f.get("splay", 40)}°，网格 {nx}x{ny}')

swim = dict(cfg['swim'])
swim.update(snout=round(L / 2, 5), length=L)
json.dump({'name': cfg['id'], 'positions': verts, 'uvs': uvs, 'fin': fins, 'piv': pivs, 'faces': faces, 'swim': swim,
           'tex': os.path.join(out_dir, 'tex.png')}, open(os.path.join(out_dir, 'mesh.json'), 'w', encoding='utf8'))
nb = sum(1 for f in fins if f[0] == 0)
print(f'顶点 {len(verts)}（身体 {nb} / 鳍 {len(verts) - nb}），三角形 {len(faces)}，体长 {L} m')
