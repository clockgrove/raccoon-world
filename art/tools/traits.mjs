// Checks a subject's one-line bible description against the identity traits the bible declares for it
// (identities.<name>.signatureFeatures in art/style-bible.md, read through Assetgrove's `bible describe`).
// Both the traits and the description are read into the same structured facts: for each body part, the
// qualities said of it ("lower body: lighter, greyer, longer, shaggier"), each word mapped to a quality with
// its synonyms and its opposite. The description is checked against those facts, not against wording:
//   - it carries every quality a declared trait gives each required part, so an accurate rewording passes
//     ("paler" for "lighter", "banded" for "ringed") and dropping or swapping a quality fails;
//   - it says no quality's opposite of a declared part ("darker ... than her back", "faint eye mask", "plain
//     tail") and negates no declared part or quality, whether the negation comes before the part ("no ringed
//     tail") or after it ("a tail that is not ringed"); a double negation ("never without") cancels.
// check.mjs runs it on Gracie's description (issue 142).

/** Body parts a trait or a description can name, each with the words that name it. */
export const PARTS = {
  "lower body": ["lower body", "belly", "flanks", "hindquarters", "underside", "legs"],
  back: ["back"],
  mask: ["mask"],
  brows: ["brows", "brow", "eyebrows"],
  muzzle: ["muzzle", "snout"],
  ears: ["ears", "ear"],
  tail: ["tail"],
  paws: ["paws", "paw", "palms", "feet", "foot", "hands"],
};

/** Qualities, each with the words that say it and its opposite quality. */
export const QUALITIES = {
  light: { words: ["light", "lighter", "pale", "paler", "cream", "creamy"], opposite: "dark" },
  dark: { words: ["dark", "darker", "black", "blackish"], opposite: "light" },
  grey: { words: ["grey", "greyer", "gray", "grayer", "greyish", "grizzled"] },
  long: { words: ["long", "longer"], opposite: "short" },
  short: { words: ["short", "shorter"], opposite: "long" },
  shaggy: { words: ["shaggy", "shaggier", "fluffy", "fluffier", "thick", "thicker"], opposite: "sleek" },
  sleek: { words: ["sleek", "sleeker", "smooth", "smoother", "thin", "thinner"], opposite: "shaggy" },
  full: { words: ["full", "complete", "solid"], opposite: "faint" },
  faint: { words: ["faint", "partial", "patchy", "broken", "faded"], opposite: "full" },
  rounded: { words: ["round", "rounded"], opposite: "pointed" },
  pointed: { words: ["pointed", "pointy"], opposite: "rounded" },
  ringed: { words: ["ringed", "banded", "bands", "rings", "ring", "striped", "stripes"], opposite: "plain" },
  plain: { words: ["plain", "unringed", "unbanded", "unstriped"], opposite: "ringed" },
  rimmed: { words: ["rimmed", "rims", "rim"] },
};

/** Words for a detail of a part (a tail's tip, a paw's palms): the qualities said just before one describe the detail, not the part. */
const DETAILS = ["tip", "tips", "palms", "soles", "bands", "rings", "rims", "stripes"];

/** Words that end a part's trailing qualities ("ears rimmed in pale fur" ends at "and a banded tail"; "mask with pale brows"). */
const BREAKS = ["a", "an", "the", "her", "his", "its", "their", "with", "and", "than", "on", "over"];

/**
 * Words that deny what follows them in the segment, or, at a segment's end, the part last named ("a ringed tail is
 * absent"). A word ending in "less" whose stem names a part or quality ("ringless", "tailless") negates it.
 */
const NEGATIONS = [
  "no", "not", "without", "never", "nor", "neither", "none", "nothing", "nowhere",
  "lack", "lacks", "lacked", "lacking", "missing", "absent", "gone", "devoid", "minus", "sans", "free",
  "lose", "loses", "lost", "losing", "shed", "sheds", "hardly", "barely", "scarcely", "less",
  "isn't", "aren't", "wasn't", "weren't", "doesn't", "don't", "didn't", "hasn't", "haven't", "hadn't", "can't", "cannot", "won't",
];

/** Words that open a relative clause about the part named just before them ("than her back, which is lighter"). */
const RELATIVES = ["which", "that", "who", "whose"];

const PART_OF = new Map(Object.entries(PARTS).flatMap(([part, words]) => words.map((w) => [w, part])));
const QUALITY_OF = new Map(Object.entries(QUALITIES).flatMap(([q, { words }]) => words.map((w) => [w, q])));

/** Clauses (split at ; and .), each a list of segments (split at , ( ) and "but"), each a list of tokens. */
function clauses(text) {
  return String(text).toLowerCase().replace(/[-_]/g, " ")
    .split(/[;.]/)
    .map((clause) => clause.split(/[,()]|\bbut\b/).map((s) => s.match(/[a-z']+/g) ?? []).filter((s) => s.length))
    .filter((c) => c.length);
}

/**
 * The structured facts a text states: `{ parts: Map<part, { qualities: Set, negated: Set, negatedPart: boolean }>, order: [part] }`.
 * A quality said before a part is carried across commas to the next part its clause names ("a pale, faint eye
 * mask", "pale-rimmed, rounded ears"), or, at "than" or the clause's end, to the clause's subject (so a list
 * "lighter, greyer and shaggier fur than her back" stays with its subject). A quality right after a part, before
 * any article, "with" or "and", is said of that part ("ears rimmed in pale fur", "a tail that is not ringed"), as
 * is a quality in a relative clause after it ("than her back, which is lighter"). A detail that is a quality
 * (rims, bands) is said of the part it follows ("ears with pale rims"). A part after "than" is a comparator,
 * across commas, and takes only the qualities between "than" and it. A negation applies to the next quality or
 * part in its segment, else to the part last named; two negations in a row cancel.
 */
export function factsOf(text) {
  const parts = new Map();
  const order = [];
  const entry = (part) => {
    if (!parts.has(part)) {
      parts.set(part, { qualities: new Set(), negated: new Set(), negatedPart: false });
      order.push(part);
    }
    return parts.get(part);
  };
  for (const clause of clauses(text)) {
    let current; // the clause's subject: the part last named outside a comparison
    let last; // the part last named, comparators included
    let comparator = false; // after "than", until the part it compares with
    let pending = []; // qualities said before their part: [{ quality, negated }]
    const flush = (part) => {
      if (part === undefined) return;
      const facts = entry(part);
      for (const { quality, negated } of pending) (negated ? facts.negated : facts.qualities).add(quality);
      pending = [];
    };
    for (const words of clause) {
      let negation = false;
      // the part just named, until a break word; a segment opening with "which" or "that" is about the part before it
      let trailing = RELATIVES.includes(words[0]) ? last : undefined;
      for (let i = 0; i < words.length; i++) {
        let word = words[i];
        if (BREAKS.includes(word)) trailing = undefined;
        if (word.endsWith("less") && word.length > 4) {
          const stem = word.slice(0, -4);
          if (PART_OF.has(stem) || QUALITY_OF.has(stem)) {
            negation = !negation;
            word = stem;
          }
        }
        const pair = i + 1 < words.length ? `${word} ${words[i + 1]}` : undefined;
        const part = (pair && PART_OF.get(pair)) ?? PART_OF.get(word);
        if (pair && PART_OF.has(pair)) i++;
        if (NEGATIONS.includes(word)) {
          negation = !negation;
          continue;
        }
        if (word === "than") {
          flush(current);
          comparator = true;
          continue;
        }
        if (DETAILS.includes(word)) {
          // The detail's own qualities are dropped; a detail that is itself a quality (bands, rims) is said of the
          // part it follows ("ears with pale rims"), else of the next part ("rimmed ears").
          pending = [];
          const quality = QUALITY_OF.get(word);
          const owner = trailing ?? current;
          if (quality && owner !== undefined) (negation ? entry(owner).negated : entry(owner).qualities).add(quality);
          else if (quality) pending.push({ quality, negated: negation });
          negation = false;
          continue;
        }
        if (part) {
          flush(part);
          if (negation) entry(part).negatedPart = true;
          negation = false;
          if (comparator) comparator = false;
          else current = part;
          trailing = part;
          last = part;
          continue;
        }
        const quality = QUALITY_OF.get(word);
        if (quality && trailing !== undefined) {
          const facts = entry(trailing);
          (negation ? facts.negated : facts.qualities).add(quality);
          negation = false;
        } else if (quality) {
          pending.push({ quality, negated: negation });
          negation = false;
        }
      }
      // A negation with nothing after it in its segment denies the part last named ("a ringed tail is absent").
      if (negation && (trailing ?? current) !== undefined) entry(trailing ?? current).negatedPart = true;
    }
    // Qualities still pending at the clause's end are said of its subject ("has lighter, greyer fur").
    flush(current);
  }
  return { parts, order };
}

/** The parts a piece of text names. */
export function partsIn(text) {
  return factsOf(text).order;
}

/**
 * Problems with a description against declared traits; empty means good.
 *   traits:   the identity lock's signatureFeatures, the first being the signature.
 *   required: the parts the description must name, each of which a declared trait must name.
 * The description leads with the signature: its first clause before ";" names every part the signature
 * names and carries every quality the signature gives them. It names every required part with every
 * quality the declared traits give it, says no opposite of a declared quality and negates no declared
 * part or quality.
 */
export function traitProblems(description, traits, required = []) {
  const problems = [];
  if (!Array.isArray(traits) || traits.length === 0 || traits.some((t) => typeof t !== "string"))
    return ["the identity lock declares no signatureFeatures"];
  const declared = new Map();
  for (const trait of traits)
    for (const [part, facts] of factsOf(trait).parts) {
      if (!declared.has(part)) declared.set(part, new Set());
      for (const quality of facts.qualities) declared.get(part).add(quality);
    }
  for (const part of required)
    if (!declared.has(part)) problems.push(`no declared trait names her ${part}`);

  const signature = factsOf(traits[0]).parts;
  const lead = factsOf(String(description).split(";")[0]).parts;
  if (signature.size === 0) problems.push(`the signature trait names no body part: ${traits[0]}`);
  else {
    const missing = [];
    for (const [part, facts] of signature) {
      if (!lead.has(part)) missing.push(part);
      else for (const quality of facts.qualities) if (!lead.get(part).qualities.has(quality)) missing.push(`${part} ${quality}`);
    }
    if (missing.length) problems.push(`the description does not lead with her signature (${traits[0]}): its first clause lacks ${missing.join(", ")}`);
  }

  const said = factsOf(String(description)).parts;
  for (const part of required) {
    if (!said.has(part)) {
      problems.push(`the description does not name her ${part}`);
      continue;
    }
    const lacking = [...(declared.get(part) ?? [])].filter((q) => !said.get(part).qualities.has(q));
    if (lacking.length) problems.push(`the description does not say her ${part} is ${lacking.join(", ")}, as a declared trait does`);
  }
  for (const [part, facts] of said) {
    const qualities = declared.get(part);
    if (!qualities) continue;
    if (facts.negatedPart) problems.push(`the description negates a declared trait: her ${part}`);
    for (const quality of facts.negated)
      if (qualities.has(quality)) problems.push(`the description negates a declared trait: her ${part} is not ${quality}`);
    for (const quality of facts.qualities) {
      const opposite = QUALITIES[quality].opposite;
      if (opposite && qualities.has(opposite) && !qualities.has(quality))
        problems.push(`the description negates a declared trait: her ${part} is ${quality}, not ${opposite}`);
    }
  }
  return problems;
}
