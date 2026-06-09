import { validateStudentTree, buildSubtreeRep, extractAllSubtrees } from "../frontend/src/utils/validation.js";

// Helper to create assertion
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ Passed: ${message}`);
  }
}

console.log("Starting Syntax Tree Validation Engine Tests with Separate Nodes...");

// ----------------------------------------------------
// Setup Sample Data: Sentence "the dog" (2 words)
// Word 0: "the", Word 1: "dog"
// Target Tree: (DP (D the) (NP (N' (N dog))))
// ----------------------------------------------------

// 1. Define Teacher's Root Subtree Representation
const teacherWord0 = { type: "word", index: 0, word: "the" };
const teacherWord1 = { type: "word", index: 1, word: "dog" };

const teacherD = { type: "unary", category: "D", child: teacherWord0 };
const teacherN = { type: "unary", category: "N", child: teacherWord1 };
const teacherNPrime = { type: "unary", category: "N'", child: teacherN };
const teacherNP = { type: "unary", category: "NP", child: teacherNPrime };
const teacherDP = { type: "binary", category: "DP", children: [teacherD, teacherNP] };

const teacherAnswerKey = {
  rootSubtree: teacherDP,
  subtrees: extractAllSubtrees(teacherDP),
  sentence: "the dog"
};

// 2. Test Cases

// TEST CASE 1: Student has no nodes except base words (words don't have categories)
const test1Nodes = [
  { id: "word_0", data: { isWord: true, wordIndex: 0, word: "the", category: "" } },
  { id: "word_1", data: { isWord: true, wordIndex: 1, word: "dog", category: "" } }
];
const test1Edges = [];

const res1 = validateStudentTree(test1Nodes, test1Edges, teacherAnswerKey);
assert(res1.invalidNodeIds.size === 0, "Base words should not be invalid");
assert(res1.correctNodeIds.size === 2, "Word nodes are always correct since they are leaves");
assert(res1.isComplete === false, "Incomplete tree should not mark game complete");


// TEST CASE 2: Student has created pre-terminals D and N pointing to words
const test2Nodes = [
  { id: "word_0", data: { isWord: true, wordIndex: 0, word: "the" } },
  { id: "word_1", data: { isWord: true, wordIndex: 1, word: "dog" } },
  { id: "node_d", data: { isWord: false, category: "D" } },
  { id: "node_n", data: { isWord: false, category: "N" } }
];
const test2Edges = [
  { id: "e_d_word_0", source: "node_d", target: "word_0" },
  { id: "e_n_word_1", source: "node_n", target: "word_1" }
];

const res2 = validateStudentTree(test2Nodes, test2Edges, teacherAnswerKey);
assert(res2.correctNodeIds.has("node_d"), "Category node D is correct");
assert(res2.correctNodeIds.has("node_n"), "Category node N is correct");
assert(res2.invalidNodeIds.size === 0, "No invalid nodes when structures match the answer key");


// TEST CASE 3: Student has assigned incorrect category to word node (e.g. projecting dog to V instead of N)
const test3Nodes = [
  { id: "word_0", data: { isWord: true, wordIndex: 0, word: "the" } },
  { id: "word_1", data: { isWord: true, wordIndex: 1, word: "dog" } },
  { id: "node_v", data: { isWord: false, category: "V" } } // WRONG! Should be N
];
const test3Edges = [
  { id: "e_v_word_1", source: "node_v", target: "word_1" }
];

const res3 = validateStudentTree(test3Nodes, test3Edges, teacherAnswerKey);
assert(res3.invalidNodeIds.has("node_v"), "Category node V should be flagged as invalid (not in correct subtrees)");


// TEST CASE 4: Student has correct unary projection N -> N'
const test4Nodes = [
  { id: "word_0", data: { isWord: true, wordIndex: 0, word: "the" } },
  { id: "word_1", data: { isWord: true, wordIndex: 1, word: "dog" } },
  { id: "node_n", data: { isWord: false, category: "N" } },
  { id: "node_nprime", data: { isWord: false, category: "N'" } }
];
const test4Edges = [
  { id: "e_n_word_1", source: "node_n", target: "word_1" },
  { id: "e_nprime_n", source: "node_nprime", target: "node_n" }
];

const res4 = validateStudentTree(test4Nodes, test4Edges, teacherAnswerKey);
assert(res4.correctNodeIds.has("node_nprime"), "Unary projection N -> N' should be correct");
assert(res4.invalidNodeIds.size === 0, "No invalid nodes");


// TEST CASE 5: Student has incorrect unary projection (skipped N', went directly N -> NP)
const test5Nodes = [
  { id: "word_0", data: { isWord: true, wordIndex: 0, word: "the" } },
  { id: "word_1", data: { isWord: true, wordIndex: 1, word: "dog" } },
  { id: "node_n", data: { isWord: false, category: "N" } },
  { id: "node_np", data: { isWord: false, category: "NP" } } // WRONG: projects directly from N without N'
];
const test5Edges = [
  { id: "e_n_word_1", source: "node_n", target: "word_1" },
  { id: "e_np_n", source: "node_np", target: "node_n" }
];

const res5 = validateStudentTree(test5Nodes, test5Edges, teacherAnswerKey);
assert(res5.invalidNodeIds.has("node_np"), "Direct projection N -> NP should be flagged as invalid (skipping intermediate N')");


// TEST CASE 6: Complete correct tree build
const test6Nodes = [
  { id: "word_0", data: { isWord: true, wordIndex: 0, word: "the" } },
  { id: "word_1", data: { isWord: true, wordIndex: 1, word: "dog" } },
  { id: "node_d", data: { isWord: false, category: "D" } },
  { id: "node_n", data: { isWord: false, category: "N" } },
  { id: "node_nprime", data: { isWord: false, category: "N'" } },
  { id: "node_np", data: { isWord: false, category: "NP" } },
  { id: "node_dp", data: { isWord: false, category: "DP" } }
];
const test6Edges = [
  { id: "e_d_w0", source: "node_d", target: "word_0" },
  { id: "e_n_w1", source: "node_n", target: "word_1" },
  { id: "e_nprime_n", source: "node_nprime", target: "node_n" },
  { id: "e_np_nprime", source: "node_np", target: "node_nprime" },
  { id: "e_dp_d", source: "node_dp", target: "node_d" },
  { id: "e_dp_np", source: "node_dp", target: "node_np" }
];

const res6 = validateStudentTree(test6Nodes, test6Edges, teacherAnswerKey);
assert(res6.correctNodeIds.has("node_dp"), "Root DP node should be correct");
assert(res6.invalidNodeIds.size === 0, "No invalid nodes in a complete correct tree");
assert(res6.isComplete === true, "isComplete should be true when the entire tree matches the answer key root");

console.log("\n⭐ All tests passed successfully!");
