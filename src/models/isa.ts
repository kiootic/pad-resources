import { range } from 'lodash';
import { readASCII } from '../utils';
import { Vec2 } from './math';

export interface ISA {
  version: string;
  name: string;
  bones: ISABone[];
  slots: ISASlot[];
  skins: ISASkin[];
  meshs: ISAMesh[];
}

export interface ISABone {
  id: number;
  name: string;
  rotation: ISAAnimation | null;
  scaling: ISAAnimation | null;
  translation: ISAAnimation | null;
}

export interface ISASlot {
  id: number;
  name: string;
  tint: ISAAnimation | null;
  attachment: ISAAnimation | null;
}

export interface ISASkin {
  id: number;
  name: string;
}

export interface ISAMesh {
  id: number;
  name: string;
  deformation: ISAAnimation | null;
}

export interface ISAAnimation {
  timeLength: number;
  frames: ISAKeyFrame[];
}

export interface ISAKeyFrame {
  time: number;
  frame: ISAFrame;
  interpolation: ISAInterpolation;
}

export type ISAFrame =
  ISAFrameAngle |
  ISAFrameColor |
  ISAFrameVertex |
  ISAFrameAttachment |
  ISAFramePoints;

export enum ISAFrameKind {
  Angle = 'angle',
  Color = 'color',
  Vertex = 'vertex',
  Attachment = 'attachment',
  Points = 'points',
}

export interface ISAFrameAngle {
  kind: ISAFrameKind.Angle;
  angle: number;
}

export interface ISAFrameColor {
  kind: ISAFrameKind.Color;
  color: number;
}

export interface ISAFrameVertex {
  kind: ISAFrameKind.Vertex;
  vertex: Vec2;
}

export interface ISAFrameAttachment {
  kind: ISAFrameKind.Attachment;
  name: string;
}

export interface ISAFramePoints {
  kind: ISAFrameKind.Points;
  points: Vec2[];
}

export type ISAInterpolation =
  ISAInterpolationSimple |
  ISAInterpolationBezier;

export enum ISAInterpolationKind {
  Constant = 'constant',
  Linear = 'linear',
  Bezier = 'B',
}

export interface ISAInterpolationSimple {
  kind: ISAInterpolationKind.Constant | ISAInterpolationKind.Linear;
}

export interface ISAInterpolationBezier {
  kind: ISAInterpolationKind.Bezier;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const FrameKindMap: Record<string, ISAFrameKind> = {
  A: ISAFrameKind.Angle,
  C: ISAFrameKind.Color,
  V: ISAFrameKind.Vertex,
  T: ISAFrameKind.Attachment,
  P: ISAFrameKind.Points,
};

const InterpolationKindMap: Record<string, ISAInterpolationKind> = {
  C: ISAInterpolationKind.Constant,
  L: ISAInterpolationKind.Linear,
  B: ISAInterpolationKind.Bezier,
};

function readAnimation(buf: Buffer, offset: number): ISAAnimation | null {
  if (offset === 0)
    return null;

  const sig = buf.readUInt32LE(offset + 0);
  if (sig !== 0x5459454B)
    throw new Error(`invalid key frames signature: ${sig}`);

  const offsetFrames = buf.readUInt32LE(offset + 4);
  const numFrames = buf.readUInt32LE(offset + 8);
  const timeLength = buf.readFloatLE(offset + 12);

  let pos = offsetFrames;
  const frames: ISAKeyFrame[] = [];
  for (let i = 0; i < numFrames; i++) {
    const fsig = buf.slice(pos + 0, pos + 4).toString();
    if (fsig.slice(0, 2) !== 'KF')
      throw new Error(`invalid key frame sig: ${fsig}`);

    const time = buf.readFloatLE(pos + 4);

    const frameKind = FrameKindMap[fsig[2]];
    const interpolationKind = InterpolationKindMap[fsig[3]];
    let interpolationPos: number | undefined;

    let frame: ISAFrame;
    switch (frameKind) {
      case ISAFrameKind.Angle:
        frame = { kind: frameKind, angle: buf.readFloatLE(pos + 8) };
        pos += 0x10;
        break;
      case ISAFrameKind.Color:
        frame = { kind: frameKind, color: buf.readUInt32LE(pos + 8) };
        pos += 0x10;
        break;
      case ISAFrameKind.Vertex:
        frame = {
          kind: frameKind,
          vertex: { x: buf.readFloatLE(pos + 8), y: buf.readFloatLE(pos + 12) },
        };
        pos += 0x10;
        break;
      case ISAFrameKind.Attachment:
        frame = {
          kind: frameKind,
          name: readASCII(buf, pos + 0x10),
        };
        pos += 0x20;
        break;
      case ISAFrameKind.Points:
        const numPoints = buf.readUInt16LE(pos + 10);
        let pointsPos = pos + 0x10;
        if (interpolationKind === ISAInterpolationKind.Bezier) {
          interpolationPos = pos + 0x10;
          pointsPos = pos + 0x20;
        }
        frame = {
          kind: frameKind,
          points: range(numPoints).map((j) => ({
            x: buf.readFloatLE(pointsPos + j * 8 + 0),
            y: buf.readFloatLE(pointsPos + j * 8 + 4),
          })),
        };
        pos = pointsPos + ((numPoints + 1) & ~1) * 8;
        break;
      default:
        throw new Error(`unsupported key frame kind: ${fsig[2]}`);
    }

    let interpolation: ISAInterpolation;
    switch (interpolationKind) {
      case ISAInterpolationKind.Constant:
      case ISAInterpolationKind.Linear:
        interpolation = { kind: interpolationKind };
        break;
      case ISAInterpolationKind.Bezier:
        const ctrlPointsPos = interpolationPos || pos;
        interpolation = {
          kind: interpolationKind,
          x1: buf.readFloatLE(ctrlPointsPos + 0),
          y1: buf.readFloatLE(ctrlPointsPos + 4),
          x2: buf.readFloatLE(ctrlPointsPos + 8),
          y2: buf.readFloatLE(ctrlPointsPos + 12),
        };
        if (ctrlPointsPos === pos) {
          pos += 0x10;
        }
        break;
      default:
        throw new Error(`unsupported interpolation type: ${fsig[3]}`);
    }
    frames.push({ time, frame, interpolation });
  }

  return { timeLength, frames };
}

export const ISA = {
  match(buf: Buffer): boolean {
    return buf.length >= 4 && buf.readUInt32LE(0) === 0x32415349;
  },
  load(buf: Buffer): ISA {
    const version = buf.slice(4, 8).toString();
    const name = readASCII(buf, buf.readUInt32LE(16));

    const numBones = buf.readUInt32LE(24 + 0 * 8 + 0);
    const offsetBones = buf.readUInt32LE(24 + 0 * 8 + 4);
    const numSlots = buf.readUInt32LE(24 + 1 * 8 + 0);
    const offsetSlots = buf.readUInt32LE(24 + 1 * 8 + 4);
    const numSkins = buf.readUInt32LE(24 + 2 * 8 + 0);
    const offsetSkins = buf.readUInt32LE(24 + 2 * 8 + 4);
    const numMeshs = buf.readUInt32LE(24 + 3 * 8 + 0);
    const offsetMeshs = buf.readUInt32LE(24 + 3 * 8 + 4);

    const bones: ISABone[] = [];
    for (let i = 0; i < numBones; i++) {
      const type = buf.readUInt32LE(offsetBones + i * 0x30 + 0);
      if (type !== 0x454E4F42)
        throw new Error(`unknown bone type: ${type}`);

      bones.push({
        id: i,
        name: readASCII(buf, offsetBones + i * 0x30 + 0x20),
        rotation: readAnimation(buf, buf.readUInt32LE(offsetBones + i * 0x30 + 4)),
        scaling: readAnimation(buf, buf.readUInt32LE(offsetBones + i * 0x30 + 8)),
        translation: readAnimation(buf, buf.readUInt32LE(offsetBones + i * 0x30 + 12)),
      });
    }

    const slots: ISASlot[] = [];
    for (let i = 0; i < numSlots; i++) {
      const type = buf.readUInt32LE(offsetSlots + i * 0x20 + 0);
      if (type !== 0x544F4C53)
        throw new Error(`unknown slot type: ${type}`);

      slots.push({
        id: i,
        name: readASCII(buf, offsetSlots + i * 0x20 + 0x10),
        tint: readAnimation(buf, buf.readUInt32LE(offsetSlots + i * 0x20 + 4)),
        attachment: readAnimation(buf, buf.readUInt32LE(offsetSlots + i * 0x20 + 8)),
      });
    }

    const skins: ISASkin[] = [];
    for (let i = 0; i < numSkins; i++) {
      const type = buf.readUInt32LE(offsetSkins + i * 0x20 + 0);
      if (type !== 0x4E494B53)
        throw new Error(`unknown skin type: ${type}`);

      skins.push({
        id: i,
        name: readASCII(buf, offsetSkins + i * 0x20 + 0x10),
      });
    }

    const meshs: ISAMesh[] = [];
    for (let i = 0; i < numMeshs; i++) {
      const type = buf.readUInt32LE(offsetMeshs + i * 0x20 + 0);
      if (type !== 0x4853454D)
        throw new Error(`unknown mesh type: ${type}`);

      meshs.push({
        id: i,
        name: readASCII(buf, offsetMeshs + i * 0x20 + 0x10),
        deformation: readAnimation(buf, buf.readUInt32LE(offsetMeshs + i * 0x20 + 4)),
      });
    }

    return { version, name, bones, slots, skins, meshs };
  },
};
