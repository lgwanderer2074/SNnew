/**
 * Preloaded X-Bar Practice Sentences and Answer Keys
 */
import { extractAllSubtrees } from "./validation.js";

// Helper to construct a word leaf
const W = (index, word) => ({ type: "word", index, word });

// Helper to construct a unary projection
const U = (category, child) => ({ type: "unary", category, child });

// Helper to construct a binary branch
const B = (category, left, right) => ({ type: "binary", category, children: [left, right] });

// 1. "syntax is fun"
const tree1 = B("TP",
  U("NP", U("N-bar", U("N", W(0, "syntax")))),
  B("T-bar",
    U("T", W(1, "is")),
    U("AP", U("A-bar", U("A", W(2, "fun"))))
  )
);

// 2. "she loves linguistics"
const tree2 = B("TP",
  U("NP", U("N-bar", U("N", W(0, "she")))),
  U("VP",
    B("V-bar",
      U("V", W(1, "loves")),
      U("NP", U("N-bar", U("N", W(2, "linguistics"))))
    )
  )
);

// 3. "she thinks that syntax is fun"
const tree3 = B("TP",
  U("NP", U("N-bar", U("N", W(0, "she")))),
  U("VP",
    B("V-bar",
      U("V", W(1, "thinks")),
      B("CP",
        U("C", W(2, "that")),
        B("TP",
          U("NP", U("N-bar", U("N", W(3, "syntax")))),
          B("T-bar",
            U("T", W(4, "is")),
            U("AP", U("A-bar", U("A", W(5, "fun"))))
          )
        )
      )
    )
  )
);

export const DEFAULT_PRACTICE_SENTENCES = [
  {
    id: "syntax_is_fun",
    label: "Simple Copula: 'syntax is fun'",
    sentence: "syntax is fun",
    answerKey: {
      rootSubtree: tree1,
      subtrees: extractAllSubtrees(tree1),
      sentence: "syntax is fun"
    }
  },
  {
    id: "she_loves_linguistics",
    label: "Transitive Verb: 'she loves linguistics'",
    sentence: "she loves linguistics",
    answerKey: {
      rootSubtree: tree2,
      subtrees: extractAllSubtrees(tree2),
      sentence: "she loves linguistics"
    }
  },
  {
    id: "she_thinks_that_syntax_is_fun",
    label: "Complement Clause: 'she thinks that syntax is fun'",
    sentence: "she thinks that syntax is fun",
    answerKey: {
      rootSubtree: tree3,
      subtrees: extractAllSubtrees(tree3),
      sentence: "she thinks that syntax is fun"
    }
  }
];
