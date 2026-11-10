// The one camera, one set of lighting states and the mockup anchors of the 3D visual ceiling (issue 34).
// Everything is built in yard metres (x east, y north, z up), as in the 3D look proof, so Stevie's #77 rig fits.
import * as THREE from "three/webgpu";

/** The mockup's size in pixels (docs/design/reference/raccoon-world-reference.png). */
export const MOCKUP = { width: 1672, height: 941 } as const;
/** The camera's vertical extent at zoom 1, in metres: Stevie (0.53 m) lands at the mockup's size. */
export const FRAME_HEIGHT_M = 5.1;
/** The camera's heading (degrees from east) and elevation: a fixed three-quarter isometric view, no rotation. */
export const AZIMUTH_DEG = 54;
export const ELEVATION_DEG = 42;

const deg = (d: number) => (d * Math.PI) / 180;
/** Unit vector from the camera towards the scene. */
export const LOOK = new THREE.Vector3(
  Math.cos(deg(AZIMUTH_DEG)) * Math.cos(deg(ELEVATION_DEG)),
  Math.sin(deg(AZIMUTH_DEG)) * Math.cos(deg(ELEVATION_DEG)),
  -Math.sin(deg(ELEVATION_DEG)),
);
const RIGHT = new THREE.Vector3().crossVectors(LOOK, new THREE.Vector3(0, 0, 1)).normalize();
const UP = new THREE.Vector3().crossVectors(RIGHT, LOOK).normalize();

/**
 * The ground point (or the point at height z) under a mockup pixel, seen through the hero camera. The set is
 * laid out by these anchors, so each prop lands where the mockup paints it whatever the camera's foreshortening.
 */
export function anchor(px: number, py: number, z = 0): THREE.Vector3 {
  const halfH = FRAME_HEIGHT_M / 2;
  const halfW = (halfH * MOCKUP.width) / MOCKUP.height;
  const sx = (px / MOCKUP.width) * 2 * halfW - halfW;
  const sy = halfH - (py / MOCKUP.height) * 2 * halfH;
  const base = RIGHT.clone().multiplyScalar(sx).add(UP.clone().multiplyScalar(sy));
  const t = (z - base.z) / LOOK.z;
  return base.add(LOOK.clone().multiplyScalar(t));
}

export type ViewName = "hero" | "close";
export interface ViewSpec {
  readonly label: string;
  /** Orthographic zoom (1 = the mockup's framing). */
  readonly zoom: number;
  /** The yard point at the frame centre. */
  readonly focus: () => THREE.Vector3;
}

/** Where Stevie stands: the mockup's Stevie, under the "Stevie" name tag. */
export const STEVIE_PIXEL = [600, 560] as const;

export const VIEWS: Readonly<Record<ViewName, ViewSpec>> = {
  hero: { label: "the mockup's main frame", zoom: 1, focus: () => anchor(MOCKUP.width / 2, MOCKUP.height / 2) },
  close: {
    label: "close-up, Stevie about a third of the frame height",
    zoom: 3.3,
    focus: () => anchor(STEVIE_PIXEL[0] - 10, STEVIE_PIXEL[1] - 40, 0.22),
  },
};

export function placeCamera(camera: THREE.OrthographicCamera, view: ViewSpec, aspect: number): void {
  const halfH = FRAME_HEIGHT_M / 2;
  camera.left = -halfH * aspect;
  camera.right = halfH * aspect;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.near = 0.1;
  camera.far = 80;
  camera.zoom = view.zoom;
  camera.up.set(0, 0, 1);
  const focus = view.focus();
  camera.position.copy(focus).addScaledVector(LOOK, -30);
  camera.lookAt(focus);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

export type StateName = "hero" | "dusk" | "night";

/** One lighting model, three times of day: every value below feeds the same lights, fog and grade. */
export interface LightState {
  readonly label: string;
  readonly clock: string;
  readonly sky: number;
  readonly ground: number;
  readonly hemi: number;
  readonly key: number;
  readonly keyIntensity: number;
  /** Key light direction (towards the light), yard axes. */
  readonly keyFrom: readonly [number, number, number];
  readonly fill: number;
  readonly fillIntensity: number;
  readonly fog: number;
  readonly fogNear: number;
  readonly fogFar: number;
  /** Multiplier on every lamp and window light. */
  readonly lamps: number;
  readonly exposure: number;
  /** Grade: shadows tint, highlights tint, saturation, contrast. */
  readonly lift: readonly [number, number, number];
  readonly gain: readonly [number, number, number];
  readonly saturation: number;
  readonly contrast: number;
  readonly rain: number;
}

export const STATES: Readonly<Record<StateName, LightState>> = {
  hero: {
    label: "4:37 PM in rain (the mockup's time)",
    clock: "16:37",
    sky: 0xa3bcb8,
    ground: 0x3a3a22,
    hemi: 1.1,
    key: 0xffd0a0,
    keyIntensity: 1.5,
    keyFrom: [-0.55, 0.45, 0.62],
    fill: 0x7fa3b8,
    fillIntensity: 0.35,
    fog: 0x5b5a46,
    fogNear: 24,
    fogFar: 52,
    lamps: 1,
    exposure: 1.25,
    lift: [0.015, 0.03, 0.03],
    gain: [1.08, 1.0, 0.86],
    saturation: 1.12,
    contrast: 1.1,
    rain: 1,
  },
  dusk: {
    label: "dusk in rain (18:00)",
    clock: "18:00",
    sky: 0x5b6f86,
    ground: 0x22261c,
    hemi: 0.7,
    key: 0xff9a6a,
    keyIntensity: 0.55,
    keyFrom: [-0.8, 0.35, 0.3],
    fill: 0x6278a0,
    fillIntensity: 0.4,
    fog: 0x343c48,
    fogNear: 22,
    fogFar: 50,
    lamps: 1.25,
    exposure: 1.05,
    lift: [0.01, 0.02, 0.05],
    gain: [1.05, 0.98, 0.92],
    saturation: 1.05,
    contrast: 1.12,
    rain: 1,
  },
  night: {
    label: "night in rain (22:00)",
    clock: "22:00",
    sky: 0x23324e,
    ground: 0x0d1012,
    hemi: 0.75,
    key: 0x8fa8d8,
    keyIntensity: 0.55,
    keyFrom: [0.3, 0.6, 0.75],
    fill: 0x30406a,
    fillIntensity: 0.25,
    fog: 0x141c28,
    fogNear: 20,
    fogFar: 48,
    lamps: 1.5,
    exposure: 1.1,
    lift: [0.005, 0.012, 0.035],
    gain: [1.02, 0.98, 0.95],
    saturation: 1.0,
    contrast: 1.15,
    rain: 1,
  },
};

/** The lamps' warm source colour (as the product renderer's lamps, 0xffb966). */
export const WARM = 0xffb070;
