import { chunk, range } from 'lodash';
import { readASCII } from '../utils';
import { Transform, Vec2 } from './math';

export interface ISC {
  version: string;
  name: string;
  bones: ISCBone[];
  slots: ISCSlot[];
  forms: ISCForm[];
  skins: ISCSkin[];
  meshs: ISCMesh[];
  ikConstraints: ISCIKConstraint[];
}

export interface ISCBone {
  id: number;
  parentId: number;
  name: string;
  length: number;
  transform: Transform;
  transformMode: number;
}

export interface ISCSlot {
  id: number;
  tint: number;
  boneId: number;
  skinId: number;
  skinName: string;
  boneName: string;
  meshName: string;
  flags: number;
}

export interface ISCForm {
  id: number;
  name: string;
}

export interface ISCSkin {
  id: number;
  flags: number;
  meshId: number;
  name: string;
}

export interface ISCMesh {
  id: number;
  type: ISCMeshType;
  name: string;
  textureId: number;
  isSpring: boolean;
  triangleList: Array<[number, number, number]>;
  vertices: Array<ISCMeshVertex | ISCSpringVertex>;
}

export interface ISCMeshVertex {
  src: Vec2;
  dst: Vec2;
}

export interface ISCSpringVertexJoint {
  boneId: number;
  vertex: Vec2;
  ratio: number;
}

export interface ISCSpringVertex {
  src: Vec2;
  dst: ISCSpringVertexJoint[];
}

export enum ISCMeshType {
  QUAD = 'QUAD',
  MESH = 'MESH',
}

export interface ISCIKConstraint {
  order: number;
  boneId1: number;
  boneId2: number;
  targetBoneId: number;
  mix: number;
  bendPositive: boolean;
  softness: number;
}

export const ISC = {
  match(buf: Buffer): boolean {
    return buf.length >= 4 && buf.readUInt32LE(0) === 0x32435349;
  },
  load(buf: Buffer): ISC {
    const version = buf.slice(4, 8).toString();
    const name = readASCII(buf, buf.readUInt32LE(16));

    const numBones = buf.readUInt32LE(24 + 0 * 8 + 0);
    const offsetBones = buf.readUInt32LE(24 + 0 * 8 + 4);
    const numSlots = buf.readUInt32LE(24 + 1 * 8 + 0);
    const offsetSlots = buf.readUInt32LE(24 + 1 * 8 + 4);
    const numForms = buf.readUInt32LE(24 + 2 * 8 + 0);
    const offsetForms = buf.readUInt32LE(24 + 2 * 8 + 4);
    const numSkins = buf.readUInt32LE(24 + 3 * 8 + 0);
    const offsetSkins = buf.readUInt32LE(24 + 3 * 8 + 4);
    const numMeshs = buf.readUInt32LE(24 + 4 * 8 + 0);
    const offsetMeshs = buf.readUInt32LE(24 + 4 * 8 + 4);
    const numIKs = buf.readUInt32LE(24 + 5 * 8 + 0);
    const offsetIKs = buf.readUInt32LE(24 + 5 * 8 + 4);

    const bones: ISCBone[] = [];
    for (let i = 0; i < numBones; i++) {
      const type = buf.readInt32LE(offsetBones + i * 0x40 + 0);
      if (type !== 0x454E4F42)
        throw new Error(`unknown bone type: ${type}`);

      bones.push({
        id: i,
        parentId: buf.readInt32LE(offsetBones + i * 0x40 + 4),
        name: readASCII(buf, offsetBones + i * 0x40 + 0x30),
        transform: {
          angle: buf.readFloatLE(offsetBones + i * 0x40 + 12),
          sx: buf.readFloatLE(offsetBones + i * 0x40 + 16),
          sy: buf.readFloatLE(offsetBones + i * 0x40 + 20),
          tx: buf.readFloatLE(offsetBones + i * 0x40 + 24),
          ty: buf.readFloatLE(offsetBones + i * 0x40 + 28),
          shearx: buf.readFloatLE(offsetBones + i * 0x40 + 32),
          sheary: buf.readFloatLE(offsetBones + i * 0x40 + 36),
        },
        transformMode: buf.readUInt32LE(offsetBones + i * 0x40 + 40),
        length: buf.readFloatLE(offsetBones + i * 0x40 + 44),
      });
    }

    const slots: ISCSlot[] = [];
    for (let i = 0; i < numSlots; i++) {
      const type = buf.readInt32LE(offsetSlots + i * 0x80 + 0);
      if (type !== 0x544F4C53)
        throw new Error(`unknown slot type: ${type}`);

      slots.push({
        id: i,
        tint: buf.readUInt32LE(offsetSlots + i * 0x80 + 4),
        boneId: buf.readInt32LE(offsetSlots + i * 0x80 + 8),
        skinId: buf.readInt32LE(offsetSlots + i * 0x80 + 12),
        skinName: readASCII(buf, offsetSlots + i * 0x80 + 0x10),
        boneName: readASCII(buf, offsetSlots + i * 0x80 + 0x20),
        meshName: readASCII(buf, offsetSlots + i * 0x80 + 0x30),
        flags: buf.readUInt32LE(offsetSlots + i * 0x80 + 0x40),
      });
    }

    const forms: ISCForm[] = [];
    for (let i = 0; i < numForms; i++) {
      const type = buf.readInt32LE(offsetForms + i * 0x20 + 0);
      if (type !== 0x4D524F46)
        throw new Error(`unknown form type: ${type}`);

      forms.push({
        id: i,
        name: readASCII(buf, offsetForms + i * 0x20 + 0x10),
      });
    }

    const skins: ISCSkin[] = [];
    for (let i = 0; i < numSkins; i++) {
      const type = buf.readInt32LE(offsetSkins + i * 0x20 + 0);
      if (type !== 0x4E494B53)
        throw new Error(`unknown skin type: ${type}`);

      skins.push({
        id: i,
        flags: buf.readInt32LE(offsetSkins + i * 0x20 + 4),
        meshId: buf.readInt32LE(offsetSkins + i * 0x20 + 8),
        name: readASCII(buf, offsetSkins + i * 0x20 + 0x10),
      });
    }

    const meshs: ISCMesh[] = [];
    for (let i = 0; i < numMeshs; i++) {
      const type = buf.readInt32LE(offsetMeshs + i * 0x30 + 0);
      if (type !== 0x4853454D)
        throw new Error(`unknown mesh type: ${type}`);

      const textureId = buf.readInt32LE(offsetMeshs + i * 0x30 + 8);
      const flag = buf.readInt32LE(offsetMeshs + i * 0x30 + 12);

      const ptOffset = buf.readInt32LE(offsetMeshs + i * 0x30 + 16);
      const ptSize = buf.readInt32LE(offsetMeshs + i * 0x30 + 20);
      const vOffset = buf.readInt32LE(offsetMeshs + i * 0x30 + 24);
      const vSize = buf.readInt32LE(offsetMeshs + i * 0x30 + 28);

      let offset = vOffset;
      const isSpring = flag === 1;
      function readVertex() {
        let vertex: ISCMeshVertex | ISCSpringVertex;
        if (isSpring) {
          const num = buf.readInt32LE(offset + 8);
          vertex = {
            src: { x: buf.readFloatLE(offset + 0), y: buf.readFloatLE(offset + 4) },
            dst: range(num).map((j) => ({
              boneId: buf.readInt32LE(offset + 0x10 + j * 0x10 + 0),
              vertex: {
                x: buf.readFloatLE(offset + 0x10 + j * 0x10 + 4),
                y: buf.readFloatLE(offset + 0x10 + j * 0x10 + 8),
              },
              ratio: buf.readFloatLE(offset + 0x10 + j * 0x10 + 12),
            })),
          };
          offset += 0x10 * (num + 1);
        } else {
          vertex = {
            src: { x: buf.readFloatLE(offset + 8), y: buf.readFloatLE(offset + 12) },
            dst: { x: buf.readFloatLE(offset + 0), y: buf.readFloatLE(offset + 4) },
          };
          offset += 0x10;
        }
        return vertex;
      }

      meshs.push({
        id: i,
        type: buf.slice(offsetMeshs + i * 0x30 + 4, offsetMeshs + i * 0x30 + 8).toString() as ISCMeshType,
        name: readASCII(buf, offsetMeshs + i * 0x30 + 0x20),
        textureId,
        isSpring,
        triangleList: chunk(
          range(ptSize).map((j) => buf.readInt32LE(ptOffset + j * 4)), 3,
        ) as Array<[number, number, number]>,
        vertices: range(vSize).map(() => readVertex()),
      });
    }

    const ikConstraints: ISCIKConstraint[] = [];
    for (let i = 0; i < numIKs; i++) {
      const type = buf.readInt32LE(offsetIKs + i * 0x20 + 0);
      if (type !== 0x54534349)
        throw new Error(`unknown ik type: ${type}`);

      ikConstraints.push({
        order: buf.readUInt32LE(offsetIKs + i * 0x20 + 4),
        boneId1: buf.readUInt32LE(offsetIKs + i * 0x20 + 8),
        boneId2: buf.readUInt32LE(offsetIKs + i * 0x20 + 12),
        targetBoneId: buf.readUInt32LE(offsetIKs + i * 0x20 + 16),
        mix: buf.readFloatLE(offsetIKs + i * 0x20 + 20),
        bendPositive: buf.readUInt32LE(offsetIKs + i * 0x20 + 24) !== 0,
        softness: buf.readFloatLE(offsetIKs + i * 0x20 + 28),
      });
    }

    return { version, name, bones, slots, forms, skins, meshs, ikConstraints };
  },
};
