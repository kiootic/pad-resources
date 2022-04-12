import { ISA, ISAFrame, ISAFrameAngle, ISAFrameAttachment, ISAFrameColor, ISAFramePoints, ISAFrameVertex, ISAInterpolationBezier, ISAInterpolationKind, ISAKeyFrame } from "./isa";
import { ISC, ISCMesh } from "./isc";
import { SpineAtlas } from "./spine-atlas";
import { BeizerCurve, Curve1, Curve2, Curve4, SkeletonAnimation, SkeletonAnimationBoneTimelines, SkeletonAnimationKeyframeCurve1, SkeletonAnimationKeyframeCurve2, SkeletonAnimationKeyframeCurve4, SkeletonAnimationSkinDeforms, SkeletonAnimationSlotTimelines, SkeletonAttachment, SkeletonBone, SkeletonSkin, SkeletonSlot, SpineSkeleton } from "./spine-skeleton";

function rgba(color: number): string {
    return (((color >> 24) & 0xff) + (color & 0xffffff) * 256).toString(16).padStart(8, "0");
}

export function loadISC(isc: ISC, skeleton: SpineSkeleton, atlas: SpineAtlas) {
    const bones = new Map(isc.bones.map(b => [b.id, b]));
    for (const bone of isc.bones) {
        let transform: SkeletonBone["transform"];
        switch (bone.transformMode) {
            case 0:
                transform = "normal";
                break;
            case 2:
                transform = "noRotationOrReflection";
                break;
        }
        skeleton.bones.push({
            name: bone.name,
            parent: bone.parentId >= 0 ? bones.get(bone.parentId)!.name : undefined,
            length: bone.length,
            x: bone.transform.tx,
            y: bone.transform.ty,
            rotation: bone.transform.angle,
            scaleX: bone.transform.sx,
            scaleY: bone.transform.sy,
            shearX: bone.transform.shearx,
            shearY: bone.transform.sheary,
            transform,
        });
    }

    for (const slot of isc.slots) {
        let blend: SkeletonSlot["blend"] = "normal";
        switch (slot.flags) {
            case 0:
                blend = "normal";
                break;
            case 1:
                blend = "additive";
                break;
        }

        skeleton.slots.push({
            name: slot.skinName,
            bone: slot.boneName,
            attachment: slot.meshName,
            color: rgba(slot.tint),
            blend,
        });
    }

    for (const ik of isc.ikConstraints) {
        const bone1 = bones.get(ik.boneId1)!.name;
        const bone2 = bones.get(ik.boneId2)!.name;
        const target = bones.get(ik.targetBoneId)!.name;
        skeleton.ik.push({
            name: target,
            bones: [bone1, bone2],
            target,
            order: ik.order,
            mix: ik.mix,
            softness: ik.softness,
            bendPositive: ik.bendPositive
        })
    }

    const s: SkeletonSkin = {
        name: isc.forms[0].name,
        attachments: {},
    };
    skeleton.skins.push(s);

    function translateMesh(mesh: ISCMesh): SkeletonAttachment {
        const triangles = ([] as number[]).concat(...mesh.triangleList);
        const uvs: number[] = [];
        const vertices: number[] = [];
        for (const v of mesh.vertices) {
            uvs.push(v.src.x, v.src.y);
            if (Array.isArray(v.dst)) {
                vertices.push(v.dst.length);
                for (const joint of v.dst) {
                    const index = isc.bones.findIndex(b => b.id === joint.boneId);
                    vertices.push(index, joint.vertex.x, joint.vertex.y, joint.ratio);
                }
            } else {
                vertices.push(v.dst.x, v.dst.y);
            }
        }
        if (triangles.length === 0) {
            triangles.push(0, 1, 2, 3, 4, 5);
        }

        return {
            name: atlas.images[mesh.textureId < 0 ? 0 : mesh.textureId].name,
            type: "mesh",
            uvs,
            vertices,
            triangles,
        };
    }

    const meshs = new Map(isc.meshs.map(m => [m.id, m]));
    const used = new Set<number>();
    for (const skin of isc.skins) {
        const mesh = meshs.get(skin.meshId)!;
        used.add(skin.meshId);

        const attachment = translateMesh(mesh);

        if (!s.attachments[skin.name]) {
            s.attachments[skin.name] = {};
        }
        s.attachments[skin.name][mesh.name] = attachment;
    }
    for (const [id, mesh] of meshs.entries()) {
        if (!used.has(id)) {
            skeleton.__attachments[mesh.name] = translateMesh(mesh);
        }
    }
}

function beizer(b: ISAInterpolationBezier, x1: number, x2: number, y1: any, y2: any): BeizerCurve {
    return [
        x1 + b.x1 * (x2 - x1),
        y1 + b.y1 * (y2 - y1),
        x1 + b.x2 * (x2 - x1),
        y1 + b.y2 * (y2 - y1),
    ];
}

type ValueFn<T> = (f: T | undefined) => number | undefined;

type KeyFrame<T extends ISAFrame> = ISAKeyFrame & { frame: T };

function mapFrames<T extends ISAFrame>(fs: ISAKeyFrame[]): <V>(fn: (fs: KeyFrame<T>[]) => V) => V {
    return (fn) => fn(fs as KeyFrame<T>[]);
}

function keyframeCurve1<T extends ISAFrame>(fs: KeyFrame<T>[], i: number, v: ValueFn<T>): SkeletonAnimationKeyframeCurve1 {
    const f = fs[i], n = fs[i + 1];
    let curve: Curve1 | undefined;
    switch (f.interpolation.kind) {
        case ISAInterpolationKind.Constant:
            curve = "stepped";
            break;
        case ISAInterpolationKind.Bezier:
            curve = beizer(f.interpolation, f?.time ?? 0, n.time, v(f?.frame) ?? 0, v(n?.frame) ?? 1)
            break;
    }
    return { time: f.time, curve };
}

function keyframeCurve2<T extends ISAFrame>(fs: KeyFrame<T>[], i: number, v1: ValueFn<T>, v2: ValueFn<T>): SkeletonAnimationKeyframeCurve2 {
    const f = fs[i], n = fs[i + 1];
    let curve: Curve2 | undefined;
    switch (f.interpolation.kind) {
        case ISAInterpolationKind.Constant:
            curve = "stepped";
            break;
        case ISAInterpolationKind.Bezier:
            curve = [
                ...beizer(f.interpolation, f?.time ?? 0, n.time, v1(f?.frame) ?? 0, v1(n?.frame) ?? 1),
                ...beizer(f.interpolation, f?.time ?? 0, n.time, v2(f?.frame) ?? 0, v2(n?.frame) ?? 1),
            ];
            break;
    }
    return { time: f.time, curve };
}

function keyframeCurve4<T extends ISAFrame>(fs: KeyFrame<T>[], i: number, v1: ValueFn<T>, v2: ValueFn<T>, v3: ValueFn<T>, v4: ValueFn<T>): SkeletonAnimationKeyframeCurve4 {
    const f = fs[i], n = fs[i + 1];
    let curve: Curve4 | undefined;
    switch (f.interpolation.kind) {
        case ISAInterpolationKind.Constant:
            curve = "stepped";
            break;
        case ISAInterpolationKind.Bezier:
            curve = [
                ...beizer(f.interpolation, f?.time ?? 0, n.time, v1(f?.frame) ?? 0, v1(n?.frame) ?? 1),
                ...beizer(f.interpolation, f?.time ?? 0, n.time, v2(f?.frame) ?? 0, v2(n?.frame) ?? 1),
                ...beizer(f.interpolation, f?.time ?? 0, n.time, v3(f?.frame) ?? 0, v3(n?.frame) ?? 1),
                ...beizer(f.interpolation, f?.time ?? 0, n.time, v4(f?.frame) ?? 0, v4(n?.frame) ?? 1),
            ];
            break;
    }
    return { time: f.time, curve };
}

export function loadISA(name: string, isc: ISC, isa: ISA, skeleton: SpineSkeleton) {
    const anim: SkeletonAnimation = {
        bones: {},
        slots: {},
        deform: {},
    };
    skeleton.animations[name] = anim;

    for (const bone of isa.bones) {
        const timelines: SkeletonAnimationBoneTimelines = {};
        if (bone.rotation) {
            timelines.rotate = mapFrames<ISAFrameAngle>(bone.rotation.frames)
                (fs => fs.map((f, i) => ({
                    ...keyframeCurve1(fs, i, f => f?.angle),
                    value: f.frame.angle,
                })));
        }
        if (bone.scaling) {
            timelines.scale = mapFrames<ISAFrameVertex>(bone.scaling.frames)
                (fs => fs.map((f, i) => ({
                    ...keyframeCurve2(fs, i, f => f?.vertex.x, f => f?.vertex.y),
                    x: f.frame.vertex.x,
                    y: f.frame.vertex.y,
                })));
        }
        if (bone.translation) {
            timelines.translate = mapFrames<ISAFrameVertex>(bone.translation.frames)
                (fs => fs.map((f, i) => ({
                    ...keyframeCurve2(fs, i, f => f?.vertex.x, f => f?.vertex.y),
                    x: f.frame.vertex.x,
                    y: f.frame.vertex.y,
                })));
        }
        if (bone.shear) {
            timelines.shear = mapFrames<ISAFrameVertex>(bone.shear.frames)
                (fs => fs.map((f, i) => ({
                    ...keyframeCurve2(fs, i, f => f?.vertex.x, f => f?.vertex.y),
                    x: f.frame.vertex.x,
                    y: f.frame.vertex.y,
                })));
        }

        if (timelines.rotate || timelines.scale || timelines.translate) {
            anim.bones[bone.name] = timelines;
        }
    }

    for (const slot of isa.slots) {
        const timelines: SkeletonAnimationSlotTimelines = {};
        if (slot.attachment) {
            timelines.attachment = mapFrames<ISAFrameAttachment>(slot.attachment.frames)
                (fs => fs.map((f, i) => {
                    let name: string | null = null;
                    if (f.frame.name.length > 0) {
                        name = f.frame.name;
                        if (skeleton.__attachments[name]) {
                            skeleton.skins[0].attachments[slot.name][name] = skeleton.__attachments[name];
                            delete skeleton.__attachments[name];
                        }
                    }
                    return {
                        ...keyframeCurve1(fs, i, () => undefined),
                        name,
                    };
                }));
        }
        if (slot.tint) {
            timelines.rgba = mapFrames<ISAFrameColor>(slot.tint.frames)
                (fs => fs.map((f, i) => ({
                    ...keyframeCurve4(fs, i,
                        f => ((f?.color ?? 0 >> 24) & 0xff) / 0xff,
                        f => ((f?.color ?? 0 >> 16) & 0xff) / 0xff,
                        f => ((f?.color ?? 0 >> 8) & 0xff) / 0xff,
                        f => ((f?.color ?? 0 >> 0) & 0xff) / 0xff),
                    color: rgba(f.frame.color),
                })));
        }

        if (timelines.attachment || timelines.rgba) {
            anim.slots[slot.name] = timelines;
        }
    }

    const s: SkeletonAnimationSkinDeforms = {};
    anim.deform[skeleton.skins[0].name] = s;

    const slots = new Map(isc.slots.map(s => [s.skinName, s]));
    const skins = new Map(isc.skins.map(s => [s.meshId, s]));
    for (const mesh of isa.meshs) {
        if (mesh.deformation) {
            const slot = slots.get(skins.get(mesh.id)!.name)!;
            if (!s[slot.skinName]) {
                s[slot.skinName] = {};
            }
            s[slot.skinName][mesh.name] = mapFrames<ISAFramePoints>(mesh.deformation.frames)(fs => fs.map((f, i) => ({
                ...keyframeCurve1(fs, i, () => undefined),
                offset: 0,
                vertices: ([] as number[]).concat(...(f.frame as ISAFramePoints).points.map(v => [v.x, v.y]))
            })));
        }
    }
}