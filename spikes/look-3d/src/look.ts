// The one camera, one material model and one edge of the 3D look proof (issue 26). Everything in the slice,
// Stevie and every prop, is built in yard metres (x east, y north, z up) and drawn through these.
import { THREE, TSL } from "@pin/apps/web/src/renderer-content.ts";

export type ViewName = "whole" | "yard" | "close";
export interface View {
  readonly label: string;
  /** Screen pixels per yard metre at DPR 1 (the product camera's 12.5 px/m times the magnification). */
  readonly pxPerMetre: number;
  /** The yard point (x, y, z metres) at the canvas centre. */
  readonly focus: readonly [number, number, number];
}

/** Where Stevie stands, in yard metres. */
export const STEVIE_AT = [3.3, 2.7] as const;
/** Stevie's height (the #77 ship form's 0.53 m). */
export const STEVIE_HEIGHT = 0.53;

/**
 * The zoom test. The pinned renderer's camera is 12.5 px/m with zoom clamped to 0.75–2, so these views magnify
 * the whole slice uniformly about `focus` instead (camera at zoom 1); see docs/design/3d-look-proof.md.
 * Decisions: whole fits the slice in 640×400; yard puts Stevie at about 12% of the frame height, as in the
 * mockup; close puts him at a third of the frame height (0.53 m × 250 px/m = 132 px of 400).
 */
export const VIEWS: Readonly<Record<ViewName, View>> = {
  whole: { label: "the whole slice (28 px/m)", pxPerMetre: 28, focus: [0.35, 5.75, 0] },
  yard: { label: "the default yard view (90 px/m, Stevie about 12% of the frame height)", pxPerMetre: 90, focus: [3.2, 4.0, 0.4] },
  close: {
    label: "the close-up (250 px/m, Stevie about a third of the frame height)",
    pxPerMetre: 250,
    focus: [STEVIE_AT[0], STEVIE_AT[1], STEVIE_HEIGHT / 2],
  },
};

/** The five on-screen headings, as yaw about z from east (the yard's +x). */
export const HEADINGS: readonly string[] = ["three-quarter", "right", "back", "left", "front"];
export const HEADING_YAW: Readonly<Record<string, number>> = {
  // Facing east: down-right on screen, three-quarter towards the viewer.
  "three-quarter": 0,
  // North-east: screen right.
  right: Math.PI / 4,
  // North-west: away from the viewer.
  back: (3 * Math.PI) / 4,
  // South-west: screen left.
  left: (5 * Math.PI) / 4,
  // South-east: towards the viewer.
  front: (7 * Math.PI) / 4,
};

/**
 * The renderer's content projection extended to height: `place` maps a frame point to screen X = x + y and
 * Y = (y − x) / 2 + elevation in metres, with depth (x − y) + elevation / 2 (scaled by 0.01 at the anchor).
 * This matrix applies the same map inside one anchor, so all content shares the product camera and depth key.
 */
export function projection(view: View): InstanceType<typeof THREE.Matrix4> {
  const m = view.pxPerMetre / 12.5;
  const [fx, fy, fz] = view.focus;
  const l = new THREE.Matrix4().set(1, 1, 0, 0, -0.5, 0.5, 1, 0, 1, -1, 0.5, 0, 0, 0, 0, 1);
  return l.multiply(new THREE.Matrix4().makeScale(m, m, m)).multiply(new THREE.Matrix4().makeTranslation(-fx, -fy, -fz));
}

/** Canvas pixel (640×400 at DPR 1, camera centred at zoom 1) of a yard point in `view`. */
export function toCanvas(view: View, point: readonly [number, number, number]): [number, number] {
  const local = new THREE.Vector3(...point).applyMatrix4(projection(view));
  return [Math.round(320 + local.x * 12.5), Math.round(200 - local.y * 12.5)];
}

/**
 * Yard axes → the isometric view's axes (rows: screen right, screen up, towards the viewer). The anchor's
 * 0.01 depth scale would tip every transformed normal towards the camera and flatten the shading, so each
 * material supplies its own view-space normal (`normalNode`) from this rotation instead.
 */
const VIEW_ROTATION = new THREE.Matrix3().set(
  Math.SQRT1_2, Math.SQRT1_2, 0,
  -1 / Math.sqrt(6), 1 / Math.sqrt(6), 2 / Math.sqrt(6),
  1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3),
);

/** A normal rotation uniform for objects turned by `yaw` about z (props: 0). */
export function normalRotation(yaw = 0) {
  const node = TSL.uniform(new THREE.Matrix3());
  setYaw(node, yaw);
  return node;
}
export function setYaw(node: ReturnType<typeof TSL.uniform>, yaw: number): void {
  const turn = new THREE.Matrix3().set(Math.cos(yaw), -Math.sin(yaw), 0, Math.sin(yaw), Math.cos(yaw), 0, 0, 0, 1);
  (node.value as InstanceType<typeof THREE.Matrix3>).multiplyMatrices(VIEW_ROTATION, turn);
}

/** Edge width in screen pixels for every outline in the slice (consistent edges); converted per view. */
export const EDGE_PX = 1.25;
export const edgeMetres = TSL.uniform(EDGE_PX / VIEWS.yard.pxPerMetre);
export const OUTLINE_COLOUR = 0x1c1410;

/**
 * The storybook grade applied to every albedo before the product lights: a little more saturation and a warm
 * shift towards the mockup's palette. It is an albedo choice, not a second lighting model or post pass.
 */
// biome-ignore lint/suspicious/noExplicitAny: TSL node types are structural and too deep to spell here.
export function storybook(albedo: any) {
  const luma = TSL.dot(albedo, TSL.vec3(0.2126, 0.7152, 0.0722));
  return TSL.mix(TSL.vec3(luma), albedo, 1.15).mul(TSL.vec3(1.04, 1.0, 0.93)).clamp(0, 1);
}

export interface SurfaceOptions {
  /** `map`: a texture's colour; `vertex`: the geometry's colour attribute; else a flat colour. */
  readonly map?: InstanceType<typeof THREE.Texture>;
  readonly vertex?: boolean;
  readonly color?: number;
  readonly roughness?: number;
  readonly emissive?: number;
  readonly emissiveIntensity?: number;
  // biome-ignore lint/suspicious/noExplicitAny: a uniform node from normalRotation.
  readonly normal?: any;
  readonly transparent?: boolean;
  readonly opacity?: number;
}

const PROP_NORMAL = normalRotation(0);

/** The slice's one lit material: Standard (Lambert at the low tier, by the renderer), storybook albedo, view normal. */
export function surface(options: SurfaceOptions = {}): InstanceType<typeof THREE.MeshStandardNodeMaterial> {
  const material = new THREE.MeshStandardNodeMaterial({
    color: options.color ?? 0xffffff,
    roughness: options.roughness ?? 0.85,
    metalness: 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  });
  const albedo = options.map
    ? TSL.texture(options.map).rgb
    : options.vertex
      ? TSL.attribute("color", "vec3")
      : TSL.color(new THREE.Color(options.color ?? 0xffffff));
  material.colorNode = storybook(albedo);
  material.normalNode = (options.normal ?? PROP_NORMAL).mul(TSL.normalLocal).toVarying("v_lookNormal").normalize();
  if (options.emissive !== undefined) {
    material.emissive = new THREE.Color(options.emissive);
    material.emissiveIntensity = options.emissiveIntensity ?? 0.45;
  }
  return material;
}

/**
 * The inverted-hull outline: back faces pushed out along `direction` (a per-vertex attribute for props, the
 * skinned normal for Stevie) by the shared screen-constant width, in the outline colour.
 */
export function outline(direction: "hull" | "normal" = "hull"): InstanceType<typeof THREE.MeshStandardNodeMaterial> {
  const material = new THREE.MeshStandardNodeMaterial({ color: OUTLINE_COLOUR, roughness: 1, metalness: 0 });
  material.side = THREE.BackSide;
  const push = direction === "hull" ? TSL.attribute("hull", "vec3") : TSL.normalLocal;
  material.positionNode = TSL.positionLocal.add(push.mul(edgeMetres));
  return material;
}

/** Applies a view: the edge width in yard metres for its pixel scale. */
export function applyEdge(view: View): void {
  edgeMetres.value = EDGE_PX / view.pxPerMetre;
}

/** The warm source colour and emissive bound of the product renderer's own lantern and window lights. */
export const WARM = 0xffb966;
/** Night per the product renderer: before 06:00 or from 18:00 of the 86 400 000 ms day. */
export function isNight(simulationTime: bigint): boolean {
  const ms = Number(simulationTime % 86_400_000n);
  return ms < 21_600_000 || ms >= 64_800_000;
}
/** Dusk for the slice's own lamps: from 17:00 until 06:00 the porch lamp and window are lit. */
export function lampsLit(simulationTime: bigint): boolean {
  const ms = Number(simulationTime % 86_400_000n);
  return ms < 21_600_000 || ms >= 61_200_000;
}
