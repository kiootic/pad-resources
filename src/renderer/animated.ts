import { mat2d, vec2 } from 'gl-matrix';
import { BBIN } from '../models/bbin';
import { ISA, ISAAnimation, ISAFrameKind, ISAInterpolationKind, ISAKeyFrame } from '../models/isa';
import { ISC, ISCBone } from '../models/isc';
import { Transform, Vec2 } from '../models/math';
import { TEX } from '../models/tex';
import { Renderer } from './renderer';

function findKeyFrames(animation: ISAAnimation, time: number): [ISAKeyFrame, ISAKeyFrame] {
  let nextFrameIndex = animation.frames.findIndex((frame) => frame.time > time);
  if (nextFrameIndex < 0) nextFrameIndex = animation.frames.length;

  const thisFrame = animation.frames[(nextFrameIndex - 1 + animation.frames.length) % animation.frames.length];
  const nextFrame = animation.frames[nextFrameIndex] || animation.frames[0];
  return [thisFrame, nextFrame];
}

function interpolate(t: number, frameA: ISAKeyFrame, a: number, frameB: ISAKeyFrame, b: number) {
  const duration = frameB.time - frameA.time;
  if (duration === 0) return a;

  switch (frameA.interpolation.kind) {
    default:
    case ISAInterpolationKind.Constant:
      return a;
    case ISAInterpolationKind.Linear:
      return a + (b - a) * (t - frameA.time) / duration;
    case ISAInterpolationKind.B: {
      return a + (b - a) * (t - frameA.time) / duration;
    }
  }
}

export class AnimatedRenderer extends Renderer {
  private readonly textures: WebGLTexture[];
  private readonly isc: ISC;
  private readonly isa: ISA;

  private readonly animationLength: number;
  private readonly boneChildrens = new Map<number, ISCBone[]>();

  constructor(buf: Buffer) {
    super();

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

      let tint = animatedTints.get(slot.id);
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

      const texture = this.textures[mesh.textureId];
      this.context.setBlendMode('normal');
      this.context.drawTex(texture, new Float32Array(positionBuf), new Float32Array(texCoordsBuf), tint);
    }
  }

  private animateBoneTransforms(time: number) {
    const boneTransforms = new Map<number, Transform>();
    for (const bone of this.isa.bones) {
      const transform = Transform.identity();

      if (bone.rotation) {
        const [frameA, frameB] = findKeyFrames(bone.rotation, time);
        if (frameA.frame.kind !== ISAFrameKind.Angle || frameB.frame.kind !== ISAFrameKind.Angle)
          throw new Error('unexpected frame kind');
        transform.angle += interpolate(time, frameA, frameA.frame.angle, frameB, frameB.frame.angle);
      }
      if (bone.translation) {
        const [frameA, frameB] = findKeyFrames(bone.translation, time);
        if (frameA.frame.kind !== ISAFrameKind.Vertex || frameB.frame.kind !== ISAFrameKind.Vertex)
          throw new Error('unexpected frame kind');
        transform.tx += interpolate(time, frameA, frameA.frame.vertex.x, frameB, frameB.frame.vertex.x);
        transform.ty += interpolate(time, frameA, frameA.frame.vertex.y, frameB, frameB.frame.vertex.y);
      }
      if (bone.scaling) {
        const [frameA, frameB] = findKeyFrames(bone.scaling, time);
        if (frameA.frame.kind !== ISAFrameKind.Vertex || frameB.frame.kind !== ISAFrameKind.Vertex)
          throw new Error('unexpected frame kind');
        transform.sx *= interpolate(time, frameA, frameA.frame.vertex.x, frameB, frameB.frame.vertex.x);
        transform.sy *= interpolate(time, frameA, frameA.frame.vertex.y, frameB, frameB.frame.vertex.y);
      }

      boneTransforms.set(bone.id, transform);
    }
    return boneTransforms;
  }

  private animateSlotTints(time: number) {
    const slotTints = new Map<number, number>();
    for (const slot of this.isa.slots) {
      let tint = 0xfffffff;

      if (slot.tint) {
        const [frameA, frameB] = findKeyFrames(slot.tint, time);
        if (frameA.frame.kind !== ISAFrameKind.Color || frameB.frame.kind !== ISAFrameKind.Color)
          throw new Error('unexpected frame kind');
        const a = frameA.frame.color;
        const b = frameB.frame.color;
        tint =
          Math.floor(interpolate(time, frameA, (a >>> 24) & 0xff, frameB, (b >>> 24) & 0xff)) * 0x1000000 +
          Math.floor(interpolate(time, frameA, (a >>> 16) & 0xff, frameB, (b >>> 16) & 0xff)) * 0x10000 +
          Math.floor(interpolate(time, frameA, (a >>> 8) & 0xff, frameB, (b >>> 8) & 0xff)) * 0x100 +
          Math.floor(interpolate(time, frameA, (a >>> 0) & 0xff, frameB, (b >>> 0) & 0xff)) * 0x1;
      }
      if (slot.visibility) {
        const [frameA, frameB] = findKeyFrames(slot.visibility, time);
        if (frameA.frame.kind !== ISAFrameKind.Visibility || frameB.frame.kind !== ISAFrameKind.Visibility)
          throw new Error('unexpected frame kind');
        tint = frameA.frame.visibility ? tint : 0;
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
        const [frameA, frameB] = findKeyFrames(mesh.deformation, time);
        if (frameA.frame.kind !== ISAFrameKind.Points || frameB.frame.kind !== ISAFrameKind.Points)
          throw new Error('unexpected frame kind');

        const numPoints = Math.max(frameA.frame.points.length, frameB.frame.points.length);
        for (let i = 0; i < numPoints; i++) {
          const a = frameA.frame.points[i] || { x: 0, y: 0 };
          const b = frameB.frame.points[i] || { x: 0, y: 0 };
          deformation.push({
            x: interpolate(time, frameA, a.x, frameB, b.x),
            y: interpolate(time, frameA, a.y, frameB, b.y),
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
}
