#!/usr/bin/env node
// Derives art/style-bible.json, the JSON bible Assetgrove's generate-sheet and import read, from the
// Markdown bible art/style-bible.md, the one statement of Raccoon World's art direction. The Markdown
// bible is parsed and validated by the pinned Assetgrove's own bible reader.
//
// Usage: node art/tools/derive-bible.mjs           write art/style-bible.json
//        node art/tools/derive-bible.mjs --check   exit 1 when the committed copy differs
// ASSETGROVE_DIR names the pinned checkout (default .assetgrove-src; bash scripts/assetgrove.sh fetch).
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const MARKDOWN = join(root, "art/style-bible.md");
export const DERIVED = join(root, "art/style-bible.json");

export async function deriveBible(assetgroveDir) {
  const { loadBible, biblePalette } = await import(
    pathToFileURL(join(assetgroveDir, "src/bible.ts")).href
  );
  const { data } = await loadBible(MARKDOWN);
  for (const field of ["perspective", "perspectiveDescription", "subjects"])
    if (data[field] === undefined) throw new Error(`art/style-bible.md: front matter needs ${field}`);
  const derived = {
    $comment: "Derived from art/style-bible.md by art/tools/derive-bible.mjs; do not edit by hand.",
    version: data.version,
    palette: biblePalette(data),
    references: data.anchors.positive
      .filter((anchor) => anchor.path !== data.perspective)
      .map(({ path, role, subject, look }) => ({ path, role, ...(subject && { subject }), ...(look && { look }) })),
    perspective: data.perspective,
    perspectiveDescription: data.perspectiveDescription,
    subjects: data.subjects,
    mood: data.tone.moodRange,
    notes: [
      // The world-level rendering word stays out of the shared notes when looks set it per domain.
      data.looks ? `realism: ${data.axes.realism}` : `rendering: ${data.axes.rendering}; ${data.axes.realism}`,
      `shading: ${data.axes.shading}; outline: ${data.axes.outline.weight}`,
      `lighting: ${data.axes.lightingKey}`,
      `colour: ${data.colorRule} colour, soft alpha; never pixel art`,
      ...data.tone.contentLimits,
    ],
    // A spec whose `look` names one of these gets its notes too; the axes a look overrides are listed there.
    looks: Object.fromEntries(
      Object.entries(data.looks ?? {}).map(([name, look]) => [
        name,
        {
          notes: [
            ...(look.rendering ? [`rendering: ${look.rendering}; ${look.realism ?? data.axes.realism}`] : look.realism ? [`realism: ${look.realism}`] : []),
            `texture: ${look.texture ?? data.axes.texture}`,
            `detail: ${look.detailDensity ?? data.axes.detailDensity}`,
          ],
        },
      ]),
    ),
  };
  return `${JSON.stringify(derived, null, 2)}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const assetgroveDir = resolve(process.env.ASSETGROVE_DIR ?? join(root, ".assetgrove-src"));
  const fresh = await deriveBible(assetgroveDir);
  if (process.argv.includes("--check")) {
    const committed = await readFile(DERIVED, "utf8").catch(() => "");
    if (committed !== fresh) {
      console.error(
        "art/style-bible.json differs from art/style-bible.md; run node art/tools/derive-bible.mjs and commit both",
      );
      process.exitCode = 1;
    } else console.log("art/style-bible.json matches art/style-bible.md");
  } else {
    await writeFile(DERIVED, fresh);
    console.log("wrote art/style-bible.json");
  }
}
