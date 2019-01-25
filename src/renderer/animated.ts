import { mat2d, vec2 } from 'gl-matrix';
import { BBIN } from '../models/bbin';
import { ISA, ISAAnimation, ISAFrameKind, ISAInterpolationKind, ISAKeyFrame } from '../models/isa';
import { ISC, ISCBone } from '../models/isc';
import { Transform, Vec2 } from '../models/math';
import { TEX } from '../models/tex';
import { bezier, solveBezier } from './bezier';
import { Renderer } from './renderer';

function findKeyFrames(animation: ISAAnimation, time: number, totalTime: number): InterpolationDef {
  let nextFrameIndex = animation.frames.findIndex((frame) => frame.time > time);
  if (nextFrameIndex < 0) {
    nextFrameIndex = 0;
  }
  const thisFrameIndex = (nextFrameIndex - 1 + animation.frames.length) % animation.frames.length;

  const thisFrame = animation.frames[thisFrameIndex];
  const nextFrame = animation.frames[nextFrameIndex];

  let duration = nextFrame.time - thisFrame.time;
  if (duration <= 0) duration += totalTime;
  const percent = ((time - thisFrame.time + totalTime) % totalTime) / duration;

  return { percent, frameA: thisFrame, frameB: nextFrame };
}

interface InterpolationDef {
  percent: number;
  frameA: ISAKeyFrame;
  frameB: ISAKeyFrame;
}

function interpolate(def: InterpolationDef, a: number, b: number) {
  switch (def.frameA.interpolation.kind) {
    default:
    case ISAInterpolationKind.Constant:
      return a;
    case ISAInterpolationKind.Linear:
      return a + (b - a) * def.percent;
    case ISAInterpolationKind.Bezier: {
      const curve = def.frameA.interpolation;
      const x = def.percent;
      const t = solveBezier(x, 0, curve.x1, curve.x2, 1);
      const y = bezier(t, 0, curve.y1, curve.y2, 1);
      return a + (b - a) * y;
    }
  }
}

interface SlotAnimation {
  tint?: number;
  skinName?: string;
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
        slot.attachment ? slot.attachment.timeLength : 0,
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
    const animatedSlots = this.animateSlots(animationTime);
    const animatedDeformations = this.animateMeshDeformations(animationTime);

    const transforms = this.computeTransforms(animatedTransforms);
    const tints = this.computeTints(animatedSlots);

    for (const slot of this.isc.slots) {
      const { skinName } = animatedSlots.get(slot.id) || { skinName: undefined };
      const skin = typeof skinName === 'undefined' ?
        this.isc.skins[slot.skinId] :
        this.isc.skins.find((s) => s.name === skinName);
      if (!skin) continue;

      const mesh = this.isc.meshs[skin.meshId];

      let tint = tints.get(slot.id);
      if (tint === undefined) {
        tint = slot.tint;
      }

      let deformIndex = 0;
      const deformation = animatedDeformations.get(mesh.id) || [];
      const identity = mat2d.identity(mat2d.create());

      const positions = mesh.vertices.map(({ dst }, i) => {
        const v = vec2.create();
        if (Array.isArray(dst)) {
          for (const { boneId, vertex, ratio } of dst) {
            const deform = deformation[deformIndex++] || { x: 0, y: 0 };
            const vv = vec2.fromValues(vertex.x + deform.x, vertex.y + deform.y);
            vec2.transformMat2d(vv, vv, transforms.get(boneId) || identity);
            vec2.scaleAndAdd(v, v, vv, ratio);
          }
        } else {
          const deform = deformation[deformIndex++] || { x: 0, y: 0 };
          vec2.set(v, dst.x + deform.x, dst.y + deform.y);
          vec2.transformMat2d(v, v, transforms.get(slot.boneId) || identity);
        }
        return v;
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
      this.context.drawTex(
        texture,
        new Float32Array(positionBuf), new Float32Array(texCoordsBuf),
        tint, slot.flags === 1 ? 'additive' : 'normal',
      );
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

  private animateSlots(time: number) {
    const slotTints = new Map<number, SlotAnimation>();
    for (const slot of this.isa.slots) {
      let tint: number | undefined;
      let skinName: string | undefined;

      if (slot.tint) {
        const def = findKeyFrames(slot.tint, time, this.animationLength);
        if (def.frameA.frame.kind !== ISAFrameKind.Color || def.frameB.frame.kind !== ISAFrameKind.Color)
          throw new Error('unexpected frame kind');
        const a = def.frameA.frame.color;
        const b = def.frameB.frame.color;
        tint =
          Math.floor(interpolate(def, (a >>> 24) & 0xff, (b >>> 24) & 0xff)) * 0x1000000 +
          Math.floor(interpolate(def, (a >>> 0) & 0xff, (b >>> 0) & 0xff)) * 0x10000 +
          Math.floor(interpolate(def, (a >>> 8) & 0xff, (b >>> 8) & 0xff)) * 0x100 +
          Math.floor(interpolate(def, (a >>> 16) & 0xff, (b >>> 16) & 0xff)) * 0x1;
      }
      if (slot.attachment) {
        const def = findKeyFrames(slot.attachment, time, this.animationLength);
        if (def.frameA.frame.kind !== ISAFrameKind.Attachment || def.frameB.frame.kind !== ISAFrameKind.Attachment)
          throw new Error('unexpected frame kind');
        skinName = def.frameA.frame.skinName;
      }

      slotTints.set(slot.id, { tint, skinName });
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

  private computeTints(animatedTints: Map<number, SlotAnimation>) {
    const computedTints = new Map<number, number>();

    function blend(dst: number, src: number, alpha: number) {
      return src * alpha + dst * (1 - alpha);
    }

    for (const slot of this.isc.slots) {
      let a = 0xff;
      let r = (slot.tint >>> 16) & 0xff;
      let g = (slot.tint >>> 8) & 0xff;
      let b = (slot.tint >>> 0) & 0xff;

      const animatedSlot = animatedTints.get(slot.id);
      if (animatedSlot && typeof animatedSlot.tint !== 'undefined') {
        const alpha = (animatedSlot.tint >>> 24) / 0xff;
        a = animatedSlot.tint >>> 24;
        r = Math.floor(blend(r, (animatedSlot.tint >>> 16) & 0xff, alpha));
        g = Math.floor(blend(g, (animatedSlot.tint >>> 8) & 0xff, alpha));
        b = Math.floor(blend(b, (animatedSlot.tint >>> 0) & 0xff, alpha));
      }

      const tint = a * 0x1000000 + r * 0x10000 + g * 0x100 + b * 0x1;
      computedTints.set(slot.id, tint);
    }

    return computedTints;
  }
}
