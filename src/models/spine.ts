import { ISA, ISAFrameAngle, ISAFrameAttachment, ISAFrameColor, ISAFramePoints, ISAFrameVertex, ISAInterpolationKind, ISAKeyFrame } from "./isa";
import { ISC, ISCMesh } from "./isc";
import { SpineAtlas } from "./spine-atlas";
import { SkeletonAnimation, SkeletonAnimationBoneTimelines, SkeletonAnimationSkinDeforms, SkeletonAnimationSlotTimelines, SkeletonAttachment, SkeletonBone, SkeletonSkin, SkeletonSlot, SpineSkeleton } from "./spine-skeleton";

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
            x: bone.transform.tx,
            y: bone.transform.ty,
            rotation: bone.transform.angle,
            scaleX: bone.transform.sx,
            scaleY: bone.transform.sy,
            shearX: 0,
            shearY: 0,
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

function keyframe(f: ISAKeyFrame) {
    interface Keyframe {
        time: number;
        curve?: "stepped" | number;
        c2?: number;
        c3?: number;
        c4?: number;
    }
    const kf: Keyframe = { time: f.time };
    switch (f.interpolation.kind) {
        case ISAInterpolationKind.Constant:
            kf.curve = "stepped";
            break;
        case ISAInterpolationKind.Bezier:
            kf.curve = f.interpolation.x1;
            kf.c2 = f.interpolation.y1;
            kf.c3 = f.interpolation.x2;
            kf.c4 = f.interpolation.y2;
            break;
    }
    return kf;
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
            timelines.rotate = bone.rotation.frames.map(f => ({
                ...keyframe(f),
                angle: (f.frame as ISAFrameAngle).angle,
            }));
        }
        if (bone.scaling) {
            timelines.scale = bone.scaling.frames.map(f => ({
                ...keyframe(f),
                x: (f.frame as ISAFrameVertex).vertex.x,
                y: (f.frame as ISAFrameVertex).vertex.y,
            }));
        }
        if (bone.translation) {
            timelines.translate = bone.translation.frames.map(f => ({
                ...keyframe(f),
                x: (f.frame as ISAFrameVertex).vertex.x,
                y: (f.frame as ISAFrameVertex).vertex.y,
            }));
        }

        if (timelines.rotate || timelines.scale || timelines.translate) {
            anim.bones[bone.name] = timelines;
        }
    }

    for (const slot of isa.slots) {
        const timelines: SkeletonAnimationSlotTimelines = {};
        if (slot.attachment) {
            timelines.attachment = slot.attachment.frames.map(f => {
                const frame = f.frame as ISAFrameAttachment;
                let name: string | null = null;
                if (frame.name.length > 0) {
                    name = frame.name;
                    if (skeleton.__attachments[name]) {
                        skeleton.skins[0].attachments[slot.name][name] = skeleton.__attachments[name];
                        delete skeleton.__attachments[name];
                    }
                }
                return {
                    ...keyframe(f),
                    name,
                };
            });
        }
        if (slot.tint) {
            timelines.color = slot.tint.frames.map(f => ({
                ...keyframe(f),
                color: rgba((f.frame as ISAFrameColor).color),
            }));
        }

        if (timelines.attachment || timelines.color) {
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
            s[slot.skinName][mesh.name] = mesh.deformation.frames.map(f => ({
                ...keyframe(f),
                offset: 0,
                vertices: ([] as number[]).concat(...(f.frame as ISAFramePoints).points.map(v => [v.x, v.y]))
            }));
        }
    }
}