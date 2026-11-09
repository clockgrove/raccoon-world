// The 3D look proof's world content (issue 26) for Clockgrove's renderer content v1 (clockgrove/clockgrove#112):
// Stevie and the yard corner under one anchor, drawn by the product renderer's own lights, fog, grade, bloom,
// rain and quality tiers. Content adds no light, camera or post pass (the seam rejects them).
import type { RendererContent, RendererContentFrame } from "@pin/apps/web/src/renderer-content.ts";
import { THREE } from "@pin/apps/web/src/renderer-content.ts";
import {
  applyEdge,
  isNight,
  lampsLit,
  projection,
  STEVIE_AT,
  STEVIE_HEIGHT,
  surface,
  toCanvas,
  VIEWS,
  type ViewName,
} from "./look.ts";
import { loadStevie, type Stevie, type StevieClip } from "./stevie.ts";
import { buildYard } from "./yard.ts";

export type { StevieClip };
// biome-ignore lint/suspicious/noExplicitAny: three objects owned by this content.
type Any = any;

export interface StevieState {
  clip: StevieClip;
  heading: string;
  /** A held clip time for stills; null follows the renderer's visual clock (zero under reduced motion). */
  seconds: number | null;
}

export function yardContent(initialView: ViewName) {
  const diagnostics = {
    ready: false,
    objects: [] as string[],
    view: initialView,
    stevie: undefined as (StevieState & { metrics?: Record<string, unknown> | undefined; shownSeconds?: number }) | undefined,
    lastFrame: undefined as RendererContentFrame | undefined,
    updates: 0,
  };
  const state: StevieState = { clip: "idle", heading: "three-quarter", seconds: null };
  let view = initialView;
  let inner: Any;
  let named: Record<string, Any> = {};
  let probes: Record<string, readonly [number, number, number]> = {};
  let stevie: Stevie | undefined;

  const setView = (name: ViewName) => {
    if (!VIEWS[name]) throw new Error(`unknown view ${name}`);
    view = name;
    diagnostics.view = name;
    applyEdge(VIEWS[name]);
    if (inner) {
      inner.matrix.copy(projection(VIEWS[name]));
      inner.matrixWorldNeedsUpdate = true;
    }
  };

  const content: RendererContent = {
    version: 1,
    async create(context) {
      const root = new THREE.Group();
      root.name = "look-3d";
      const anchor = new THREE.Group();
      context.place(anchor, { x: 0, y: 0 });
      inner = new THREE.Group();
      inner.name = "yard-metres";
      inner.matrixAutoUpdate = false;
      anchor.add(inner);
      root.add(anchor);

      const yard = buildYard();
      for (const group of Object.values(yard.props)) inner.add(group);
      stevie = await loadStevie(context, "/media/stevie.glb");
      context.signal.throwIfAborted();
      const spot = new THREE.Group();
      spot.name = "stevie";
      spot.position.set(STEVIE_AT[0], STEVIE_AT[1], 0);
      spot.add(stevie.root);
      // A soft contact shadow: the product draws footprints as ground ellipses, and content has no shadow maps.
      const shadowGeometry = new THREE.CircleGeometry(1, 24);
      shadowGeometry.scale(0.36, 0.2, 1);
      shadowGeometry.translate(0, 0, 0.02);
      const shadow = new THREE.Mesh(
        shadowGeometry,
        surface({ color: 0x000000, roughness: 1, transparent: true, opacity: 0.3 }),
      );
      shadow.name = "stevie-shadow";
      spot.add(shadow);
      inner.add(spot);
      named = { ...yard.props, stevie: spot };
      probes = { ...yard.probes, stevie: [STEVIE_AT[0], STEVIE_AT[1], STEVIE_HEIGHT * 0.55] };
      setView(view);
      diagnostics.objects = Object.keys(named);
      diagnostics.ready = true;
      let lastConditions = "";
      return {
        root,
        update(frame) {
          diagnostics.updates++;
          diagnostics.lastFrame = frame;
          const night = isNight(frame.simulationTime);
          const lit = lampsLit(frame.simulationTime);
          const conditions = `${frame.weather.rainIntensity}|${lit}|${night}|${frame.qualityTier}`;
          // Re-applied on every tier change too: the renderer replaces content materials between tiers.
          if (conditions !== lastConditions) {
            yard.setConditions(frame.weather.rainIntensity, lit, night);
            lastConditions = conditions;
          }
          const seconds = state.seconds ?? frame.timeMs / 1000;
          stevie?.pose(state.clip, state.heading, seconds);
          diagnostics.stevie = { ...state, shownSeconds: seconds, metrics: stevie?.metrics };
        },
        dispose() {
          stevie?.dispose();
        },
      };
    },
  };

  return {
    content,
    diagnostics,
    setView,
    setStevie(pose: Partial<StevieState>) {
      if (pose.clip) state.clip = pose.clip;
      if (pose.heading) state.heading = pose.heading;
      if (pose.seconds !== undefined) state.seconds = pose.seconds;
    },
    /** Hides the named objects ([] shows everything); the journey uses it to prove each one draws. */
    setHidden(names: readonly string[]) {
      for (const [name, object] of Object.entries(named)) object.visible = !names.includes(name);
      // Puddles also follow the weather; showing them again leaves that to the next conditions update.
      if (!names.includes("puddles") && named.puddles) named.puddles.visible = (diagnostics.lastFrame?.weather.rainIntensity ?? 0) > 0;
    },
    screenPoints(): Record<string, [number, number]> {
      return Object.fromEntries(Object.entries(probes).map(([name, at]) => [name, toCanvas(VIEWS[view], at)]));
    },
  };
}
