import { mat2d, vec2 } from 'gl-matrix';
import { BBIN } from '../models/bbin';
import { ISA, ISAAnimation, ISAFrameKind, ISAInterpolationKind, ISAKeyFrame } from '../models/isa';
import { ISC, ISCBone } from '../models/isc';
import { Transform, Vec2 } from '../models/math';
import { TEX } from '../models/tex';
import { Renderer } from './renderer';

function findKeyFrames(animation: ISAAnimation, time: number, totalTime: number): InterpolationDef {
  let nextFrameIndex = animation.frames.findIndex((frame) => frame.time > time);
  if (nextFrameIndex < 0) nextFrameIndex = animation.frames.length;

  const thisFrame = animation.frames[(nextFrameIndex - 1 + animation.frames.length) % animation.frames.length];
  const nextFrame = animation.frames[nextFrameIndex] || animation.frames[0];
  return {
    time, totalTime,
    frameA: thisFrame,
    frameB: nextFrame,
  };
}

interface InterpolationDef {
  time: number;
  totalTime: number;
  frameA: ISAKeyFrame;
  frameB: ISAKeyFrame;
}

function interpolate(def: InterpolationDef, a: number, b: number) {
  let duration = def.frameB.time - def.frameA.time;
  if (duration < 0) duration += def.totalTime;
  if (duration === 0) return a;

  switch (def.frameA.interpolation.kind) {
    default:
    case ISAInterpolationKind.Constant:
      return a;
    case ISAInterpolationKind.Linear:
      return a + (b - a) * (def.time - def.frameA.time) / duration;
    case ISAInterpolationKind.B: {
      return a + (b - a) * (def.time - def.frameA.time) / duration;
    }
  }
}

export class AnimatedRenderer extends Renderer {
  private readonly textures: WebGLTexture[];
  private readonly isc: ISC;
  private readonly isa: ISA;

  private readonly animationLength: number;
  private readonly boneChildrens = new Map<number, ISCBone[]>();

  public get timeLength(): number {
    return this.animationLength;
  }

  constructor(gl: WebGLRenderingContext, buf: Buffer) {
    super(gl);

    const { files } = BBIN.load(buf);
    const texFile = files.find((file) => TEX.match(file));
    const iscFile = files.find((file) => ISC.match(file));
    const isaFile = files.find((file) => ISA.match(file));

    if (!texFile || !iscFile || !isaFile) {
      throw new Error('missing required data');
    }

    const textures = TEX.load(texFile);
    this.textures = textures.entries.map((tex) => {
      const pixels = TEX.decodeRaw(tex);
      return this.context.loadTex(tex.width, tex.height, pixels);
    });
    this.isc = ISC.load(iscFile);
    this.isa = ISA.load(isaFile);

    let animationLength = 0;

    for (const bone of this.isc.bones) {
      this.boneChildrens.set(bone.id, []);
    }
    for (const bone of this.isc.bones) {
      if (bone.parentId >= 0)
        this.boneChildrens.get(bone.parentId)!.push(bone);
    }
    for (const bone of this.isa.bones) {
      animationLength = Math.max(animationLength,
        bone.rotation ? bone.rotation.timeLength : 0,
        bone.scaling ? bone.scaling.timeLength : 0,
        bone.translation ? bone.translation.timeLength : 0,
      );
    }

    for (const slot of this.isc.slots) {
      const tint = ((slot.tint & 0xff) << 16) | (slot.tint & 0xff00) | ((slot.tint & 0xff0000) >> 16);
      slot.tint = tint;
    }
    for (const slot of this.isa.slots) {
      animationLength = Math.max(animationLength,
        slot.tint ? slot.tint.timeLength : 0,
        slot.visibility ? slot.visibility.timeLength : 0,
      );
    }

    for (const mesh of this.isc.meshs) {
      if (mesh.triangleList.length === 0)
        mesh.triangleList = [[0, 1, 2], [3, 4, 5]];
    }
    for (const mesh of this.isa.meshs) {
      animationLength = Math.max(animationLength,
        mesh.deformation ? mesh.deformation.timeLength : 0,
      );
    }

    this.animationLength = animationLength;
  }

  public async doDraw(time: number) {
    const animationTime = Math.floor((time % this.animationLength) * 30) / 30;

    const animatedTransforms = this.animateBoneTransforms(animationTime);
    const animatedTints = this.animateSlotTints(animationTime);
    const animatedDeformations = this.animateMeshDeformations(animationTime);

    const transforms = this.computeTransforms(animatedTransforms);
    const tints = this.computeTints(animatedTints);

    function applyTransform(boneId: number, meshId: number, i: number, v: Vec2) {
      const vec: vec2 = vec2.clone([v.x, v.y]);
      const animatedDeformation = animatedDeformations.get(meshId);
      if (animatedDeformation && animatedDeformation[i]) {
        vec[0] += animatedDeformation[i].x;
        vec[1] += animatedDeformation[i].y;
      }
      vec2.transformMat2d(vec, vec, transforms.get(boneId) || mat2d.identity(mat2d.create()));
      return vec;
    }

    for (const slot of this.isc.slots) {
      const skin = this.isc.skins[slot.skinId];
      if (!skin) continue;
      const mesh = this.isc.meshs[skin.meshId];

      let tint = tints.get(slot.id);
      if (tint === undefined) {
        tint = slot.tint;
      }

      const positions = mesh.vertices.map((v, i) => {
        if (Array.isArray(v.dst)) {
          const t = vec2.create();
          for (const { boneId, vertex, ratio } of v.dst) {
            vec2.scaleAndAdd(t, t, applyTransform(boneId, mesh.id, i, vertex), ratio);
          }
          return t;
        } else {
          return applyTransform(slot.boneId, mesh.id, i, v.dst);
        }
      });

      const positionBuf: number[] = [];
      const texCoordsBuf: number[] = [];
      for (const [a, b, c] of mesh.triangleList) {
        positionBuf.push(positions[a][0]);
        positionBuf.push(positions[a][1]);
        positionBuf.push(positions[b][0]);
        positionBuf.push(positions[b][1]);
        positionBuf.push(positions[c][0]);
        positionBuf.push(positions[c][1]);

        texCoordsBuf.push(mesh.vertices[a].src.x);
        texCoordsBuf.push(mesh.vertices[a].src.y);
        texCoordsBuf.push(mesh.vertices[b].src.x);
        texCoordsBuf.push(mesh.vertices[b].src.y);
        texCoordsBuf.push(mesh.vertices[c].src.x);
        texCoordsBuf.push(mesh.vertices[c].src.y);
      }

      const texture = this.directives.has(`highlight:${mesh.id}`) ?
        this.context.WHITE :
        this.textures[mesh.textureId];
      this.context.setBlendMode(slot.flags === 1 ? 'additive' : 'normal');
      this.context.drawTex(texture, new Float32Array(positionBuf), new Float32Array(texCoordsBuf), tint);
    }
  }

  private animateBoneTransforms(time: number) {
    const boneTransforms = new Map<number, Transform>();
    for (const bone of this.isa.bones) {
      const transform = Transform.identity();

      if (bone.rotation) {
        const def = findKeyFrames(bone.rotation, time, this.animationLength);
        if (def.frameA.frame.kind !== ISAFrameKind.Angle || def.frameB.frame.kind !== ISAFrameKind.Angle)
          throw new Error('unexpected frame kind');
        transform.angle += interpolate(def, def.frameA.frame.angle, def.frameB.frame.angle);
      }
      if (bone.translation) {
        const def = findKeyFrames(bone.translation, time, this.animationLength);
        if (def.frameA.frame.kind !== ISAFrameKind.Vertex || def.frameB.frame.kind !== ISAFrameKind.Vertex)
          throw new Error('unexpected frame kind');
        transform.tx += interpolate(def, def.frameA.frame.vertex.x, def.frameB.frame.vertex.x);
        transform.ty += interpolate(def, def.frameA.frame.vertex.y, def.frameB.frame.vertex.y);
      }
      if (bone.scaling) {
        const def = findKeyFrames(bone.scaling, time, this.animationLength);
        if (def.frameA.frame.kind !== ISAFrameKind.Vertex || def.frameB.frame.kind !== ISAFrameKind.Vertex)
          throw new Error('unexpected frame kind');
        transform.sx *= interpolate(def, def.frameA.frame.vertex.x, def.frameB.frame.vertex.x);
        transform.sy *= interpolate(def, def.frameA.frame.vertex.y, def.frameB.frame.vertex.y);
      }

      boneTransforms.set(bone.id, transform);
    }
    return boneTransforms;
  }

  private animateSlotTints(time: number) {
    const slotTints = new Map<number, number>();
    for (const slot of this.isa.slots) {
      let tint = 0xffffffff;

      if (slot.tint) {
        const def = findKeyFrames(slot.tint, time, this.animationLength);
        if (def.frameA.frame.kind !== ISAFrameKind.Color || def.frameB.frame.kind !== ISAFrameKind.Color)
          throw new Error('unexpected frame kind');
        const a = def.frameA.frame.color;
        const b = def.frameB.frame.color;
        tint =
          Math.floor(interpolate(def, (a >>> 24) & 0xff, (b >>> 24) & 0xff)) * 0x1000000 +
          Math.floor(interpolate(def, (a >>> 16) & 0xff, (b >>> 16) & 0xff)) * 0x10000 +
          Math.floor(interpolate(def, (a >>> 8) & 0xff, (b >>> 8) & 0xff)) * 0x100 +
          Math.floor(interpolate(def, (a >>> 0) & 0xff, (b >>> 0) & 0xff)) * 0x1;
      }
      if (slot.visibility) {
        const def = findKeyFrames(slot.visibility, time, this.animationLength);
        if (def.frameA.frame.kind !== ISAFrameKind.Visibility || def.frameB.frame.kind !== ISAFrameKind.Visibility)
          throw new Error('unexpected frame kind');
        tint = def.frameA.frame.visibility ? tint : 0;
      }

      slotTints.set(slot.id, tint);
    }
    return slotTints;
  }

  private animateMeshDeformations(time: number) {
    const meshDeformations = new Map<number, Vec2[]>();
    for (const mesh of this.isa.meshs) {
      const deformation: Vec2[] = [];

      if (mesh.deformation) {
        const def = findKeyFrames(mesh.deformation, time, this.animationLength);
        if (def.frameA.frame.kind !== ISAFrameKind.Points || def.frameB.frame.kind !== ISAFrameKind.Points)
          throw new Error('unexpected frame kind');

        const numPoints = Math.max(def.frameA.frame.points.length, def.frameB.frame.points.length);
        for (let i = 0; i < numPoints; i++) {
          const a = def.frameA.frame.points[i] || { x: 0, y: 0 };
          const b = def.frameB.frame.points[i] || { x: 0, y: 0 };
          deformation.push({
            x: interpolate(def, a.x, b.x),
            y: interpolate(def, a.y, b.y),
          });
        }
      }

      meshDeformations.set(mesh.id, deformation);
    }
    return meshDeformations;
  }

  private computeTransforms(animatedTransforms: Map<number, Transform>) {
    const computedTransforms = new Map<number, mat2d>();

    const compute = (id: number, parent: mat2d) => {
      const transform = mat2d.clone(parent);

      const boneTransform = this.isc.bones[id].transform;
      const animatedTransform = animatedTransforms.get(id) || Transform.identity();

      mat2d.translate(transform, transform, [
        boneTransform.tx + animatedTransform.tx,
        boneTransform.ty + animatedTransform.ty,
      ]);

      if (this.isc.bones[id].transformMode === 2) {
        transform[0] = Math.sqrt(transform[0] * transform[0] + transform[2] * transform[2]);
        transform[3] = -Math.sqrt(transform[1] * transform[1] + transform[3] * transform[3]);
        transform[1] = 0;
        transform[2] = 0;
      }

      mat2d.rotate(transform, transform, (boneTransform.angle + animatedTransform.angle) * Math.PI / 180);
      mat2d.scale(transform, transform, [
        boneTransform.sx * animatedTransform.sx,
        boneTransform.sy * animatedTransform.sy,
      ]);

      computedTransforms.set(id, transform);
      for (const child of (this.boneChildrens.get(id) || []))
        compute(child.id, transform);
    };
    compute(0, mat2d.fromScaling(mat2d.create(), [1, -1]));

    return computedTransforms;
  }

  private computeTints(animatedTints: Map<number, number>) {
    const computedTints = new Map<number, number>();

    function blend(dst: number, src: number, alpha: number) {
      return src * alpha + dst * (1 - alpha);
    }

    for (const slot of this.isc.slots) {
      let a = 0xff;
      let r = (slot.tint >>> 16) & 0xff;
      let g = (slot.tint >>> 8) & 0xff;
      let b = (slot.tint >>> 0) & 0xff;

      const animatedTint = animatedTints.get(slot.id);
      if (typeof animatedTint === 'number') {
        const alpha = (animatedTint >>> 24) / 0xff;
        a = animatedTint >>> 24;
        r = Math.floor(blend(r, (animatedTint >>> 16) & 0xff, alpha));
        g = Math.floor(blend(g, (animatedTint >>> 8) & 0xff, alpha));
        b = Math.floor(blend(b, (animatedTint >>> 0) & 0xff, alpha));
      }

      const tint = a * 0x1000000 + r * 0x10000 + g * 0x100 + b * 0x1;
      computedTints.set(slot.id, tint);
    }

    return computedTints;
  }
}
