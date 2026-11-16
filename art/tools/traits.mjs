// Checks a subject's one-line bible description against the identity traits the bible declares for it
// (identities.<name>.signatureFeatures in art/style-bible.md, read through Assetgrove's `bible describe`).
// A trait is matched by the body parts it names, not by its wording, so an accurate rewording passes;
// a description that negates a part of a declared trait ("no eye mask", "without a ringed tail") fails.
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

const NEGATIONS = ["no", "not", "without", "never", "lacks", "lacking", "missing", "none", "nor", "isn't", "doesn't", "hasn't"];

const escape = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordsOf = (text) => text.toLowerCase().replace(/[-_]/g, " ");
const has = (text, word) => new RegExp(`(^|[^a-z])${escape(word)}([^a-z]|$)`).test(text);

/** The parts a piece of text names. */
export function partsIn(text) {
  const t = wordsOf(text);
  return Object.keys(PARTS).filter((part) => PARTS[part].some((word) => has(t, word)));
}

/** Clauses: split at ; , and "and", so a negation reaches only the part it is written against. */
function clauses(text) {
  return wordsOf(text).split(/[;,.()]|\band\b|\bwith\b|\bbut\b/).map((c) => c.trim()).filter(Boolean);
}

/** The parts the text negates: a negation word before the part's word in the same clause. */
export function negatedParts(text) {
  const negated = new Set();
  for (const clause of clauses(text)) {
    for (const [part, words] of Object.entries(PARTS))
      for (const word of words) {
        const at = clause.search(new RegExp(`(^|[^a-z])${escape(word)}([^a-z]|$)`));
        if (at < 0) continue;
        const before = clause.slice(0, at + 1);
        if (NEGATIONS.some((n) => has(before, n))) negated.add(part);
      }
  }
  return [...negated];
}

/**
 * Problems with a description against declared traits; empty means good.
 *   traits:   the identity lock's signatureFeatures, the first being the signature.
 *   required: the parts the description must name, each of which a declared trait must name.
 * The description leads with the signature: its first clause before ";" names every part the
 * signature names. It names every required part, and negates no part of any declared trait.
 */
export function traitProblems(description, traits, required = []) {
  const problems = [];
  if (!Array.isArray(traits) || traits.length === 0 || traits.some((t) => typeof t !== "string"))
    return ["the identity lock declares no signatureFeatures"];
  const declared = new Set(traits.flatMap(partsIn));
  for (const part of required)
    if (!declared.has(part)) problems.push(`no declared trait names her ${part}`);
  const signature = partsIn(traits[0]);
  const lead = partsIn(String(description).split(";")[0]);
  const missingLead = signature.filter((part) => !lead.includes(part));
  if (signature.length === 0) problems.push(`the signature trait names no body part: ${traits[0]}`);
  else if (missingLead.length) problems.push(`the description does not lead with her signature (${traits[0]}): its first clause lacks ${missingLead.join(", ")}`);
  const named = partsIn(String(description));
  for (const part of required) if (!named.includes(part)) problems.push(`the description does not name her ${part}`);
  for (const part of negatedParts(String(description)))
    if (declared.has(part)) problems.push(`the description negates a declared trait: her ${part}`);
  return problems;
}
