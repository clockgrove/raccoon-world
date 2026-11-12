// One glTF loader for the lab's web media (references/web-media): KTX2 textures transcoded to what this GPU supports
// (ASTC on phones, BC on desktops), and meshopt-compressed geometry. It reads uncompressed files just as well.
import type * as THREE from "three/webgpu";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/** Call after `await renderer.init()`: the transcoder picks its target format from the renderer's features. */
export function webMediaLoader(renderer: THREE.WebGPURenderer): GLTFLoader {
  const ktx2 = new KTX2Loader().setTranscoderPath(new URL("basis/", document.baseURI).href);
  // biome-ignore lint/suspicious/noExplicitAny: KTX2Loader's types predate WebGPURenderer.
  ktx2.detectSupport(renderer as any);
  return new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
}
