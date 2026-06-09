/**
 * Built-in sample practice packages.
 *
 * Lets a host start a practice session with zero setup — no JSON key file
 * required. Each entry only hand-authors `rootSubtree`; the `subtrees` array
 * (used by the validation engine) is derived with extractAllSubtrees so it can
 * never drift out of sync with the tree.
 *
 * Format note: the validator compares a student's subtree representation
 * against these via exact JSON string match. The student's buildSubtreeRep
 * sorts binary children left-to-right by word index, so binary children below
 * MUST be authored in that same ascending order (leftmost word first).
 */
import { extractAllSubtrees } from "../utils/validation";

// Concise builders mirroring the rep shape produced by buildSubtreeRep().
const w = (index, word) => ({ type: "word", index, word });
const u = (category, child) => ({ type: "unary", category, child });
const b = (category, left, right) => ({ type: "binary", category, children: [left, right] });

// Each raw sample: a sentence and its model X-bar tree.
// Convention: every word sits under its part-of-speech node (D / N / V),
// nouns project to NP, verbs to VP, and the clause root is S.
const rawSamples = [
  {
    // 2 words — gentle starter
    sentence: "Birds sing",
    rootSubtree: b("S",
      u("NP", u("N", w(0, "Birds"))),
      u("VP", u("V", w(1, "sing")))
    )
  },
  {
    // 3 words — adds a determiner phrase subject
    sentence: "The cat sleeps",
    rootSubtree: b("S",
      b("DP", u("D", w(0, "The")), u("NP", u("N", w(1, "cat")))),
      u("VP", u("V", w(2, "sleeps")))
    )
  },
  {
    // 5 words — transitive verb with an object DP
    sentence: "The student reads a book",
    rootSubtree: b("S",
      b("DP", u("D", w(0, "The")), u("NP", u("N", w(1, "student")))),
      b("VP",
        u("V", w(2, "reads")),
        b("DP", u("D", w(3, "a")), u("NP", u("N", w(4, "book"))))
      )
    )
  }
];

export const SAMPLE_PRACTICE_PACKAGE = rawSamples.map((s) => ({
  sentence: s.sentence,
  rootSubtree: s.rootSubtree,
  subtrees: extractAllSubtrees(s.rootSubtree)
}));
