// Composition root of the 3D look proof (issue 26): the pinned Clockgrove product renderer, one committed
// snapshot with no projected entities, and the yard slice as world content (renderer content v1).
// `globalThis.look3d` is the capture and journey surface used by scripts/look.mjs; it changes only a copy
// of the visual inputs and never issues a world command.
import { decodeSceneProjection } from "@pin/packages/contracts/src/index.ts";
import { type QualityTier, ThreeWorldSceneAdapter } from "@pin/apps/web/src/renderer.ts";
import { HEADINGS, VIEWS, type ViewName } from "./look.ts";
import { type StevieClip, yardContent } from "./content.ts";
import committed from "../snapshot.json";

const parent = document.querySelector<HTMLElement>("#scene") as HTMLElement;
const status = document.querySelector<HTMLElement>("#status") as HTMLElement;
const params = new URLSearchParams(location.search);
const reports: unknown[] = [];
let snapshot = decodeSceneProjection(committed);
const initialView = (params.get("view") ?? "yard") as ViewName;
const slice = params.get("content") === "none" ? undefined : yardContent(VIEWS[initialView] ? initialView : "yard");

const adapter = new ThreeWorldSceneAdapter(
  parent,
  () => {
    adapter.loadSnapshot(snapshot);
    adapter.setCamera({ x: 0, y: 0, zoom: 1 });
    status.textContent = "Scene ready";
    document.body.dataset.ready = "true";
  },
  () => {
    status.textContent = "Canvas unavailable";
    document.body.dataset.ready = "unavailable";
  },
  (point) => {
    reports.push(point);
    if (reports.length > 512) reports.shift();
  },
  slice?.content,
);

// biome-ignore lint/suspicious/noExplicitAny: diagnostic reads of the pinned renderer's private fields.
const internal = adapter as any;
const frames = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function rendererString(): string {
  const renderer = internal.renderer;
  if (!renderer) return "unknown";
  if (adapter.backend === "webgpu") {
    const info = renderer.backend?.device?.adapterInfo ?? {};
    return ["vendor", "architecture", "device", "description"]
      .map((key) => info[key])
      .filter(Boolean)
      .join(" / ");
  }
  const gl = renderer.getContext?.() as WebGL2RenderingContext | undefined;
  const debug = gl?.getExtension("WEBGL_debug_renderer_info");
  return gl && debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "unknown";
}

const api = {
  adapter,
  reports,
  views: VIEWS,
  headings: HEADINGS,
  get snapshot() {
    return snapshot;
  },
  /** Content state: `ready` once Stevie and every prop are built and attached. */
  status() {
    return {
      ready: document.body.dataset.ready === "true",
      backend: adapter.backend,
      contentStatus: adapter.metrics.contentStatus,
      contentFailure: adapter.metrics.contentFailure,
      qualityTier: internal.tier as QualityTier,
      objects: slice?.diagnostics.objects ?? [],
      stevie: slice?.diagnostics.stevie,
      lastFrame: slice?.diagnostics.lastFrame,
      view: slice?.diagnostics.view,
    };
  },
  setView(name: ViewName) {
    slice?.setView(name);
    adapter.setCamera({ x: 0, y: 0, zoom: 1 });
  },
  /** Clock (ms of the canonical day) and rain intensity, through a fresh snapshot like a committed load. */
  setEnvironment(timeMs: number, rainIntensity: number) {
    snapshot = { ...snapshot, simulationTime: BigInt(timeMs), weather: { rainIntensity } };
    adapter.loadSnapshot(snapshot);
    adapter.setCamera({ x: 0, y: 0, zoom: 1 });
  },
  setQuality(tier: QualityTier) {
    adapter.setQuality(tier);
  },
  /**
   * Capture only: sets `tier` and holds it. The renderer steps the tier down whenever p95 over 120 frames
   * exceeds its budget with content present, which a software GPU always triggers; pushing its frame counter
   * far back keeps that check from running, so a shot is taken at the tier it records. `null` releases it.
   */
  holdQuality(tier: QualityTier | null) {
    if (tier === null) {
      internal.framesSinceReport = 0;
      return;
    }
    if (internal.tier !== tier) adapter.setQuality(tier);
    internal.framesSinceReport = -1e9;
  },
  setReducedMotion(enabled: boolean) {
    adapter.setReducedMotion(enabled);
  },
  /** Stevie's clip and heading; `seconds` holds one clip time (for stills), `null` follows the renderer's clock. */
  setStevie(pose: { clip?: StevieClip; heading?: string; seconds?: number | null }) {
    slice?.setStevie(pose);
  },
  /** Hides the named content objects ([] shows all): the journey's proof that each one draws. */
  setHidden(names: string[]) {
    slice?.setHidden(names);
    internal.dirty = true;
  },
  /** Canvas pixel (640×400, DPR 1) of each named object's centre in the current view. */
  screenPoints(): Record<string, [number, number]> {
    return slice?.screenPoints() ?? {};
  },
  /** Renders one frame through the product post pass and returns the canvas as a PNG data URL. */
  async capture(): Promise<string> {
    await frames();
    internal.dirty = true;
    if (internal.composer) internal.composer.render();
    else internal.renderer.render(internal.scene, internal.camera);
    return internal.renderer.domElement.toDataURL("image/png");
  },
  rendererString,
  /** The adapter's own metrics, plus the browser's JS heap where it reports one. */
  metrics() {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } })
      .memory;
    return {
      ...adapter.metrics,
      frameMs: [...adapter.metrics.frameMs],
      jsHeapUsedBytes: memory?.usedJSHeapSize,
      jsHeapTotalBytes: memory?.totalJSHeapSize,
      devicePixelRatio: globalThis.devicePixelRatio,
      deviceMemoryGiB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      userAgent: navigator.userAgent,
    };
  },
  destroy() {
    adapter.destroy();
  },
};
(globalThis as unknown as { look3d: typeof api }).look3d = api;
globalThis.addEventListener("pagehide", () => adapter.destroy(), { once: true });
