export interface SpineSkeletonSet {
    [name: string]: SpineSkeleton;
}

export interface SpineSkeleton {
    skeleton: SkeletonMeta;
    bones: SkeletonBone[];
    slots: SkeletonSlot[];
    skins: SkeletonSkin[];
    animations: SkeletonAnimations;
    __attachments: Record<string, SkeletonAttachment>;
}

export interface SkeletonMeta {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}

export interface SkeletonBone {
    name: string;
    parent?: string;
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    shearX: number;
    shearY: number;
    transform?: "normal" | "onlyTranslation" | "noRotationOrReflection" | "noScale" | "noScaleOrReflection";
}

export interface SkeletonSlot {
    name: string;
    bone: string;
    color?: string;
    attachment: string;
    blend: "normal" | "additive" | "multiply" | "screen";
}

export interface SkeletonSkin {
    name: string;
    attachments: SkeletonSkinAttachments;
}

export interface SkeletonSkinAttachments {
    [slotName: string]: SkeletonSkinSlotAttachments;
}
export interface SkeletonSkinSlotAttachments {
    [attachmentName: string]: SkeletonAttachment;
}

export interface SkeletonAttachmentBase {
    name: string;
    type: "region" | "mesh";
}
export type SkeletonAttachment = SkeletonAttachmentRegion | SkeletonAttachmentMesh;

export interface SkeletonAttachmentRegion extends SkeletonAttachmentBase {
    type: "region";
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    width: number;
    height: number;
}
export interface SkeletonAttachmentMesh extends SkeletonAttachmentBase {
    type: "mesh";
    uvs: number[];
    triangles: number[];
    vertices: number[];
}

export interface SkeletonAnimations {
    [name: string]: SkeletonAnimation;
}

export interface SkeletonAnimation {
    bones: SkeletonAnimationBones;
    slots: SkeletonAnimationSlots;
    deform: SkeletonAnimationDeforms;
}

export interface SkeletonAnimationBones {
    [name: string]: SkeletonAnimationBoneTimelines;
}

export type SkeletonAnimationBoneTimelineType = "rotate" | "translate" | "scale" | "shear";
export type SkeletonAnimationBoneTimelines = {
    [type in SkeletonAnimationBoneTimelineType]?: SkeletonAnimationBoneKeyframe[];
}
export interface SkeletonAnimationBoneKeyframe {
    time: number;
    curve?: "stepped" | number;
    c2?: number;
    c3?: number;
    c4?: number;
    angle?: number;
    x?: number;
    y?: number;
}

export interface SkeletonAnimationSlots {
    [name: string]: SkeletonAnimationSlotTimelines;
}

export type SkeletonAnimationSlotTimelineType = "attachment" | "color";
export type SkeletonAnimationSlotTimelines = {
    [type in SkeletonAnimationSlotTimelineType]?: SkeletonAnimationSlotKeyframe[];
}
export interface SkeletonAnimationSlotKeyframe {
    time: number;
    curve?: "stepped" | number;
    c2?: number;
    c3?: number;
    c4?: number;
    name?: string | null;
    color?: string;
}

export interface SkeletonAnimationDeforms {
    [skinName: string]: SkeletonAnimationSkinDeforms;
}
export interface SkeletonAnimationSkinDeforms {
    [slotName: string]: SkeletonAnimationSlotDeforms;
}
export interface SkeletonAnimationSlotDeforms {
    [meshName: string]: SkeletonAnimationMeshDeformKeyframe[];
}

export interface SkeletonAnimationMeshDeformKeyframe {
    time: number;
    offset: number;
    vertices: number[];
    curve?: "stepped" | number;
    c2?: number;
    c3?: number;
    c4?: number;
}