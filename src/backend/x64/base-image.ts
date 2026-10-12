import type {
    NativeProgram,
    NamedFragment,
    UnwindFunction,
} from "../machine/model.js";

/**
 * Runtime and prelude code are identical for equal options: generate them
 * once. `serial` is the assembler label serial after generation; a restored
 * image reserves it so later labels cannot collide with the image's.
 */
export interface BaseImage {
    fragments: NamedFragment[];
    functions: UnwindFunction[];
    imports: NativeProgram["imports"];
    literals: Map<string, string>;
    serial: number;
}
/** A store for base images that outlives the process (see src/cache.ts). Keys are option fingerprints. */
export interface BaseImageCache {
    get(key: string): BaseImage | undefined;
    set(key: string, image: BaseImage): void;
}
export const baseImages = new Map<string, BaseImage>();
