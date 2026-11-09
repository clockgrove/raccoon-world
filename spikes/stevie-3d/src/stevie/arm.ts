// The contract between the comparison page (page.ts) and each arm module. Every arm draws its characters as
// world-supplied scene content of Clockgrove's product renderer (RendererContent, clockgrove#112): only lit
// MeshStandardNodeMaterial / MeshLambertNodeMaterial meshes, groups and bones, placed with `context.place`.
// The page builds ONE RendererContent holding every arm and shows one arm at a time (root.visible), so a run
// makes one renderer and one WebGL/WebGPU context for the whole page (see the #77 WSL failure in the report).
import type { RendererContentContext } from "clockgrove-pin/apps/web/src/renderer-content.js";

export type Heading = "three-quarter" | "right" | "back" | "left" | "front";
export const HEADINGS: readonly Heading[] = ["three-quarter", "right", "back", "left", "front"];
/**
 * Character headings as a yaw in radians about the character's up axis, 0 = facing screen-right
 * ("right"), positive turns the face towards the viewer: three-quarter faces down-right towards the camera,
 * front faces the camera, left faces screen-left, back faces away.
 */
export const HEADING_YAW: Readonly<Record<Heading, number>> = {
  right: 0,
  "three-quarter": Math.PI / 4,
  front: Math.PI / 2,
  left: Math.PI,
  back: -Math.PI / 2,
};
export type Role = "stevie" | "juniper" | "kit";
/** Juniper: a warm recolour of Stevie; the kit: Stevie at 0.6 scale (as in clockgrove#77). */
export const JUNIPER_TINT = [1.25, 0.95, 0.75] as const;
export const KIT_SCALE = 0.6;
/**
 * Stevie's standing height in content units (`context.place` scales 1 unit to 12.5 px at zoom 1): the
 * yard's reviewed Stevie sprite body is 22 px tall at zoom 1, so every arm draws him 22 / 12.5 units tall.
 */
export const STEVIE_HEIGHT = 22 / 12.5;
/**
 * The camera looks at the yard from above at this elevation (the yard's 2:1 isometric projection: the
 * ground's y axis is foreshortened by half, so sin(elevation) = 0.5). 3D arms tilt their model by it so the
 * model is seen from the same angle as the painted yard.
 */
export const CAMERA_ELEVATION = Math.asin(0.5);

export interface Figure {
  readonly role: Role;
  readonly heading: Heading;
  readonly clip: "idle" | "walk";
  /** 0..1 of the clip. */
  readonly phase: number;
  /** Yard position in metres (the pack's frame), as `context.place` takes it. */
  readonly at: { readonly x: number; readonly y: number };
}

export interface HeadingSource {
  /** True when the arm's sources draw this heading; false when the nearest drawn view stands in. */
  readonly drawn: boolean;
  /** What is shown, e.g. "drawn", "mirror of right", "nearest drawn view: right". */
  readonly shown: string;
}

export interface SourceBudget {
  /** One line on the source resolution, e.g. "192 px cells, 6 idle + 8 walk frames, 1 direction". */
  readonly resolution: string;
  /** Texture bytes the arm uploads for Stevie (uncompressed RGBA unless stated). */
  readonly textureBytes: number;
  /** Source pixels per metre of character height at which the arm's textures are authored or baked. */
  readonly sourcePxPerUnit: number;
}

export interface ArmInstance {
  /** Added to the content root by the page; hidden when another arm is shown. */
  readonly root: import("clockgrove-pin/apps/web/src/renderer-content.js").THREE.Group;
  /** Place and pose these figures (and hide any others). Called before every shot. */
  show(figures: readonly Figure[]): void;
  headingSource(heading: Heading): HeadingSource;
  /** Preparation step times in ms (load, fit, bake, cut ...), measured. */
  readonly stepMs: Record<string, number>;
  readonly budget: SourceBudget;
  /** Lines the report prints about this arm (materials, sources, what is mirrored ...). */
  readonly notes: readonly string[];
  /** Textures created outside material slots (registered with the renderer for accounting). */
  readonly textures?: readonly unknown[];
  dispose?(): void;
}

export interface Arm {
  /** `3d`, `3d-sprites`, `2d`, `route:<name>`, or `stub`. */
  readonly name: string;
  readonly label: string;
  /** Licence of every image that shows this arm. */
  readonly licence: "MIT" | "CC-BY-4.0";
  /** The credit the licence needs, e.g. "3D model generated with Meshy (meshy.ai)". */
  readonly credit?: string;
  /** The repository files this arm reads (served by the runner under /repo/<path>). */
  readonly inputs: readonly string[];
  create(context: RendererContentContext): Promise<ArmInstance>;
}
