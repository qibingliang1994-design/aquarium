// @ts-check

/** 蒙皮 GLSL：按实例相位取两帧骨骼矩阵插值，4 根骨加权。只依赖 uPose / uC0..2 / aSkI / aSkW / aAnimT / aAnimW */
export const VAT_VERT_HEAD = /* glsl */`
attribute vec4 aSkI; attribute vec4 aSkW; attribute vec4 aAnimT; attribute vec4 aAnimW;
uniform sampler2D uPose; uniform vec4 uC0; uniform vec4 uC1; uniform vec4 uC2;
mat4 vatBone(float bone, float row){
  int b = int(bone) * 4; int r = int(row);
  return mat4(texelFetch(uPose, ivec2(b, r), 0), texelFetch(uPose, ivec2(b+1, r), 0),
              texelFetch(uPose, ivec2(b+2, r), 0), texelFetch(uPose, ivec2(b+3, r), 0));
}
mat4 vatClip(vec4 c, float t, bool loopClip){      // c = (起始行, 帧数, 时长(未用), 0)
  float f = loopClip ? fract(t) * c.y : clamp(t, 0.0, 1.0) * c.y;
  float f0 = floor(f), fr = f - f0;
  float i1 = loopClip ? mod(f0 + 1.0, c.y) : min(f0 + 1.0, c.y);
  float r0 = c.x + f0, r1 = c.x + i1;
  mat4 a = mat4(0.0), b = mat4(0.0);
  for(int j=0;j<4;j++){
    float w = aSkW[j]; if(w <= 0.0) continue;
    float bi = aSkI[j];
    a += w * vatBone(bi, r0); b += w * vatBone(bi, r1);
  }
  return a + (b - a) * fr;
}
mat4 vatSkin(){
  mat4 s = mat4(0.0);
  if(aAnimW.x > 0.001) s += aAnimW.x * vatClip(uC0, aAnimT.x, true);
  if(aAnimW.y > 0.001) s += aAnimW.y * vatClip(uC1, aAnimT.y, true);
  if(aAnimW.z > 0.001) s += aAnimW.z * vatClip(uC2, aAnimT.z, false);
  return s;
}
`;
