export interface SpineAtlas {
    images: AtlasImage[];
}

export interface AtlasImage {
    name: string;
    data: Buffer;
    width: number;
    height: number;
    regions: AtlasRegion[];
}

export interface AtlasRegion {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export const SpineAtlas = {
    export(atlas: SpineAtlas): Buffer {
        const lines: string[] = [];
        for (const image of atlas.images) {
            lines.push(image.name);
            lines.push(`size: ${image.width}, ${image.height}`);
            lines.push("format: RGBA8888");
            lines.push("filter: Linear, Linear");
            lines.push("repeat: none");
            for (const region of image.regions) {
                lines.push(region.name);
                lines.push("  rotate: false");
                lines.push(`  bounds: ${region.x}, ${region.y}, ${region.width}, ${region.height}`);
                lines.push(`  offsets: 0, 0, ${region.width}, ${region.height}`);
                lines.push("  index: -1");
            }
            lines.push("");
        }
        return Buffer.from(lines.join("\n"));
    }
}