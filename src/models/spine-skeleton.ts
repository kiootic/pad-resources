export interface SpineSkeletonSet {
    [name: string]: SpineSkeleton;
}

export interface SpineSkeleton {
    skeleton: SkeletonMeta;
    bones: SkeletonBone[];
    slots: SkeletonSlot[];
    skins: SkeletonSkin[];
    ik: SkeletonIK[];
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
    length: number;
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

export interface SkeletonIK {
    name: string;
    order: number;
    bones: string[];
    target: string;
    mix: number;
    softness: number;
    bendPositive: boolean;
}

export interface SkeletonAnimations {
    [name: string]: SkeletonAnimation;
}

export interface SkeletonAnimation {
    bones: SkeletonAnimationBones;
    slots: SkeletonAnimationSlots;
    deform: SkeletonAnimationDeforms;
}

export type BeizerCurve = [number, number, number, number];

export type Curve1 = "stepped" | BeizerCurve;
export interface SkeletonAnimationKeyframeCurve1 {
    time: number;
    curve?: Curve1;
}

export type Curve2 = "stepped" | [...BeizerCurve, ...BeizerCurve];
export interface SkeletonAnimationKeyframeCurve2 {
    time: number;
    curve?: Curve2;
}

export type Curve4 = "stepped" | [...BeizerCurve, ...BeizerCurve, ...BeizerCurve, ...BeizerCurve];
export interface SkeletonAnimationKeyframeCurve4 {
    time: number;
    curve?: Curve4;
}

export interface SkeletonAnimationBones {
    [name: string]: SkeletonAnimationBoneTimelines;
}

export type SkeletonAnimationBoneTimelines = {
    rotate?: Array<SkeletonAnimationKeyframeCurve1 & { value: number }>;
    translate?: Array<SkeletonAnimationKeyframeCurve2 & { x: number, y: number }>;
    scale?: Array<SkeletonAnimationKeyframeCurve2 & { x: number, y: number }>;
    shear?: Array<SkeletonAnimationKeyframeCurve2 & { x: number, y: number }>;
}

export interface SkeletonAnimationSlots {
    [name: string]: SkeletonAnimationSlotTimelines;
}

export type SkeletonAnimationSlotTimelines = {
    attachment?: Array<SkeletonAnimationKeyframeCurve1 & { name: string | null }>;
    rgba?: Array<SkeletonAnimationKeyframeCurve4 & { color: string }>;
};

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
    curve?: "stepped" | [number, number, number, number];
}