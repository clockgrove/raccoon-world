// Which clip of a rigged file is its idle. No imports, so it loads in plain Node as well as in the page.

interface TrackLike {
  values: ArrayLike<number>;
  times: ArrayLike<number>;
}

export interface ClipLike {
  name: string;
  userData?: Record<string, unknown>;
  tracks: TrackLike[];
}

const IDLE_NAME = /(^|[^a-z])idle([^a-z]|$)/iu;

/** The file declares the clip an idle (glTF animation extras, copied to userData) or labels it so by name. */
export function declaresIdle(clip: ClipLike): boolean {
  const extras = clip.userData;
  return extras?.role === "idle" || extras?.idle === true || IDLE_NAME.test(clip.name);
}

/** Some track has two keyframes whose values differ by more than epsilon in some component. */
export function moves(clip: ClipLike, epsilon = 1e-4): boolean {
  return clip.tracks.some(({ values, times }) => {
    const size = times.length ? values.length / times.length : 0;
    for (let key = 1; key < times.length; key += 1) {
      for (let c = 0; c < size; c += 1) {
        if (Math.abs(values[key * size + c]! - values[c]!) > epsilon) return true;
      }
    }
    return false;
  });
}

export function pickIdle<T extends ClipLike>(clips: readonly T[]): T | null {
  return clips.find((clip) => declaresIdle(clip) && moves(clip)) ?? null;
}
