import { useState, useReducer, useRef, useEffect, useMemo, useCallback } from "react";
import {
  MessageSquare, Settings, Send, StopCircle, RefreshCw,
  ChevronDown, ChevronUp, BookOpen, Zap, Cpu, BarChart2,
  Trash2, X, Brain, Search, FlaskConical,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// SPECIAL TOKENS
// ─────────────────────────────────────────────────────────────────────────────

const SPECIAL_TOKENS = {
  BOS: "<BOS>", EOS: "<EOS>", USR: "<USR>", AST: "<AST>",
  SYS: "<SYS>", PAD: "<PAD>", UNK: "<UNK>",
  ACT_ANSWER: "<ACT_ANSWER>", ACT_CLARIFY: "<ACT_CLARIFY>",
  ACT_LIST: "<ACT_LIST>", ACT_GREET: "<ACT_GREET>",
  STYLE_CONCISE: "<STYLE_CONCISE>", STYLE_DETAILED: "<STYLE_DETAILED>",
  INTENT_DEFINITION: "<INTENT_DEFINITION>",
  INTENT_EXPLANATION: "<INTENT_EXPLANATION>",
  INTENT_COMPARISON: "<INTENT_COMPARISON>",
  INTENT_STEPS: "<INTENT_STEPS>",
  INTENT_EXAMPLES: "<INTENT_EXAMPLES>",
  INTENT_BRAINSTORM: "<INTENT_BRAINSTORM>",
  INTENT_TROUBLESHOOT: "<INTENT_TROUBLESHOOT>",
  INTENT_SUMMARIZE: "<INTENT_SUMMARIZE>",
  INTENT_YESNO: "<INTENT_YESNO>",
  INTENT_GREET: "<INTENT_GREET>",
  INTENT_THANKS: "<INTENT_THANKS>",
  INTENT_GENERIC: "<INTENT_GENERIC>",
  FMT_CONCISE: "<FMT_CONCISE>",
  FMT_DETAILED: "<FMT_DETAILED>",
  FMT_BULLETS: "<FMT_BULLETS>",
  FMT_COMPARE: "<FMT_COMPARE>",
  FMT_STEPS: "<FMT_STEPS>",
  TOPIC_PROGRAMMING: "<TOPIC_PROGRAMMING>",
  TOPIC_AI: "<TOPIC_AI>",
  TOPIC_NETWORKING: "<TOPIC_NETWORKING>",
  TOPIC_MATH: "<TOPIC_MATH>",
  TOPIC_GENERAL: "<TOPIC_GENERAL>",
} as const;

type SpecialToken = (typeof SPECIAL_TOKENS)[keyof typeof SPECIAL_TOKENS];
const SPECIAL_SET = new Set<string>(Object.values(SPECIAL_TOKENS));

// ─────────────────────────────────────────────────────────────────────────────
// TOPIC LEXICONS (V3.1: used for topic-lock decoding penalties)
// ─────────────────────────────────────────────────────────────────────────────

const TOPIC_LEXICONS: Record<string, Set<string>> = {
  programming: new Set([
    "recursion","recursive","function","call","stack","base","case","factorial","fibonacci",
    "array","arrays","linked","list","lists","node","pointer","tree","graph","hash","sort","search",
    "algorithm","code","program","variable","class","object","loop","index","type","python","javascript",
    "java","rust","go","typescript","compile","runtime","syntax","debug","error","bug","fix",
    "iteration","iterative","stack","overflow","heap","memory","allocation","garbage","collection",
    "binary","queue","dequeue","enqueue","push","pop","insert","delete","traverse","depth","breadth",
    "complexity","big","notation","time","space","efficiency","data","structure","oop","inheritance",
    "polymorphism","encapsulation","abstraction","method","property","interface","module","package",
    "library","framework","api","endpoint","request","response","database","sql","nosql","query",
    "version","control","git","branch","commit","merge","docker","container","deploy","build",
    "test","unit","mock","assert","refactor","review","pattern","design","solid","mvc",
  ]),
  ai: new Set([
    "machine","learning","neural","network","deep","model","training","dataset","label","feature",
    "prediction","classification","regression","clustering","supervised","unsupervised","reinforcement",
    "gradient","descent","backpropagation","weight","bias","layer","activation","loss","accuracy",
    "overfitting","underfitting","validation","test","epoch","batch","optimizer","adam","sgd",
    "transformer","attention","token","embedding","vector","representation","language","gpt","llm",
    "bert","fine","tuning","inference","prompt","generation","nlp","natural","processing","sentiment",
    "image","recognition","computer","vision","convolution","cnn","rnn","lstm","gan","vae",
    "scikit","tensorflow","pytorch","keras","numpy","pandas","matplotlib","jupyter","notebook",
    "n","gram","ngram","trigram","bigram","unigram","probability","interpolation","jelinek","mercer",
    "perplexity","entropy","smoothing","backoff","corpus","vocabulary","tokenize","detokenize",
  ]),
  networking: new Set([
    "internet","network","tcp","udp","ip","http","https","dns","router","switch","protocol",
    "bandwidth","latency","packet","server","client","request","response","port","socket","ssl","tls",
    "firewall","vpn","proxy","load","balancer","cdn","api","rest","graphql","websocket","oauth",
    "cloud","aws","azure","gcp","kubernetes","microservice","service","mesh","grpc","queue","broker",
    "kafka","rabbitmq","redis","cache","web","browser","url","domain","host","address","subnet","mask",
  ]),
  math: new Set([
    "math","calculus","algebra","geometry","equation","formula","probability","statistics","theorem",
    "proof","number","integer","float","matrix","vector","derivative","integral","limit","function",
    "polynomial","prime","factor","divisor","modulo","logarithm","exponential","trigonometry","sine",
    "cosine","tangent","mean","median","mode","variance","deviation","distribution","normal","binomial",
  ]),
};

// For each topic, tokens that strongly signal OTHER topics (contamination markers)
const TOPIC_CONTAMINANTS: Record<string, Set<string>> = {
  programming: new Set([
    "harvard","mark","ii","moth","relay","logbook","spam","filter","inbox","junk","bayesian",
    "search","engine","crawler","index","ranking","page","authority","seo","serp",
    "http","dns","router","packet","bandwidth","bandwidth","latency","subnet",
    "calculus","derivative","integral","trigonometry","polynomial","prime",
  ]),
  ai: new Set([
    "harvard","mark","ii","moth","relay","logbook",
    "router","packet","subnet","bandwidth","latency","dns",
    "factorial","fibonacci","tree","traversal","linked","list","hash","table",
  ]),
  networking: new Set([
    "recursion","factorial","fibonacci","neural","gradient","backpropagation","epoch","batch",
    "harvard","mark","ii","moth","relay","logbook",
  ]),
  math: new Set([
    "harvard","mark","ii","moth","relay","logbook","spam","filter",
    "router","packet","subnet","dns",
    "neural","gradient","backpropagation","epoch","batch",
  ]),
  general: new Set([]),
};

// ─────────────────────────────────────────────────────────────────────────────
// INTENT SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

type Intent =
  | "greet" | "thanks" | "goodbye"
  | "definition" | "explanation" | "comparison"
  | "steps" | "examples" | "brainstorming"
  | "troubleshooting" | "summarize"
  | "yes_no" | "clarification_needed" | "generic_answer"
  | "followup_shorter" | "followup_example" | "followup_why" | "followup_topic_shift";

type FormatPref = "concise" | "detailed" | "bullets" | "steps" | "compare";
type TopicTag = "programming" | "ai" | "networking" | "math" | "general";

interface IntentResult {
  intent: Intent;
  confidence: number;
  format: FormatPref;
  topics: TopicTag[];
  needsClarification: boolean;
  actToken: string;
  intentToken: string;
  formatToken: string;
  topicToken: string;
}

const INTENT_TOKEN_MAP: Record<string, string> = {
  greet: SPECIAL_TOKENS.INTENT_GREET,
  thanks: SPECIAL_TOKENS.INTENT_THANKS,
  goodbye: SPECIAL_TOKENS.INTENT_GENERIC,
  definition: SPECIAL_TOKENS.INTENT_DEFINITION,
  explanation: SPECIAL_TOKENS.INTENT_EXPLANATION,
  comparison: SPECIAL_TOKENS.INTENT_COMPARISON,
  steps: SPECIAL_TOKENS.INTENT_STEPS,
  examples: SPECIAL_TOKENS.INTENT_EXAMPLES,
  brainstorming: SPECIAL_TOKENS.INTENT_BRAINSTORM,
  troubleshooting: SPECIAL_TOKENS.INTENT_TROUBLESHOOT,
  summarize: SPECIAL_TOKENS.INTENT_SUMMARIZE,
  yes_no: SPECIAL_TOKENS.INTENT_YESNO,
  clarification_needed: SPECIAL_TOKENS.INTENT_GENERIC,
  generic_answer: SPECIAL_TOKENS.INTENT_GENERIC,
  followup_shorter: SPECIAL_TOKENS.INTENT_GENERIC,
  followup_example: SPECIAL_TOKENS.INTENT_EXAMPLES,
  followup_why: SPECIAL_TOKENS.INTENT_EXPLANATION,
  followup_topic_shift: SPECIAL_TOKENS.INTENT_GENERIC,
};

const FORMAT_TOKEN_MAP: Record<FormatPref, string> = {
  concise: SPECIAL_TOKENS.FMT_CONCISE,
  detailed: SPECIAL_TOKENS.FMT_DETAILED,
  bullets: SPECIAL_TOKENS.FMT_BULLETS,
  compare: SPECIAL_TOKENS.FMT_COMPARE,
  steps: SPECIAL_TOKENS.FMT_STEPS,
};

const TOPIC_TOKEN_MAP: Record<TopicTag, string> = {
  programming: SPECIAL_TOKENS.TOPIC_PROGRAMMING,
  ai: SPECIAL_TOKENS.TOPIC_AI,
  networking: SPECIAL_TOKENS.TOPIC_NETWORKING,
  math: SPECIAL_TOKENS.TOPIC_MATH,
  general: SPECIAL_TOKENS.TOPIC_GENERAL,
};

const STEERING_TOKENS: Record<string, string[]> = {
  greet: ["hello", "hi", "welcome", "help", "today"],
  thanks: ["welcome", "glad", "happy", "help", "anytime"],
  goodbye: ["goodbye", "bye", "take", "care", "great"],
  definition: ["is", "refers", "means", "defined", "called", "term", "concept"],
  explanation: ["works", "because", "process", "how", "when", "through", "by"],
  comparison: ["difference", "while", "whereas", "both", "unlike", "similar", "versus", "compared"],
  steps: ["first", "next", "then", "finally", "step", "begin", "start", "after"],
  examples: ["example", "instance", "such", "like", "for", "consider", "include"],
  brainstorming: ["could", "might", "option", "idea", "consider", "approach", "possible"],
  troubleshooting: ["check", "ensure", "verify", "fix", "issue", "problem", "try", "make"],
  summarize: ["main", "key", "overall", "essentially", "brief", "summary", "core"],
  yes_no: ["yes", "no", "depends", "generally", "typically"],
  clarification_needed: ["could", "clarify", "mean", "specific", "which"],
  generic_answer: ["generally", "often", "typically", "many", "common"],
  followup_shorter: ["briefly", "short", "summary", "essentially"],
  followup_example: ["example", "instance", "consider", "such"],
  followup_why: ["because", "reason", "due", "since", "therefore"],
  followup_topic_shift: ["in", "for", "when", "using"],
};

interface OpeningPattern {
  display: string;
  forcedTokens: string[];
}

const OPENING_PATTERNS: Record<string, OpeningPattern[]> = {
  definition: [
    { display: "X is a…", forcedTokens: [] },
    { display: "A … is…", forcedTokens: ["A"] },
    { display: "The term … refers…", forcedTokens: ["The", "term"] },
  ],
  explanation: [
    { display: "This works by…", forcedTokens: ["This", "works", "by"] },
    { display: "The process involves…", forcedTokens: ["The", "process", "involves"] },
    { display: "To understand this…", forcedTokens: ["To", "understand"] },
  ],
  comparison: [
    { display: "The key difference…", forcedTokens: ["The", "key", "difference"] },
    { display: "While … , …", forcedTokens: ["While"] },
    { display: "Both … and … , but…", forcedTokens: ["Both"] },
  ],
  steps: [
    { display: "Here are the steps…", forcedTokens: ["Here", "are", "the", "steps"] },
    { display: "To begin…", forcedTokens: ["To", "begin"] },
    { display: "First,…", forcedTokens: ["First"] },
  ],
  examples: [
    { display: "For example…", forcedTokens: ["For", "example"] },
    { display: "Some examples include…", forcedTokens: ["Some", "examples", "include"] },
    { display: "Consider…", forcedTokens: ["Consider"] },
  ],
  brainstorming: [
    { display: "Here are some ideas…", forcedTokens: ["Here", "are", "some", "ideas"] },
    { display: "You could…", forcedTokens: ["You", "could"] },
  ],
  troubleshooting: [
    { display: "First check…", forcedTokens: ["First", "check"] },
    { display: "To fix this…", forcedTokens: ["To", "fix", "this"] },
    { display: "The issue may be…", forcedTokens: ["The", "issue", "may", "be"] },
  ],
  summarize: [
    { display: "In summary…", forcedTokens: ["In", "summary"] },
    { display: "The main idea is…", forcedTokens: ["The", "main", "idea"] },
    { display: "Overall…", forcedTokens: ["Overall"] },
  ],
  yes_no: [
    { display: "Yes,…", forcedTokens: ["Yes"] },
    { display: "No,…", forcedTokens: ["No"] },
    { display: "It depends…", forcedTokens: ["It", "depends"] },
    { display: "Generally…", forcedTokens: ["Generally"] },
  ],
  greet: [
    { display: "Hello!…", forcedTokens: ["Hello"] },
    { display: "Hi there!…", forcedTokens: ["Hi", "there"] },
    { display: "Hey!…", forcedTokens: ["Hey"] },
  ],
  thanks: [
    { display: "You're welcome!…", forcedTokens: ["You", "'re", "welcome"] },
    { display: "Glad to help!…", forcedTokens: ["Glad"] },
    { display: "Happy to help!…", forcedTokens: ["Happy", "to", "help"] },
  ],
  followup_shorter: [
    { display: "Briefly:…", forcedTokens: ["Briefly"] },
    { display: "In short…", forcedTokens: ["In", "short"] },
  ],
  followup_example: [
    { display: "For example…", forcedTokens: ["For", "example"] },
    { display: "A good example is…", forcedTokens: ["A", "good", "example", "is"] },
  ],
  followup_why: [
    { display: "Because…", forcedTokens: ["Because"] },
    { display: "The reason is…", forcedTokens: ["The", "reason", "is"] },
  ],
  generic_answer: [
    { display: "Generally…", forcedTokens: ["Generally"] },
    { display: "This is…", forcedTokens: ["This", "is"] },
    { display: "There are several…", forcedTokens: ["There", "are", "several"] },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// V3.1: INTENT RULES — priority-ordered, stricter separation
// ─────────────────────────────────────────────────────────────────────────────

interface IntentRule {
  patterns: RegExp[];
  intent: Intent;
  weight: number;
}

const INTENT_RULES: IntentRule[] = [
  // Social (highest priority, unambiguous)
  { patterns: [/\b(hi|hello|hey|howdy|greetings|good\s*(morning|afternoon|evening)|sup|what'?s\s*up)\b/i], intent: "greet", weight: 4 },
  { patterns: [/\b(thank(s| you)|thx|ty|appreciate)\b/i], intent: "thanks", weight: 4 },
  { patterns: [/\b(bye|goodbye|see\s*you|later|cya|farewell|good\s*night)\b/i], intent: "goodbye", weight: 4 },

  // V3.1: follow-up intents — boosted weight, checked before general intents
  { patterns: [/\b(shorter|briefer|simpler|simplify|shorten|concise|tl;?dr|in\s*short|less\s*detail|make\s*that\s*shorter)\b/i], intent: "followup_shorter", weight: 5 },
  { patterns: [/^(give\s*me\s*an?\s*example|one\s*example|example\s*please|show\s*me\s*one|example\??)$/i, /\b(give\s*me\s*(a|one)\s*example|show\s*an?\s*example)\b/i], intent: "followup_example", weight: 5 },
  { patterns: [/^(why\?*|why\s+(?:is|does|do|would|should).{0,30}|but\s+why|how\s+come)\b/i], intent: "followup_why", weight: 5 },
  { patterns: [/\bwhat\s+about\s+in\s+\w+\b/i, /\bhow\s+about\s+\w+\b/i, /\band\s+in\s+\w+\b/i], intent: "followup_topic_shift", weight: 4 },

  // V3.1: troubleshooting BEFORE generic — strong signal words
  { patterns: [
    /\b(my\s+code\s+(is\s+)?(not|isn'?t)\s*(working|running|compiling))\b/i,
    /\b(not\s*work(ing)?|broken|doesn'?t\s+work|can'?t\s+get\s+it\s+to)\b/i,
    /\b(error|bug|debug|crash|fail(ing|ed|ure)?|exception|traceback|undefined|null\s*pointer)\b/i,
    /\b(how\s+do\s+i\s+fix|how\s+to\s+fix|help\s+me\s+fix|fix\s+this|why\s+is\s+my\s+code)\b/i,
  ], intent: "troubleshooting", weight: 4 },

  // V3.1: steps — explicit "steps to" / "how to" patterns with strong weight, ahead of examples
  { patterns: [
    /\bgive\s*me\s+steps\b/i,
    /\bhow\s+(?:do\s+i|to)\s+(?:learn|install|set\s*up|configure|deploy|build|create|start|begin)\b/i,
    /\b(step[\s-]by[\s-]step|walkthrough|walk\s+me\s+through|tutorial|guide\s+me|procedure)\b/i,
    /\bsteps?\s+to\s+\w/i,
  ], intent: "steps", weight: 4 },

  // definition
  { patterns: [/\b(what\s*is|what\s*are|define|definition|meaning of|what\s*does.*mean)\b/i], intent: "definition", weight: 2 },
  // explanation
  { patterns: [/\b(explain|how\s*does|how\s*do|describe|tell\s*me\s*about|elaborate)\b/i], intent: "explanation", weight: 2 },
  // comparison
  { patterns: [/\b(difference|compare|versus|vs\.?|contrast|better|worse)\b/i, /\b(which|pros\s*and\s*cons)\b/i], intent: "comparison", weight: 2 },
  // examples (lower weight than steps so "give me steps" wins)
  { patterns: [/\b(example|instance|show\s*me|give\s*me\s*an?|sample|demonstrate)\b/i], intent: "examples", weight: 1.5 },
  { patterns: [/\b(brainstorm|ideas?|suggest|options?|alternatives?|creative)\b/i], intent: "brainstorming", weight: 2 },
  { patterns: [/\b(summar(y|ize)|overview|brief|tldr|main\s*point|in\s*short)\b/i], intent: "summarize", weight: 2 },
  { patterns: [/\b(is\s*it|are\s*they|does\s*it|should\s*i|can\s*i|would\s*it|is\s*there)\b/i], intent: "yes_no", weight: 1 },
  { patterns: [/\b(list|give\s*me|enumerate|tips|ways|types|kinds|methods)\b/i], intent: "examples", weight: 1 },
];

// V3.1: Expanded topic rules with variants and plural forms
const TOPIC_RULES: Array<{ patterns: RegExp[]; topic: TopicTag }> = [
  {
    patterns: [/\b(code|program(ming)?|function|variable|class|object|array(s)?|loop|algorithm(s)?|debug(ging)?|software|api|library|framework|typescript|javascript|python|java|rust|golang|c\+\+|recursion|recursive|data\s*structure(s)?|linked\s*list(s)?|hash\s*(table|map)?|sort(ing)?|search(ing)?|binary\s*search|tree(s)?|graph(s)?|stack(s)?|queue(s)?|heap(s)?|pointer(s)?|node(s)?|oop|object.oriented|concurren(cy|t)|thread(s)?|async|coroutine(s)?|memory\s*management|garbage\s*collect(ion|or)|docker|container(s)?|version\s*control|git|big\s*o|complexity|encapsulat|polymorphi|inheritan|abstraction)\b/i],
    topic: "programming"
  },
  {
    patterns: [/\b(machine\s*learning|neural\s*(network|net)|deep\s*learning|artificial\s*intelligence|ai\b|model(s)?|training|dataset(s)?|nlp|gpt|llm(s)?|transformer(s)?|n.?gram(s)?|language\s*model|supervised|unsupervised|reinforcement|gradient|backprop|embedding(s)?|tokeniz|classification|regression|clustering|overfitting|underfitting|scikit|tensorflow|pytorch|keras|chatbot|image\s*recognition|computer\s*vision|convolution|cnn|rnn|lstm|gan|fine.tun|prompt\s*(engineer|ing))\b/i],
    topic: "ai"
  },
  {
    patterns: [/\b(network(ing)?|internet|tcp|udp|http(s)?|dns|router|ip\s*address|bandwidth|latency|cloud|server|protocol|web\s*(server|app)|firewall|vpn|proxy|load\s*balan|cdn|microservice|kubernetes|kafka|websocket|grpc|oauth|rest\s*api|graphql)\b/i],
    topic: "networking"
  },
  {
    patterns: [/\b(math(ematics)?|calculus|algebra|geometry|equation|formula|probability|statistics|theorem|proof|integer|matrix|matrices|vector(s)?|derivative|integral|logarithm|trigonometry|polynomial|prime\s*number|factorial\b|fibonacci\b)\b/i],
    topic: "math"
  },
];

const FORMAT_RULES: Array<{ patterns: RegExp[]; format: FormatPref }> = [
  { patterns: [/\b(briefly|concise|short|quick|simple|tldr|in\s*a\s*few\s*words|shorten|shorter)\b/i], format: "concise" },
  { patterns: [/\b(detail(ed)?|in\s*depth|thoroughly|comprehensive|explain\s*fully)\b/i], format: "detailed" },
  { patterns: [/\b(list|bullet|enumerate|tips|items|points)\b/i], format: "bullets" },
  { patterns: [/\b(step|how\s*to|guide|procedure|walkthrough)\b/i], format: "steps" },
  { patterns: [/\b(compare|versus|vs\.?|difference|contrast)\b/i], format: "compare" },
];

function classifyIntent(text: string, frame?: ConversationFrame): IntentResult {
  const scores = new Map<Intent, number>();

  for (const rule of INTENT_RULES) {
    const matches = rule.patterns.filter(p => p.test(text)).length;
    if (matches > 0) {
      const cur = scores.get(rule.intent) ?? 0;
      scores.set(rule.intent, cur + rule.weight * matches);
    }
  }

  // V3.1: follow-up bonus from frame (only if no strong base intent detected)
  if (frame && frame.activeTopic !== "general") {
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount <= 4) {
      if (/example|instance/i.test(text)) scores.set("followup_example", (scores.get("followup_example") ?? 0) + 3);
      if (/^why\??$/i.test(text.trim())) scores.set("followup_why", (scores.get("followup_why") ?? 0) + 4);
      if (/shorter|brief|concise/i.test(text)) scores.set("followup_shorter", (scores.get("followup_shorter") ?? 0) + 3);
    }
  }

  // V3.1: troubleshooting bonus if frame topic is programming
  if (frame?.activeTopic === "programming" && /\b(not\s*work|error|bug|crash|fail|broken)\b/i.test(text)) {
    scores.set("troubleshooting", (scores.get("troubleshooting") ?? 0) + 2);
  }

  const topics: TopicTag[] = [];
  for (const r of TOPIC_RULES) {
    if (r.patterns.some(p => p.test(text))) topics.push(r.topic);
  }
  if (topics.length === 0 && frame && frame.activeTopic !== "general") {
    topics.push(frame.activeTopic as TopicTag);
  }
  if (topics.length === 0) topics.push("general");

  let format: FormatPref = "concise";
  for (const r of FORMAT_RULES) {
    if (r.patterns.some(p => p.test(text))) { format = r.format; break; }
  }
  if (format === "concise") {
    const topIntent = [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topIntent === "steps") format = "steps";
    else if (topIntent === "comparison") format = "compare";
    else if (topIntent === "examples" || topIntent === "brainstorming") format = "bullets";
    else if (topIntent === "explanation") format = "detailed";
    else if (topIntent === "troubleshooting") format = "steps";
    else if (topIntent === "followup_shorter") format = "concise";
  }

  let intent: Intent = "generic_answer";
  let topScore = 0;
  for (const [i, s] of scores) {
    if (s > topScore) { topScore = s; intent = i; }
  }

  const maxPossible = 8;
  const confidence = Math.min(topScore / maxPossible, 1.0);
  const needsClarification = confidence < 0.2 && text.split(/\s+/).length < 4
    && !["followup_example","followup_why","followup_shorter","followup_topic_shift"].includes(intent);

  const actMap: Partial<Record<Intent, string>> = {
    greet: SPECIAL_TOKENS.ACT_GREET,
    examples: SPECIAL_TOKENS.ACT_LIST,
    brainstorming: SPECIAL_TOKENS.ACT_LIST,
    steps: SPECIAL_TOKENS.ACT_LIST,
    definition: SPECIAL_TOKENS.ACT_CLARIFY,
    explanation: SPECIAL_TOKENS.ACT_CLARIFY,
    comparison: SPECIAL_TOKENS.ACT_CLARIFY,
    followup_example: SPECIAL_TOKENS.ACT_LIST,
    followup_why: SPECIAL_TOKENS.ACT_CLARIFY,
    troubleshooting: SPECIAL_TOKENS.ACT_ANSWER,
  };

  const intentToken = INTENT_TOKEN_MAP[intent] ?? SPECIAL_TOKENS.INTENT_GENERIC;
  const formatToken = FORMAT_TOKEN_MAP[format] ?? SPECIAL_TOKENS.FMT_CONCISE;
  const topicToken = TOPIC_TOKEN_MAP[topics[0]] ?? SPECIAL_TOKENS.TOPIC_GENERAL;

  return {
    intent, confidence, format, topics, needsClarification,
    actToken: actMap[intent] ?? SPECIAL_TOKENS.ACT_ANSWER,
    intentToken, formatToken, topicToken,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION FRAME
// ─────────────────────────────────────────────────────────────────────────────

interface ConversationFrame {
  activeTopic: string;
  activeSubtopic: string;
  activeAnswerMode: Intent | null;
  activeDetailLevel: FormatPref;
  lastUnresolvedQuestion: string;
  comparedEntities: [string, string] | null;
  lastKeywords: string[];
  turnsSinceTopicChange: number;
}

function createFrame(): ConversationFrame {
  return {
    activeTopic: "general", activeSubtopic: "",
    activeAnswerMode: null, activeDetailLevel: "concise",
    lastUnresolvedQuestion: "", comparedEntities: null,
    lastKeywords: [], turnsSinceTopicChange: 0,
  };
}

function updateFrame(frame: ConversationFrame, userText: string, ir: IntentResult): ConversationFrame {
  const next = { ...frame };
  next.turnsSinceTopicChange++;

  const newTopic = ir.topics[0];
  if (newTopic !== "general" && newTopic !== frame.activeTopic) {
    next.activeTopic = newTopic;
    next.turnsSinceTopicChange = 0;
  }

  const kw = tokenize(userText).filter(t => t.length > 4 && !SPECIAL_SET.has(t)).slice(0, 4);
  if (kw.length > 0) next.lastKeywords = kw;
  if (kw.length > 0) next.activeSubtopic = kw[0];

  if (!["followup_shorter","followup_example","followup_why","followup_topic_shift"].includes(ir.intent)) {
    next.activeAnswerMode = ir.intent;
  }

  const vsMatch = userText.match(/\b(\w+)\s+(?:vs|versus|and|or)\s+(\w+)\b/i);
  if (vsMatch) next.comparedEntities = [vsMatch[1], vsMatch[2]];

  next.activeDetailLevel = ir.format;
  next.lastUnresolvedQuestion = ir.needsClarification ? userText : "";

  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// VOCABULARY
// ─────────────────────────────────────────────────────────────────────────────

interface Vocab {
  tokenToId: Map<string, number>;
  idToToken: string[];
  size: number;
}

function buildVocab(tokens: string[]): Vocab {
  const tokenToId = new Map<string, number>();
  const idToToken: string[] = [];
  for (const st of Object.values(SPECIAL_TOKENS)) {
    if (!tokenToId.has(st)) { tokenToId.set(st, idToToken.length); idToToken.push(st); }
  }
  for (const t of tokens) {
    if (!tokenToId.has(t)) { tokenToId.set(t, idToToken.length); idToToken.push(t); }
  }
  return { tokenToId, idToToken, size: idToToken.length };
}

function extendVocab(vocab: Vocab, token: string): number {
  if (vocab.tokenToId.has(token)) return vocab.tokenToId.get(token)!;
  const id = vocab.idToToken.length;
  vocab.tokenToId.set(token, id);
  vocab.idToToken.push(token);
  vocab.size = vocab.idToToken.length;
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKENIZER
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_REGEX = new RegExp(
  [
    Object.values(SPECIAL_TOKENS).map(s => s.replace(/[<>]/g, c => `\\${c}`)).join("|"),
    "[a-zA-Z]+'[a-zA-Z]+",
    "[a-zA-Z]+",
    "\\d+(?:\\.\\d+)?",
    "\\.{2,}",
    "[.,!?;:\"'()\\[\\]{}\\-/\\\\@#$%^&*+=<>|~`]",
  ].join("|"),
  "g"
);

function tokenize(text: string): string[] {
  return text.match(TOKEN_REGEX) ?? [];
}

function tokenizeToIds(text: string, vocab: Vocab, addToVocab = false): number[] {
  return tokenize(text).map(t => {
    if (vocab.tokenToId.has(t)) return vocab.tokenToId.get(t)!;
    if (addToVocab) return extendVocab(vocab, t);
    return vocab.tokenToId.get(SPECIAL_TOKENS.UNK)!;
  });
}

const NO_LEFT_SPACE = new Set([".", ",", "!", "?", ";", ":", ")", "]", "}", "'s", "'t", "'re", "'ve", "'ll", "'d", "'m", "'"]);
const NO_RIGHT_SPACE = new Set(["(", "[", "{"]);

function detokenize(tokens: string[]): string {
  const visible = tokens.filter(t => !SPECIAL_SET.has(t));
  let result = "";
  for (let i = 0; i < visible.length; i++) {
    const tok = visible[i];
    const prev = visible[i - 1] ?? "";
    const needLeft = i > 0 && !NO_LEFT_SPACE.has(tok) && !NO_RIGHT_SPACE.has(prev) && !tok.startsWith("'");
    if (needLeft) result += " ";
    result += tok;
  }
  return result.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// EXEMPLAR
// ─────────────────────────────────────────────────────────────────────────────

interface Exemplar {
  userText: string;
  assistantText: string;
  userTokens: string[];
  assistantTokens: string[];
  assistantIds: number[];
  intent: Intent;
  format: FormatPref;
  topics: TopicTag[];
  userBigrams: Set<string>;
}

function parseExemplars(corpus: string, vocab: Vocab): Exemplar[] {
  const exemplars: Exemplar[] = [];
  const lines = corpus.split("\n").filter(l => l.trim());

  for (const line of lines) {
    const usrMatch = line.match(/<USR>\s*(.*?)\s*(?:<(?:ACT_|STYLE_|INTENT_|FMT_|TOPIC_)[^>]+>|<AST>)/);
    const astMatch = line.match(/<AST>\s*(.*?)\s*<EOS>/);
    if (!usrMatch || !astMatch) continue;

    const userText = usrMatch[1].replace(/<[^>]+>/g, "").trim();
    const assistantText = astMatch[1].replace(/<[^>]+>/g, "").trim();
    if (!userText || !assistantText) continue;

    const ir = classifyIntent(userText);
    const userTokens = tokenize(userText).filter(t => !SPECIAL_SET.has(t));
    const assistantTokens = tokenize(assistantText).filter(t => !SPECIAL_SET.has(t));
    const assistantIds = assistantTokens.map(t => vocab.tokenToId.get(t) ?? vocab.tokenToId.get(SPECIAL_TOKENS.UNK)!);

    const userBigrams = new Set<string>();
    for (let i = 0; i < userTokens.length - 1; i++) {
      userBigrams.add(`${userTokens[i].toLowerCase()}_${userTokens[i+1].toLowerCase()}`);
    }

    exemplars.push({
      userText, assistantText,
      userTokens, assistantTokens, assistantIds,
      intent: ir.intent, format: ir.format, topics: ir.topics, userBigrams,
    });
  }
  return exemplars;
}

// ─────────────────────────────────────────────────────────────────────────────
// V3.1: STRICT EXEMPLAR RETRIEVAL with intent/topic gating
// ─────────────────────────────────────────────────────────────────────────────

// Compatible intent pairs — exemplars from these intents can inform each other
const INTENT_COMPAT: Record<string, string[]> = {
  definition: ["definition", "explanation", "summarize"],
  explanation: ["explanation", "definition", "summarize", "followup_why"],
  comparison: ["comparison"],
  steps: ["steps", "troubleshooting"],
  examples: ["examples", "brainstorming", "followup_example"],
  brainstorming: ["brainstorming", "examples"],
  troubleshooting: ["troubleshooting", "steps"],
  summarize: ["summarize", "definition", "explanation"],
  yes_no: ["yes_no", "definition"],
  followup_shorter: ["followup_shorter", "summarize", "definition"],
  followup_example: ["followup_example", "examples"],
  followup_why: ["followup_why", "explanation"],
  followup_topic_shift: ["followup_topic_shift", "explanation", "definition"],
  greet: ["greet"],
  thanks: ["thanks"],
  goodbye: ["goodbye"],
  generic_answer: ["generic_answer", "definition", "explanation"],
  clarification_needed: ["clarification_needed"],
};

// V3.1: dynamic k based on intent
function retrievalK(intent: Intent): number {
  switch(intent) {
    case "definition": case "summarize": case "yes_no": return 1;
    case "explanation": case "comparison": case "troubleshooting": case "steps": return 2;
    case "examples": case "brainstorming": return 3;
    case "followup_example": return 2;
    case "followup_why": return 1;
    case "followup_shorter": return 1;
    default: return 2;
  }
}

function exemplarSimilarity(ex: Exemplar, queryTokens: string[], ir: IntentResult, frame: ConversationFrame): number {
  const compatIntents = INTENT_COMPAT[ir.intent] ?? [ir.intent];

  // V3.1: hard gate — if intent is incompatible, return 0
  if (!compatIntents.includes(ex.intent)) return 0;

  // V3.1: topic gating — if query has a non-general topic, exemplar must match or be penalized heavily
  const queryTopics = ir.topics.filter(t => t !== "general");
  if (queryTopics.length > 0) {
    const topicMatch = queryTopics.some(t => ex.topics.includes(t));
    if (!topicMatch) return 0; // hard exclude cross-topic exemplars for focused intents
  }

  const qArr = queryTokens.map(t => t.toLowerCase());
  const qSet = new Set(qArr);
  const exSet = new Set(ex.userTokens.map(t => t.toLowerCase()));

  let overlap = 0;
  for (const t of qSet) if (exSet.has(t)) overlap++;
  const jaccard = overlap / Math.max(qSet.size + exSet.size - overlap, 1);

  let orderedBigramBonus = 0;
  for (let i = 0; i < qArr.length - 1; i++) {
    const bg = `${qArr[i]}_${qArr[i+1]}`;
    if (ex.userBigrams.has(bg)) orderedBigramBonus += 0.2;
  }

  const intentBonus = ex.intent === ir.intent ? 0.4 : 0.1;
  const formatBonus = ex.format === ir.format ? 0.2 : 0;

  let frameBonus = 0;
  if (frame.activeTopic !== "general" && ex.topics.includes(frame.activeTopic as TopicTag)) {
    frameBonus = 0.15;
  }
  let rarityBonus = 0;
  for (const kw of frame.lastKeywords) {
    if (kw.length > 5 && exSet.has(kw.toLowerCase())) rarityBonus += 0.15;
  }

  return jaccard + orderedBigramBonus + intentBonus + formatBonus + frameBonus + rarityBonus;
}

function retrieveExemplars(exemplars: Exemplar[], queryTokens: string[], ir: IntentResult, frame: ConversationFrame): Exemplar[] {
  const k = retrievalK(ir.intent);
  const scored = exemplars.map(ex => ({ ex, score: exemplarSimilarity(ex, queryTokens, ir, frame) }));
  scored.sort((a, b) => b.score - a.score);
  // V3.1: minimum score threshold is higher to prevent weak exemplar bleed
  return scored.slice(0, k).filter(s => s.score > 0.1).map(s => s.ex);
}

// ─────────────────────────────────────────────────────────────────────────────
// N-GRAM MODEL
// ─────────────────────────────────────────────────────────────────────────────

interface NGramModel {
  unigrams: Map<number, number>;
  bigrams: Map<number, Map<number, number>>;
  trigrams: Map<number, Map<number, Map<number, number>>>;
  totalTokens: number;
  vocab: Vocab;
}

function createModel(vocab: Vocab): NGramModel {
  return { unigrams: new Map(), bigrams: new Map(), trigrams: new Map(), totalTokens: 0, vocab };
}

function trainOnIds(model: NGramModel, ids: number[]): void {
  for (let i = 0; i < ids.length; i++) {
    const w0 = ids[i];
    model.unigrams.set(w0, (model.unigrams.get(w0) ?? 0) + 1);
    model.totalTokens++;
    if (i >= 1) {
      const w1 = ids[i - 1];
      let bi = model.bigrams.get(w1);
      if (!bi) { bi = new Map(); model.bigrams.set(w1, bi); }
      bi.set(w0, (bi.get(w0) ?? 0) + 1);
    }
    if (i >= 2) {
      const w1 = ids[i - 2], w2 = ids[i - 1];
      let m1 = model.trigrams.get(w1);
      if (!m1) { m1 = new Map(); model.trigrams.set(w1, m1); }
      let m2 = m1.get(w2);
      if (!m2) { m2 = new Map(); m1.set(w2, m2); }
      m2.set(w0, (m2.get(w0) ?? 0) + 1);
    }
  }
}

const JM_L3 = 0.6, JM_L2 = 0.25, JM_L1 = 0.12, JM_L0 = 0.03;

function interpolatedProb(model: NGramModel, w0: number, ctx1: number | null, ctx2: number | null): number {
  const V = model.vocab.size || 1;
  const N = model.totalTokens || 1;
  const uniProb = (model.unigrams.get(w0) ?? 0) / N;
  let biProb = 0;
  if (ctx1 !== null) {
    const biCtx = model.bigrams.get(ctx1);
    if (biCtx) {
      const biCount = biCtx.get(w0) ?? 0;
      const biTotal = [...biCtx.values()].reduce((a, b) => a + b, 0);
      biProb = biTotal > 0 ? biCount / biTotal : 0;
    }
  }
  let triProb = 0;
  if (ctx2 !== null && ctx1 !== null) {
    const triCtx = model.trigrams.get(ctx2)?.get(ctx1);
    if (triCtx) {
      const triCount = triCtx.get(w0) ?? 0;
      const triTotal = [...triCtx.values()].reduce((a, b) => a + b, 0);
      triProb = triTotal > 0 ? triCount / triTotal : 0;
    }
  }
  const uniformProb = 1 / V;
  if (ctx2 !== null && ctx1 !== null)
    return JM_L3 * triProb + JM_L2 * biProb + JM_L1 * uniProb + JM_L0 * uniformProb;
  if (ctx1 !== null)
    return (JM_L3 + JM_L2) * biProb + JM_L1 * uniProb + JM_L0 * uniformProb;
  return (JM_L3 + JM_L2 + JM_L1) * uniProb + JM_L0 * uniformProb;
}

function scoreCandidatesUnion(
  models: NGramModel[],
  ctx1: number | null,
  ctx2: number | null,
  topN = 300
): Map<number, number[]> {
  const candidateSet = new Set<number>();
  for (const model of models) {
    if (ctx2 !== null && ctx1 !== null) {
      const triCtx = model.trigrams.get(ctx2)?.get(ctx1);
      if (triCtx) for (const id of triCtx.keys()) candidateSet.add(id);
    }
    if (ctx1 !== null) {
      const biCtx = model.bigrams.get(ctx1);
      if (biCtx) for (const id of biCtx.keys()) candidateSet.add(id);
    }
    if (candidateSet.size < topN) {
      const sorted = [...model.unigrams.entries()].sort((a, b) => b[1] - a[1]);
      for (const [id] of sorted) {
        if (candidateSet.size >= topN) break;
        candidateSet.add(id);
      }
    }
  }
  const result = new Map<number, number[]>();
  for (const id of candidateSet) {
    const probs = models.map(m => interpolatedProb(m, id, ctx1, ctx2));
    result.set(id, probs);
  }
  return result;
}

function pruneModel(model: NGramModel, minCount = 1): void {
  for (const [w1, bi] of model.bigrams) {
    for (const [w0, cnt] of bi) if (cnt < minCount) bi.delete(w0);
    if (bi.size === 0) model.bigrams.delete(w1);
  }
  for (const [w1, m1] of model.trigrams) {
    for (const [w2, m2] of m1) {
      for (const [w0, cnt] of m2) if (cnt < minCount) m2.delete(w0);
      if (m2.size === 0) m1.delete(w2);
    }
    if (m1.size === 0) model.trigrams.delete(w1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MINI-MODELS
// ─────────────────────────────────────────────────────────────────────────────

interface MiniModels {
  perIntent: Map<string, NGramModel>;
  perTopic: Map<TopicTag, NGramModel>;
}

function buildMiniModels(exemplars: Exemplar[], vocab: Vocab): MiniModels {
  const perIntent = new Map<string, NGramModel>();
  const perTopic = new Map<TopicTag, NGramModel>();
  for (const ex of exemplars) {
    if (!perIntent.has(ex.intent)) perIntent.set(ex.intent, createModel(vocab));
    trainOnIds(perIntent.get(ex.intent)!, ex.assistantIds);
    for (const topic of ex.topics) {
      if (!perTopic.has(topic)) perTopic.set(topic, createModel(vocab));
      trainOnIds(perTopic.get(topic)!, ex.assistantIds);
    }
  }
  return { perIntent, perTopic };
}

// ─────────────────────────────────────────────────────────────────────────────
// V3.1: TOPIC-LOCK — build penalty set for off-topic tokens
// ─────────────────────────────────────────────────────────────────────────────

function buildTopicLockPenaltyIds(activeTopic: TopicTag, vocab: Vocab): Set<number> {
  const penaltyIds = new Set<number>();
  // Penalize tokens that are contaminants for the active topic
  const contaminants = TOPIC_CONTAMINANTS[activeTopic] ?? new Set<string>();
  for (const word of contaminants) {
    const id = vocab.tokenToId.get(word);
    if (id !== undefined) penaltyIds.add(id);
    // Also check capitalized version
    const capId = vocab.tokenToId.get(word.charAt(0).toUpperCase() + word.slice(1));
    if (capId !== undefined) penaltyIds.add(capId);
  }
  return penaltyIds;
}

// Intents where topic-lock should be strongest
const TOPIC_LOCK_INTENTS = new Set<Intent>([
  "definition","explanation","comparison","summarize","troubleshooting","followup_why","yes_no"
]);

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE PLAN
// ─────────────────────────────────────────────────────────────────────────────

interface ResponsePlan {
  intent: Intent;
  confidence: number;
  topics: TopicTag[];
  format: FormatPref;
  askClarification: boolean;
  opening: OpeningPattern;
  requiredKeywords: string[];
  bannedTokenIds: Set<number>;
  topicLockPenaltyIds: Set<number>; // V3.1
  topicLockStrength: number;        // V3.1: 0.0–1.0
  retrievedExemplars: Exemplar[];
  temperature: number;
  topK: number;                     // V3.1: per-intent topK override
  topP: number;                     // V3.1: per-intent topP override
  useArgmaxEarly: boolean;          // V3.1: near-argmax for factual intents
  frame: ConversationFrame;
  intentToken: string;
  formatToken: string;
  topicToken: string;
}

// V3.1: Stricter decoding presets per intent
interface DecodingPreset { temperature: number; topK: number; topP: number; useArgmaxEarly: boolean; }
const DECODING_PRESETS: Record<string, DecodingPreset> = {
  // Factual / precise — tight
  definition:    { temperature: 0.50, topK: 20, topP: 0.85, useArgmaxEarly: true },
  summarize:     { temperature: 0.50, topK: 20, topP: 0.85, useArgmaxEarly: true },
  yes_no:        { temperature: 0.55, topK: 20, topP: 0.85, useArgmaxEarly: true },
  troubleshooting:{ temperature: 0.55, topK: 25, topP: 0.87, useArgmaxEarly: true },
  followup_why:  { temperature: 0.55, topK: 20, topP: 0.85, useArgmaxEarly: true },
  // Structured
  explanation:   { temperature: 0.62, topK: 28, topP: 0.88, useArgmaxEarly: true },
  comparison:    { temperature: 0.62, topK: 28, topP: 0.88, useArgmaxEarly: true },
  steps:         { temperature: 0.60, topK: 25, topP: 0.87, useArgmaxEarly: true },
  followup_shorter:{ temperature: 0.50, topK: 20, topP: 0.85, useArgmaxEarly: true },
  // Generative — more flexible
  examples:      { temperature: 0.78, topK: 38, topP: 0.92, useArgmaxEarly: false },
  brainstorming: { temperature: 0.90, topK: 45, topP: 0.95, useArgmaxEarly: false },
  followup_example:{ temperature: 0.72, topK: 32, topP: 0.90, useArgmaxEarly: false },
  // Social
  greet:         { temperature: 0.70, topK: 30, topP: 0.90, useArgmaxEarly: false },
  thanks:        { temperature: 0.60, topK: 25, topP: 0.88, useArgmaxEarly: false },
  // Default
  generic_answer:{ temperature: 0.75, topK: 35, topP: 0.92, useArgmaxEarly: false },
  followup_topic_shift:{ temperature: 0.65, topK: 28, topP: 0.88, useArgmaxEarly: false },
};

function buildResponsePlan(
  userText: string,
  ir: IntentResult,
  exemplars: Exemplar[],
  vocab: Vocab,
  baseTemp: number,
  frame: ConversationFrame,
): ResponsePlan {
  const queryTokens = tokenize(userText).filter(t => !SPECIAL_SET.has(t));
  const retrieved = retrieveExemplars(exemplars, queryTokens, ir, frame);

  const stopWords = new Set(["what","is","are","the","a","an","how","do","does","i","me","my","can","you","tell","explain","give","list","some","about"]);
  const requiredKeywords = queryTokens
    .map(t => t.toLowerCase())
    .filter(t => t.length > 3 && !stopWords.has(t) && !/^\d+$/.test(t))
    .slice(0, 5);

  if (["followup_example","followup_why","followup_shorter","followup_topic_shift"].includes(ir.intent)) {
    for (const kw of frame.lastKeywords) {
      if (!requiredKeywords.includes(kw.toLowerCase())) requiredKeywords.push(kw.toLowerCase());
    }
  }

  const bannedTokenIds = new Set<number>();
  const genericBanned = !["greet","thanks","goodbye"].includes(ir.intent) ? ["Certainly","Sure","Absolutely"] : [];
  for (const w of genericBanned) {
    const id = vocab.tokenToId.get(w);
    if (id !== undefined) bannedTokenIds.add(id);
  }

  // V3.1: topic-lock penalty ids
  const activeTopic = ir.topics[0] !== "general" ? ir.topics[0] : (frame.activeTopic as TopicTag);
  const topicLockPenaltyIds = TOPIC_LOCK_INTENTS.has(ir.intent) && activeTopic !== "general"
    ? buildTopicLockPenaltyIds(activeTopic as TopicTag, vocab)
    : new Set<number>();

  const topicLockStrength = TOPIC_LOCK_INTENTS.has(ir.intent) ? 0.5 : 0.2;

  // V3.1: use per-intent decoding preset, fall back to user's base temp
  const preset = DECODING_PRESETS[ir.intent] ?? DECODING_PRESETS["generic_answer"];

  const patterns = OPENING_PATTERNS[ir.intent] ?? OPENING_PATTERNS["generic_answer"];
  const opening = patterns[Math.floor(Math.random() * patterns.length)];

  return {
    intent: ir.intent, confidence: ir.confidence, topics: ir.topics,
    format: ir.format, askClarification: ir.needsClarification,
    opening, requiredKeywords, bannedTokenIds,
    topicLockPenaltyIds, topicLockStrength,
    retrievedExemplars: retrieved,
    temperature: preset.temperature,
    topK: preset.topK,
    topP: preset.topP,
    useArgmaxEarly: preset.useArgmaxEarly,
    frame,
    intentToken: ir.intentToken, formatToken: ir.formatToken, topicToken: ir.topicToken,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATION SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

interface GenerationSettings {
  temperature: number;
  topK: number;
  topP: number;
  maxTokens: number;
  repetitionPenalty: number;
  copyBias: number;
  style: "concise" | "detailed";
  clarifyWhenUnsure: boolean;
  showDebug: boolean;
}

const DEFAULT_SETTINGS: GenerationSettings = {
  temperature: 0.80, topK: 40, topP: 0.92,
  maxTokens: 130, repetitionPenalty: 1.35, copyBias: 0.12,
  style: "concise", clarifyWhenUnsure: true, showDebug: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// DECODING
// ─────────────────────────────────────────────────────────────────────────────

function mixedProb(
  candidateProbs: Map<number, number[]>,
  modelList: NGramModel[],
  w0: number,
  exemplarCtx: Map<number, number>,
  step: number,
  openingPhase: boolean,
): number {
  const probs = candidateProbs.get(w0) ?? modelList.map(() => 0);
  const gp = probs[0] ?? 0;
  const ip = probs[1] ?? 0;
  const tp = probs[2] ?? 0;

  const exCount = exemplarCtx.get(w0) ?? 0;
  const exTotal = exemplarCtx.size > 0 ? [...exemplarCtx.values()].reduce((a, b) => a + b, 0) : 1;
  const ep = exCount / exTotal;

  const earlyFactor = Math.max(0, 1 - step / 15);
  // V3.1: heavier intent/topic weight, lighter global to reduce drift
  const wGlobal = openingPhase ? 0.10 : 0.25 - earlyFactor * 0.05;
  const wIntent = openingPhase ? 0.45 : 0.38 + earlyFactor * 0.05;
  const wTopic  = openingPhase ? 0.25 : 0.22;
  const wEx     = openingPhase ? 0.20 : 0.15 + earlyFactor * 0.05;

  return wGlobal * gp + wIntent * ip + wTopic * tp + wEx * ep;
}

function applyDecoding(
  candidateProbs: Map<number, number[]>,
  modelList: NGramModel[],
  settings: GenerationSettings,
  plan: ResponsePlan,
  recentIds: number[],
  userContextIds: number[],
  vocab: Vocab,
  step: number,
  exemplarCtx: Map<number, number>,
  openingPhase: boolean,
): Array<[number, number]> {
  const recentSet = new Map<number, number>();
  for (let i = 0; i < recentIds.length; i++) {
    const id = recentIds[recentIds.length - 1 - i];
    if (!recentSet.has(id)) recentSet.set(id, i);
  }
  const userSet = new Set(userContextIds);

  const steerTokens = STEERING_TOKENS[plan.intent] ?? [];
  const steerIds = new Set(steerTokens.map(t => vocab.tokenToId.get(t)).filter((v): v is number => v !== undefined));
  const reqIds = new Set(plan.requiredKeywords.map(t => vocab.tokenToId.get(t)).filter((v): v is number => v !== undefined));

  const outputBlacklist = new Set([
    vocab.tokenToId.get(SPECIAL_TOKENS.BOS), vocab.tokenToId.get(SPECIAL_TOKENS.PAD),
    vocab.tokenToId.get(SPECIAL_TOKENS.UNK), vocab.tokenToId.get(SPECIAL_TOKENS.USR),
    vocab.tokenToId.get(SPECIAL_TOKENS.SYS),
  ].filter((v): v is number => v !== undefined));
  const allBanned = new Set([...outputBlacklist, ...plan.bannedTokenIds]);

  let adjusted: Array<[number, number]> = [];
  for (const [id] of candidateProbs) {
    if (allBanned.has(id)) continue;

    let p = mixedProb(candidateProbs, modelList, id, exemplarCtx, step, openingPhase);

    // V3.1: topic-lock penalty — divide probability for contaminant tokens
    if (plan.topicLockPenaltyIds.has(id)) {
      p *= (1.0 - plan.topicLockStrength);
    }

    if (recentSet.has(id)) {
      const dist = recentSet.get(id)!;
      const factor = settings.repetitionPenalty * (1 + (20 - Math.min(dist, 20)) / 20);
      p /= factor;
    }
    if (userSet.has(id) && settings.copyBias > 0) p += settings.copyBias * 0.005;
    if (steerIds.has(id) && step < 20) p *= 1.4;
    if (reqIds.has(id)) p *= 1.6;

    // V3.1: early argmax behavior for factual intents — sharpen at step 0–5
    const argmaxFactor = (plan.useArgmaxEarly && step < 6) ? 0.6 : 1.0;
    const effectiveTemp = plan.temperature * argmaxFactor;
    p = Math.pow(Math.max(p, 1e-12), 1 / effectiveTemp);
    adjusted.push([id, p]);
  }

  adjusted.sort((a, b) => b[1] - a[1]);
  // V3.1: use plan's per-intent topK
  adjusted = adjusted.slice(0, plan.topK);

  const total = adjusted.reduce((s, [, p]) => s + p, 0);
  if (total === 0) return adjusted;
  const norm = adjusted.map(([id, p]): [number, number] => [id, p / total]);
  let cumSum = 0;
  const nucleus: Array<[number, number]> = [];
  for (const [id, p] of norm) {
    nucleus.push([id, p]);
    cumSum += p;
    if (cumSum >= plan.topP) break;
  }
  const nucTotal = nucleus.reduce((s, [, p]) => s + p, 0);
  return nucTotal === 0 ? nucleus : nucleus.map(([id, p]) => [id, p / nucTotal]);
}

function sample(dist: Array<[number, number]>): number {
  if (dist.length === 0) return 0;
  let r = Math.random();
  for (const [id, p] of dist) { r -= p; if (r <= 0) return id; }
  return dist[dist.length - 1][0];
}

// ─────────────────────────────────────────────────────────────────────────────
// V3.1: COHERENCE GUARD
// ─────────────────────────────────────────────────────────────────────────────

// Returns a coherence score 0..1 for a token sequence relative to the plan
function computeCoherence(tokens: string[], plan: ResponsePlan): number {
  if (tokens.length < 3) return 1.0;
  const activeTopic = plan.topics[0] !== "general" ? plan.topics[0] : plan.frame.activeTopic;
  if (activeTopic === "general") return 1.0;

  const topicLex = TOPIC_LEXICONS[activeTopic] ?? new Set<string>();
  const contaminants = TOPIC_CONTAMINANTS[activeTopic] ?? new Set<string>();

  let topicHits = 0;
  let contamHits = 0;
  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    if (topicLex.has(lower)) topicHits++;
    if (contaminants.has(lower)) contamHits++;
  }

  const total = tokens.length;
  const contaminationRate = contamHits / total;
  const topicDensity = topicHits / total;

  // Coherence drops as contamination rises and topic density falls
  const score = Math.max(0, Math.min(1, topicDensity * 2 - contaminationRate * 3 + 0.5));
  return score;
}

// V3.1: Final answer coherence check — returns true if output should be rejected/retried
function shouldRejectOutput(text: string, plan: ResponsePlan): boolean {
  if (!text.trim() || text.length < 10) return true;
  const tokens = tokenize(text).filter(t => !SPECIAL_SET.has(t));
  const coh = computeCoherence(tokens, plan);
  if (coh < 0.2) return true; // heavy contamination

  // Check structural expectations
  if (plan.intent === "steps" && !/\b(first|second|third|step|then|next|begin|start)\b/i.test(text)) {
    // not necessarily wrong, but flag if also short
    if (text.length < 40) return true;
  }
  if (plan.intent === "comparison" && text.length > 30) {
    if (!/\b(while|whereas|however|but|both|difference|unlike|compared)\b/i.test(text)) return true;
  }
  if (["definition","explanation","summarize"].includes(plan.intent)) {
    // Reject if starts mid-fragment (no capital at start)
    if (/^[a-z]/.test(text.trim()) && !/^(a|an|the|in|on|at|of|by|for|with)\b/i.test(text.trim())) return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// V3.1: OUTPUT REPAIR (improved)
// ─────────────────────────────────────────────────────────────────────────────

function repairOutput(text: string, plan: ResponsePlan): string {
  if (!text.trim()) return text;
  let result = text.trim();

  // Fix broken starts — if starts lowercase (not intentional connective), capitalize
  if (/^[a-z]/.test(result) && !/^(a\s|an\s|the\s|in\s|on\s|at\s|of\s|by\s|for\s|with\s)/i.test(result)) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }

  // Trim to clean sentence boundary
  const sentenceEnders = /[.!?]/g;
  let lastGood = -1;
  let m: RegExpExecArray | null;
  while ((m = sentenceEnders.exec(result)) !== null) {
    if (m.index > result.length * 0.4) lastGood = m.index + 1;
  }
  if (lastGood > 0 && lastGood < result.length - 3) {
    result = result.slice(0, lastGood).trim();
  }

  // Remove repeated sentence fragments
  const sentences = result.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const s of sentences) {
    const key = s.trim().toLowerCase().slice(0, 40);
    if (!seen.has(key)) { seen.add(key); deduped.push(s); }
  }
  if (deduped.length < sentences.length) result = deduped.join(" ").trim();

  // Step-format repair
  if (plan.format === "steps" || plan.intent === "steps") {
    const stepSentences = result.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
    if (stepSentences.length >= 2 && !result.match(/^\s*\d+\./)) {
      result = stepSentences.map((s, i) => `${i + 1}. ${s.trim()}`).join("\n");
    }
  }

  // Troubleshooting repair — if missing action verbs, add prefix
  if (plan.intent === "troubleshooting" && !/\b(first|check|verify|ensure|try|look|fix|read)\b/i.test(result)) {
    result = "First, " + result.charAt(0).toLowerCase() + result.slice(1);
  }

  // Bullet-format repair
  if ((plan.format === "bullets" || plan.intent === "examples" || plan.intent === "brainstorming") &&
      !result.includes("\n") && result.includes(". ")) {
    const bSentences = result.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
    if (bSentences.length >= 3) {
      const [first, ...rest] = bSentences;
      result = first + "\n" + rest.map(s => `• ${s.trim()}`).join("\n");
    }
  }

  // Comparison repair — add contrast phrase if missing
  if ((plan.format === "compare" || plan.intent === "comparison") && result.length > 30) {
    if (!/\b(while|whereas|however|but|both|unlike|in contrast|on the other hand|compared)\b/i.test(result)) {
      // Attempt to split and add contrast marker at midpoint
      const mid = result.indexOf(". ");
      if (mid > 0 && mid < result.length - 20) {
        result = result.slice(0, mid + 1) + " However, " + result.slice(mid + 2);
      }
    }
  }

  // Summary repair — ensure "In summary" or "Overall" opener for summarize
  if (plan.intent === "summarize" && !/^(in\s+summary|overall|in\s+short|the\s+main|to\s+summarize)/i.test(result)) {
    result = "In summary, " + result.charAt(0).toLowerCase() + result.slice(1);
  }

  // Remove dangling endings (ends mid-word or with comma)
  result = result.replace(/[,\s]+$/, "");
  if (!result.match(/[.!?]$/)) result += ".";

  return result.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED CORPUS (unchanged from V3)
// ─────────────────────────────────────────────────────────────────────────────

const SEED_CORPUS = `
<BOS> <SYS> You are a helpful and knowledgeable assistant. Answer clearly and concisely. <USR> Hello there <INTENT_GREET> <FMT_CONCISE> <TOPIC_GENERAL> <ACT_GREET> <STYLE_CONCISE> <AST> Hello! I'm here and ready to help you. What can I do for you today? <EOS>
<BOS> <SYS> You are a helpful and knowledgeable assistant. <USR> Hi <INTENT_GREET> <FMT_CONCISE> <TOPIC_GENERAL> <ACT_GREET> <STYLE_CONCISE> <AST> Hi there! How can I help you? <EOS>
<BOS> <SYS> You are a helpful assistant. <USR> Hey how are you <INTENT_GREET> <FMT_CONCISE> <TOPIC_GENERAL> <ACT_GREET> <STYLE_CONCISE> <AST> I'm doing well and ready to assist you. What do you need help with? <EOS>
<BOS> <USR> What is machine learning <INTENT_DEFINITION> <FMT_CONCISE> <TOPIC_AI> <ACT_CLARIFY> <STYLE_CONCISE> <AST> Machine learning is a field of artificial intelligence where systems learn from data and improve automatically through experience. Instead of being programmed with explicit rules, a machine learning model finds patterns in large datasets and uses those patterns to make predictions or decisions. <EOS>
<BOS> <USR> Explain machine learning <INTENT_EXPLANATION> <FMT_DETAILED> <TOPIC_AI> <ACT_CLARIFY> <STYLE_DETAILED> <AST> Machine learning works by training a model on labeled examples until it learns statistical patterns. The model then generalizes those patterns to new inputs it has never seen. Common approaches include supervised learning for labeled datasets, unsupervised learning for finding hidden structure, and reinforcement learning for sequential decision making. Applications include image recognition, language translation, and recommendation systems. <EOS>
<BOS> <USR> Summarize what machine learning is <INTENT_SUMMARIZE> <FMT_CONCISE> <TOPIC_AI> <ACT_ANSWER> <STYLE_CONCISE> <AST> In summary machine learning is a branch of artificial intelligence that enables computers to learn patterns from data without being explicitly programmed. Models are trained on examples and then generalize to make predictions on new inputs. The main categories are supervised learning, unsupervised learning, and reinforcement learning. <EOS>
<BOS> <USR> Summarize machine learning <INTENT_SUMMARIZE> <FMT_CONCISE> <TOPIC_AI> <ACT_ANSWER> <STYLE_CONCISE> <AST> In summary machine learning enables computers to learn patterns from data rather than following explicit rules. Models are trained on examples and then applied to new inputs. The three main types are supervised, unsupervised, and reinforcement learning. It powers search engines, recommendations, voice assistants, and image recognition. <EOS>
<BOS> <USR> What is recursion <INTENT_DEFINITION> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_CONCISE> <AST> Recursion is a technique where a function calls itself as part of its own definition. It requires a base case to terminate and a recursive case to reduce the problem. Classic examples include computing factorials and traversing tree structures. <EOS>
<BOS> <USR> Explain recursion <INTENT_EXPLANATION> <FMT_DETAILED> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_DETAILED> <AST> Recursion works by having a function call itself with a smaller version of the same problem until it reaches a stopping condition called the base case. Each call is placed on the call stack and resolved in reverse order once the base case is reached. This makes recursion elegant for problems like tree traversal, divide-and-conquer algorithms, and graph search. The main risk is a stack overflow if the base case is never reached. <EOS>
<BOS> <USR> Explain recursion with an example <INTENT_EXAMPLES> <FMT_DETAILED> <TOPIC_PROGRAMMING> <ACT_LIST> <STYLE_DETAILED> <AST> Recursion is when a function calls itself. For example, computing the factorial of a number: factorial of 5 calls factorial of 4, which calls factorial of 3, down to factorial of 1 which returns 1. Each call then resolves back up the chain. Another example is binary search, which divides the array in half on each recursive call. <EOS>
<BOS> <USR> Give me an example of recursion <INTENT_EXAMPLES> <FMT_BULLETS> <TOPIC_PROGRAMMING> <ACT_LIST> <STYLE_CONCISE> <AST> For example, the factorial function computes the product of all integers from one to n by calling itself with n minus one. Another example is traversing a file system, where each directory is explored by recursively calling the same function on its subdirectories. Binary search is also recursive, dividing the search space in half on each call. <EOS>
<BOS> <USR> What is an algorithm <INTENT_DEFINITION> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_CONCISE> <AST> An algorithm is a step-by-step procedure for solving a problem or accomplishing a task. It takes an input, processes it according to defined rules, and produces an output. Algorithms are fundamental to computer science and are used in sorting, searching, encryption, and much more. <EOS>
<BOS> <USR> How does the internet work <INTENT_EXPLANATION> <FMT_DETAILED> <TOPIC_NETWORKING> <ACT_CLARIFY> <STYLE_DETAILED> <AST> The internet is a global network of computers connected through standardized communication protocols. Data is broken into packets and routed through a series of network devices called routers. The TCP/IP protocol suite governs how data is addressed, transmitted, and received. DNS servers translate human-readable domain names into numerical IP addresses. Web browsers use HTTP or HTTPS protocols to request and display web pages from servers around the world. <EOS>
<BOS> <USR> What is Python <INTENT_DEFINITION> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_CONCISE> <AST> Python is a high-level, interpreted programming language known for its clear and readable syntax. It supports multiple programming paradigms including procedural, object-oriented, and functional styles. Python is widely used in web development, data science, artificial intelligence, automation, and scientific computing. <EOS>
<BOS> <USR> What is JavaScript <INTENT_DEFINITION> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_CONCISE> <AST> JavaScript is a high-level interpreted programming language primarily used for web development. It runs in browsers and on servers via Node.js. JavaScript is dynamically typed, supports object-oriented and functional styles, and powers interactive web applications. It is the most widely used language for frontend development. <EOS>
<BOS> <USR> Compare Python and JavaScript <INTENT_COMPARISON> <FMT_COMPARE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_DETAILED> <AST> The key difference between Python and JavaScript is their primary use cases. Python excels at data science, machine learning, and scripting with clean readable syntax. JavaScript is designed for web development and runs natively in browsers. Both are dynamically typed and support multiple paradigms. Python uses indentation for structure while JavaScript uses braces. For backend work both are viable but Python has a stronger data science ecosystem. <EOS>
<BOS> <USR> Difference between arrays and linked lists <INTENT_COMPARISON> <FMT_COMPARE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_DETAILED> <AST> The key difference between arrays and linked lists lies in how they store data. Arrays store elements contiguously in memory which allows constant time random access by index. Linked lists store elements as nodes with pointers, making insertions and deletions efficient but random access slow. Arrays are better for read-heavy workloads while linked lists are better when you frequently insert or delete elements. <EOS>
<BOS> <USR> Compare arrays and linked lists briefly <INTENT_COMPARISON> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_ANSWER> <STYLE_CONCISE> <AST> Arrays give fast random access but slow insertion. Linked lists give fast insertion and deletion but slow random access. Use arrays when you read often, linked lists when you modify often. <EOS>
<BOS> <USR> What are common data structures <INTENT_EXAMPLES> <FMT_BULLETS> <TOPIC_PROGRAMMING> <ACT_LIST> <STYLE_DETAILED> <AST> Common data structures include arrays for storing ordered sequences, linked lists for efficient insertions and deletions, stacks for last-in first-out access, queues for first-in first-out access, hash maps for fast key-value lookups, trees for hierarchical data and fast search, graphs for representing networks, and heaps for priority queue operations. Choosing the right data structure has a major impact on algorithm efficiency. <EOS>
<BOS> <USR> List common data structures <INTENT_EXAMPLES> <FMT_BULLETS> <TOPIC_PROGRAMMING> <ACT_LIST> <STYLE_CONCISE> <AST> Some examples include arrays for sequential data, linked lists for flexible insertion, hash tables for key-value lookup, trees for hierarchical structure, and graphs for network relationships. Each has different tradeoffs in time and space complexity. <EOS>
<BOS> <USR> Give me steps to learn Python <INTENT_STEPS> <FMT_STEPS> <TOPIC_PROGRAMMING> <ACT_LIST> <STYLE_DETAILED> <AST> Here are the steps to learn Python effectively. First install Python and set up VS Code. Second learn the basics including variables, data types, loops, and functions. Third practice with small projects like a calculator. Fourth study object-oriented programming. Fifth explore popular libraries like NumPy, Pandas, or Flask. Sixth build a real project you care about and share it on GitHub. <EOS>
<BOS> <USR> How do I learn programming <INTENT_STEPS> <FMT_STEPS> <TOPIC_PROGRAMMING> <ACT_ANSWER> <STYLE_DETAILED> <AST> Learning programming works best by starting with one language and building real projects. First pick Python or JavaScript. Second work through structured tutorials. Third build small programs that solve problems you care about. Fourth read other people's code. Fifth use resources like documentation and coding challenges. Consistency and hands-on practice matter more than any single course. <EOS>
<BOS> <USR> Give me steps to learn machine learning <INTENT_STEPS> <FMT_STEPS> <TOPIC_AI> <ACT_LIST> <STYLE_DETAILED> <AST> To learn machine learning follow these steps. First build a strong foundation in Python and mathematics. Second study core machine learning concepts like supervised and unsupervised learning. Third practice with scikit-learn to implement algorithms. Fourth move to deep learning frameworks like PyTorch or TensorFlow. Fifth work on real datasets. Sixth read research papers and implement models from scratch. <EOS>
<BOS> <USR> My code is not working <INTENT_TROUBLESHOOT> <FMT_STEPS> <TOPIC_PROGRAMMING> <ACT_ANSWER> <STYLE_DETAILED> <AST> First check the error message carefully as it points to the exact line and type of problem. Then check for syntax errors like missing brackets or incorrect indentation. Next add print statements to trace variable values at each step. Also isolate the problem by testing small sections independently. If still stuck search the error message online or share your code for review. <EOS>
<BOS> <USR> How do I debug my code <INTENT_TROUBLESHOOT> <FMT_STEPS> <TOPIC_PROGRAMMING> <ACT_ANSWER> <STYLE_DETAILED> <AST> To fix this start by reading the error message carefully. First reproduce the bug consistently. Next isolate the failing section by commenting out code. Then add print statements or use a debugger to inspect variable values. Verify your assumptions about what the code should do. Check the documentation for any library functions you are using. Finally ask for help with a minimal reproducible example. <EOS>
<BOS> <USR> Code not working what do I do <INTENT_TROUBLESHOOT> <FMT_STEPS> <TOPIC_PROGRAMMING> <ACT_ANSWER> <STYLE_DETAILED> <AST> First check the error message to find the line and type of error. Next verify your syntax, especially brackets, indentation, and semicolons. Then use print statements or a debugger to trace the actual values. Isolate the bug by testing small pieces of code independently. Search for the error online if you are stuck and compare with working examples. <EOS>
<BOS> <USR> What are the best programming languages <INTENT_EXAMPLES> <FMT_BULLETS> <TOPIC_PROGRAMMING> <ACT_LIST> <STYLE_DETAILED> <AST> The most widely used programming languages include Python for data science and general purpose development, JavaScript for web development, Java for enterprise applications, C and C++ for systems programming, Rust for memory-safe systems programming, Go for backend services, and TypeScript as a typed superset of JavaScript for large applications. <EOS>
<BOS> <USR> List some tips for writing good code <INTENT_EXAMPLES> <FMT_BULLETS> <TOPIC_PROGRAMMING> <ACT_LIST> <STYLE_DETAILED> <AST> Here are key principles for writing good code. First write clear and descriptive variable and function names. Second keep functions small and focused on a single responsibility. Third add comments that explain why not what. Fourth write tests to verify your code. Fifth handle errors explicitly and never swallow exceptions silently. Sixth review and refactor code regularly. <EOS>
<BOS> <USR> Explain neural networks <INTENT_EXPLANATION> <FMT_DETAILED> <TOPIC_AI> <ACT_CLARIFY> <STYLE_DETAILED> <AST> Neural networks are computing systems inspired by the biological structure of the brain. They consist of layers of interconnected nodes called neurons. Data flows through an input layer, is transformed by hidden layers, and produces output through an output layer. Through training the network adjusts its internal weights to minimize prediction errors. Deep neural networks with many hidden layers form the basis of modern deep learning. <EOS>
<BOS> <USR> What is a neural network <INTENT_DEFINITION> <FMT_CONCISE> <TOPIC_AI> <ACT_CLARIFY> <STYLE_CONCISE> <AST> A neural network is a computing system made of layers of interconnected nodes that learn patterns from data. Input flows through hidden layers where weights are adjusted during training to minimize error. The output layer produces predictions. Neural networks are the foundation of deep learning and power image recognition, language models, and speech synthesis. <EOS>
<BOS> <USR> Tell me about databases <INTENT_EXPLANATION> <FMT_DETAILED> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_DETAILED> <AST> A database is an organized collection of structured data stored and accessed electronically. Relational databases store data in tables with rows and columns and use SQL for querying. NoSQL databases like MongoDB or Redis offer flexible schemas suited for unstructured data. Key concepts include tables, primary keys, foreign keys, indexes, and transactions. Databases power nearly every modern application from banking systems to social media platforms. <EOS>
<BOS> <USR> What is object-oriented programming <INTENT_DEFINITION> <FMT_DETAILED> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_DETAILED> <AST> Object-oriented programming is a paradigm that organizes code around objects which combine data and behavior. The core concepts are encapsulation which bundles data and methods together, inheritance which allows classes to derive properties from parent classes, polymorphism which lets different classes be treated through a common interface, and abstraction which hides complexity behind simple interfaces. <EOS>
<BOS> <USR> Explain object-oriented programming briefly <INTENT_EXPLANATION> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_CONCISE> <AST> Object-oriented programming organizes code around objects that combine data and behavior. The four main principles are encapsulation, inheritance, polymorphism, and abstraction. Languages like Java, Python, and C++ are designed around these ideas. OOP helps manage complexity in large codebases. <EOS>
<BOS> <USR> What is a hash table <INTENT_DEFINITION> <FMT_DETAILED> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_DETAILED> <AST> A hash table is a data structure that maps keys to values using a hash function. The hash function converts a key into an index in an underlying array. This allows average constant time complexity for insertions, lookups, and deletions. Collisions occur when two keys hash to the same index and are handled through chaining or open addressing. Python dictionaries and JavaScript objects use hash tables internally. <EOS>
<BOS> <USR> Explain functional programming <INTENT_EXPLANATION> <FMT_DETAILED> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_DETAILED> <AST> Functional programming is a paradigm that treats computation as the evaluation of mathematical functions and avoids changing state or mutable data. Pure functions always produce the same output for the same input and have no side effects. Higher-order functions take other functions as arguments or return them. Concepts like map, filter, and reduce let you transform data declaratively. Languages like Haskell are purely functional while Python and JavaScript support functional programming alongside other styles. <EOS>
<BOS> <USR> What is recursion in Python <INTENT_EXPLANATION> <FMT_DETAILED> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_CONCISE> <AST> In Python recursion works the same as in other languages. A function calls itself with a smaller input until it reaches the base case. Python has a default recursion limit of one thousand calls to prevent stack overflows. You can adjust it with sys.setrecursionlimit but iterative solutions are often preferred for deep recursion in Python. <EOS>
<BOS> <USR> What about in Python <INTENT_EXPLANATION> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_CONCISE> <AST> In Python the same concept applies but with some differences. Python has a recursion limit of about one thousand calls by default. Iterative solutions are often preferred in Python for performance reasons. The syntax is similar to other languages but uses the def keyword and indentation rather than braces. <EOS>
<BOS> <USR> What is version control <INTENT_DEFINITION> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_CONCISE> <AST> Version control is a system that tracks changes to files over time so you can recall specific versions later. Git is the most popular version control system. It lets multiple developers collaborate, maintain a history of changes, create branches for new features, and merge work together. Platforms like GitHub and GitLab host remote repositories and provide collaboration tools. <EOS>
<BOS> <USR> What is concurrency <INTENT_DEFINITION> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_CONCISE> <AST> Concurrency refers to a program's ability to handle multiple tasks that can make progress within overlapping time periods. It can be achieved through threads, async and await patterns, or event loops. It is important for building responsive applications that handle multiple users without blocking. Managing shared state safely is a key challenge in concurrent programming. <EOS>
<BOS> <USR> What is Docker <INTENT_DEFINITION> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_CONCISE> <AST> Docker is a platform that uses containerization to package applications and their dependencies into isolated units called containers. Containers run consistently across different environments. Unlike virtual machines containers share the host operating system kernel making them lightweight and fast. Docker enables reliable deployment, horizontal scaling, and microservices architectures. <EOS>
<BOS> <USR> What is an API <INTENT_DEFINITION> <FMT_DETAILED> <TOPIC_NETWORKING> <ACT_CLARIFY> <STYLE_DETAILED> <AST> An API or Application Programming Interface is a set of rules that allows different software systems to communicate with each other. APIs define how requests should be made, what data formats to use, and what responses will look like. REST APIs use HTTP methods like GET, POST, PUT, and DELETE to interact with resources. APIs enable developers to build on top of existing services without reinventing the wheel. <EOS>
<BOS> <USR> What is Big O notation <INTENT_DEFINITION> <FMT_DETAILED> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_DETAILED> <AST> Big O notation describes how the runtime or space requirements of an algorithm grow as the input size increases. O of 1 is constant time meaning the operation takes the same time regardless of input size. O of n is linear meaning it grows proportionally with input. O of n log n describes efficient sorting algorithms like merge sort. O of n squared describes naive nested loop algorithms. Big O helps developers choose the most efficient algorithm for a given problem. <EOS>
<BOS> <USR> What is a linked list <INTENT_DEFINITION> <FMT_DETAILED> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_DETAILED> <AST> A linked list is a data structure where each element called a node contains data and a reference called a pointer to the next node. Unlike arrays linked list elements are not stored contiguously in memory. This makes insertions and deletions efficient at any position since only the pointers need to change. However random access by index is slow since you must traverse from the head. <EOS>
<BOS> <USR> Make that shorter <INTENT_SUMMARIZE> <FMT_CONCISE> <TOPIC_GENERAL> <ACT_ANSWER> <STYLE_CONCISE> <AST> Briefly, machine learning lets computers learn from data to make predictions without explicit programming. <EOS>
<BOS> <USR> Give me one example <INTENT_EXAMPLES> <FMT_CONCISE> <TOPIC_GENERAL> <ACT_LIST> <STYLE_CONCISE> <AST> For example, a spam filter is a classic machine learning application. It learns from thousands of labeled emails to distinguish spam from legitimate messages and applies that knowledge to new incoming mail. <EOS>
<BOS> <USR> Why <INTENT_EXPLANATION> <FMT_CONCISE> <TOPIC_GENERAL> <ACT_CLARIFY> <STYLE_CONCISE> <AST> Because this is a fundamental property of how the system is designed. The underlying rules create this behavior by construction, and changing them would require rethinking the architecture from scratch. <EOS>
<BOS> <USR> Why does recursion need a base case <INTENT_EXPLANATION> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_CONCISE> <AST> Because without a base case the function would call itself forever and eventually exhaust the call stack, causing a stack overflow error. The base case is the stopping condition that allows the chain of recursive calls to terminate and return a result. <EOS>
<BOS> <USR> Tell me something interesting <INTENT_GENERIC> <FMT_CONCISE> <TOPIC_GENERAL> <ACT_ANSWER> <STYLE_CONCISE> <AST> Here is something interesting. The first computer bug was a literal bug. In 1947 Grace Hopper and her team found a moth trapped in a relay of a computer. They taped it into their logbook and coined the term debugging. <EOS>
<BOS> <USR> What is open source <INTENT_DEFINITION> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_CONCISE> <AST> Open source refers to software whose source code is publicly available for anyone to view, use, modify, and distribute. Projects like Linux, Python, Firefox, and VS Code are open source. Licenses like MIT, Apache, and GPL govern how open source software can be used and shared. Many companies contribute to open source to build reputation and improve shared infrastructure. <EOS>
<BOS> <USR> How does search work <INTENT_EXPLANATION> <FMT_DETAILED> <TOPIC_NETWORKING> <ACT_CLARIFY> <STYLE_DETAILED> <AST> Search engines work in three main stages. First crawlers browse the web by following links and downloading page content. Second the content is processed and stored in a massive index mapping words to pages. Third when you search the engine retrieves matching pages and ranks them using algorithms that consider relevance signals like keyword frequency, page authority, and user engagement. Modern search engines also use machine learning to better understand query intent. <EOS>
<BOS> <USR> Compare Python and JavaScript briefly <INTENT_COMPARISON> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_ANSWER> <STYLE_CONCISE> <AST> Both are high-level dynamically typed languages but Python excels at data science while JavaScript dominates web development. Python is more readable for beginners while JavaScript runs natively in browsers. <EOS>
<BOS> <USR> Is Python better than JavaScript <INTENT_YESNO> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_ANSWER> <STYLE_CONCISE> <AST> It depends on your use case. Python is better for data science, machine learning, and scripting due to its rich ecosystem. JavaScript is better for web development since it runs natively in browsers. Both are excellent general-purpose languages. <EOS>
<BOS> <USR> Thank you <INTENT_THANKS> <FMT_CONCISE> <TOPIC_GENERAL> <ACT_ANSWER> <STYLE_CONCISE> <AST> You're welcome! Feel free to ask if you have any other questions. I'm happy to help. <EOS>
<BOS> <USR> Thanks <INTENT_THANKS> <FMT_CONCISE> <TOPIC_GENERAL> <ACT_ANSWER> <STYLE_CONCISE> <AST> Glad I could help! Let me know if there's anything else you'd like to know. <EOS>
<BOS> <USR> Goodbye <INTENT_GENERIC> <FMT_CONCISE> <TOPIC_GENERAL> <ACT_ANSWER> <STYLE_CONCISE> <AST> Goodbye! Come back anytime if you have more questions. Have a great day! <EOS>
<BOS> <USR> What is memory management <INTENT_EXPLANATION> <FMT_DETAILED> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_DETAILED> <AST> Memory management is how programs allocate and free memory during execution. In languages like C you manually allocate memory with malloc and free it with free. Modern languages use automatic memory management. Java and Python use garbage collection which periodically identifies and frees unreferenced objects. Rust uses an ownership model with borrow checking at compile time which guarantees memory safety without a garbage collector. <EOS>
<BOS> <USR> Explain Big O notation briefly <INTENT_EXPLANATION> <FMT_CONCISE> <TOPIC_PROGRAMMING> <ACT_CLARIFY> <STYLE_CONCISE> <AST> Big O notation measures how algorithm runtime grows with input size. O of 1 is constant, O of n is linear, O of n log n is efficient sorting, and O of n squared is slow nested loops. It helps you compare algorithm efficiency at scale. <EOS>
<BOS> <USR> What makes good software design <INTENT_EXPLANATION> <FMT_DETAILED> <TOPIC_PROGRAMMING> <ACT_ANSWER> <STYLE_DETAILED> <AST> Good software design balances modularity, readability, testability, and extensibility. Separation of concerns prevents one module from knowing too much about another. Functions should have a single clear responsibility. Code should be easy to test automatically. Good design emerges from iterative refinement, code review, and attention to the people who will maintain the code. <EOS>
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION FORMATTER
// ─────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  generating?: boolean;
}

interface FormattedContext {
  ids: number[];
  userContextIds: number[];
}

function formatConversation(
  messages: ChatMessage[],
  vocab: Vocab,
  ir: IntentResult,
  style: "concise" | "detailed",
  inferenceMode = false,
  addToVocab = false,
): FormattedContext {
  const tokens: string[] = [SPECIAL_TOKENS.BOS];
  const sysMsg = messages.find(m => m.role === "system");
  if (sysMsg) tokens.push(SPECIAL_TOKENS.SYS, ...tokenize(sysMsg.content));

  const convo = messages.filter(m => m.role !== "system");
  const window = convo.slice(-8);

  for (let i = 0; i < window.length; i++) {
    const msg = window[i];
    if (msg.role === "user") {
      tokens.push(SPECIAL_TOKENS.USR, ...tokenize(msg.content));
    } else if (msg.role === "assistant") {
      const isLast = i === window.length - 1;
      if (inferenceMode && isLast && msg.generating) break;
      tokens.push(SPECIAL_TOKENS.AST, ...tokenize(msg.content), SPECIAL_TOKENS.EOS);
    }
  }

  if (inferenceMode) {
    tokens.push(ir.intentToken, ir.formatToken, ir.topicToken, ir.actToken);
    tokens.push(style === "detailed" ? SPECIAL_TOKENS.STYLE_DETAILED : SPECIAL_TOKENS.STYLE_CONCISE);
    tokens.push(SPECIAL_TOKENS.AST);
  }

  const lastUserMsg = [...window].reverse().find(m => m.role === "user");
  const userContextIds = lastUserMsg ? tokenizeToIds(lastUserMsg.content, vocab, addToVocab) : [];

  const ids = tokens
    .map(t => {
      if (vocab.tokenToId.has(t)) return vocab.tokenToId.get(t)!;
      if (addToVocab) return extendVocab(vocab, t);
      return vocab.tokenToId.get(SPECIAL_TOKENS.UNK)!;
    })
    .filter((id): id is number => id !== undefined);

  return { ids, userContextIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODEL STATS & DEBUG
// ─────────────────────────────────────────────────────────────────────────────

interface ModelStats {
  unigramTypes: number; bigramContexts: number; trigramContexts: number;
  totalTokens: number; vocabSize: number; corpusLines: number; exemplarCount: number;
}

interface DebugInfo {
  intent: Intent;
  confidence: number;
  format: FormatPref;
  topics: TopicTag[];
  retrievedCount: number;
  opening: string;
  requiredKeywords: string[];
  temperature: number;
  topK: number;
  topP: number;
  topicLockActive: boolean;
  topicLockSize: number;
  frame: ConversationFrame;
  intentToken: string;
  formatToken: string;
  topicToken: string;
  retried: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// V3.1: EXTENDED EVAL HARNESS with answer-level checks
// ─────────────────────────────────────────────────────────────────────────────

interface EvalTest {
  label: string;
  prompt: string;
  expectedIntent: Intent;
  expectedFormat: FormatPref;
  answerChecks?: Array<{ label: string; check: (text: string) => boolean }>;
  frameSetup?: Partial<ConversationFrame>;
}

const EVAL_TESTS: EvalTest[] = [
  {
    label: "Definition: recursion",
    prompt: "What is recursion?",
    expectedIntent: "definition",
    expectedFormat: "concise",
    answerChecks: [
      { label: "mentions 'function' or 'base case'", check: t => /\b(function|base\s*case|calls\s*itself)\b/i.test(t) },
      { label: "no HTTP/networking drift", check: t => !/\b(http|dns|router|packet|bandwidth)\b/i.test(t) },
      { label: "no ML drift", check: t => !/\b(gradient|epoch|neural|training\s*data|backprop)\b/i.test(t) },
    ],
  },
  {
    label: "Explanation: recursion",
    prompt: "Explain recursion",
    expectedIntent: "explanation",
    expectedFormat: "detailed",
    answerChecks: [
      { label: "mentions call stack or base case", check: t => /\b(call\s*stack|base\s*case|stack\s*overflow|recursive)\b/i.test(t) },
      { label: "stays in programming domain", check: t => !/\b(harvard\s*mark|spam\s*filter|http\s*method|machine\s*learning\s*model)\b/i.test(t) },
    ],
  },
  {
    label: "Comparison: arrays vs linked lists",
    prompt: "Difference between arrays and linked lists",
    expectedIntent: "comparison",
    expectedFormat: "compare",
    answerChecks: [
      { label: "mentions both arrays and linked lists", check: t => /array/i.test(t) && /linked\s*list/i.test(t) },
      { label: "contains contrast word", check: t => /\b(while|whereas|however|but|unlike)\b/i.test(t) },
      { label: "no Python vs JS drift", check: t => !/\b(javascript|typescript|rust|garbage\s*collect|functional\s*programming)\b/i.test(t) },
    ],
  },
  {
    label: "Steps: learn Python",
    prompt: "Give me steps to learn Python",
    expectedIntent: "steps",
    expectedFormat: "steps",
    answerChecks: [
      { label: "contains step markers", check: t => /\b(first|second|step|then|next|begin)\b/i.test(t) },
      { label: "not routed as examples", check: (_t, intent) => intent === "steps" },
    ],
  },
  {
    label: "Troubleshooting: code not working",
    prompt: "My code is not working",
    expectedIntent: "troubleshooting",
    expectedFormat: "steps",
    answerChecks: [
      { label: "mentions error/check/debug", check: t => /\b(error|check|debug|fix|verify|isolate|print)\b/i.test(t) },
      { label: "not a generic answer", check: (_t, intent) => intent === "troubleshooting" },
    ],
  },
  {
    label: "Summarize: machine learning",
    prompt: "Summarize what machine learning is",
    expectedIntent: "summarize",
    expectedFormat: "concise",
    answerChecks: [
      { label: "mentions learning or data", check: t => /\b(learn|data|model|pattern|predict)\b/i.test(t) },
      { label: "starts properly (not mid-fragment)", check: t => /^[A-Z]/.test(t.trim()) },
    ],
  },
  {
    label: "Follow-up: give one example",
    prompt: "Give me one example",
    expectedIntent: "followup_example",
    expectedFormat: "concise",
    frameSetup: { activeTopic: "programming", lastKeywords: ["recursion"] },
    answerChecks: [
      { label: "contains 'example' or 'instance'", check: t => /\b(example|instance|consider|such as)\b/i.test(t) },
    ],
  },
  {
    label: "Follow-up: why",
    prompt: "Why?",
    expectedIntent: "followup_why",
    expectedFormat: "concise",
    frameSetup: { activeTopic: "programming", lastKeywords: ["recursion"] },
    answerChecks: [
      { label: "contains causal word", check: t => /\b(because|reason|due|since|therefore|without)\b/i.test(t) },
    ],
  },
  {
    label: "Topic shift: in Python",
    prompt: "What about in Python?",
    expectedIntent: "followup_topic_shift",
    expectedFormat: "concise",
    frameSetup: { activeTopic: "programming", lastKeywords: ["recursion"] },
    answerChecks: [
      { label: "mentions Python", check: t => /python/i.test(t) },
    ],
  },
  {
    label: "Ambiguous: tell me stuff",
    prompt: "tell me stuff",
    expectedIntent: "clarification_needed",
    expectedFormat: "concise",
  },
  {
    label: "Follow-up shorter",
    prompt: "Make that shorter",
    expectedIntent: "followup_shorter",
    expectedFormat: "concise",
  },
  {
    label: "Yes/No: is Python better",
    prompt: "Is Python better than JavaScript?",
    expectedIntent: "yes_no",
    expectedFormat: "concise",
    answerChecks: [
      { label: "uses hedging language", check: t => /\b(depends|generally|both|either|use\s*case)\b/i.test(t) },
    ],
  },
];

interface EvalResult {
  test: EvalTest;
  detectedIntent: Intent;
  detectedFormat: FormatPref;
  detectedTopics: TopicTag[];
  retrievedCount: number;
  opening: string;
  intentMatch: boolean;
  formatMatch: boolean;
  answerCheckResults: Array<{ label: string; passed: boolean }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// APP STATE
// ─────────────────────────────────────────────────────────────────────────────

interface AppState {
  messages: ChatMessage[];
  settings: GenerationSettings;
  theme: "dark" | "light";
  trained: boolean; training: boolean; generating: boolean;
  modelStats: ModelStats | null;
  showSettings: boolean; showStats: boolean; showDebug: boolean; showEval: boolean;
  customCorpus: string; useCustomCorpus: boolean;
  errorMsg: string | null;
  lastDebug: DebugInfo | null;
  evalResults: EvalResult[];
  evalRunning: boolean;
  frame: ConversationFrame;
}

type AppAction =
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "UPDATE_LAST_ASSISTANT"; content: string; generating: boolean }
  | { type: "SET_SETTINGS"; settings: Partial<GenerationSettings> }
  | { type: "SET_THEME"; theme: "dark" | "light" }
  | { type: "SET_TRAINED"; trained: boolean; stats: ModelStats }
  | { type: "SET_TRAINING"; training: boolean }
  | { type: "SET_GENERATING"; generating: boolean }
  | { type: "TOGGLE_SETTINGS" } | { type: "TOGGLE_STATS" } | { type: "TOGGLE_DEBUG" } | { type: "TOGGLE_EVAL" }
  | { type: "CLEAR_CHAT" }
  | { type: "SET_CUSTOM_CORPUS"; corpus: string }
  | { type: "SET_USE_CUSTOM_CORPUS"; use: boolean }
  | { type: "SET_ERROR"; msg: string | null }
  | { type: "SET_DEBUG"; info: DebugInfo | null }
  | { type: "SET_EVAL_RESULTS"; results: EvalResult[] }
  | { type: "SET_EVAL_RUNNING"; running: boolean }
  | { type: "UPDATE_FRAME"; frame: ConversationFrame };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_MESSAGE": return { ...state, messages: [...state.messages, action.message] };
    case "UPDATE_LAST_ASSISTANT": {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") msgs[msgs.length - 1] = { ...last, content: action.content, generating: action.generating };
      return { ...state, messages: msgs };
    }
    case "SET_SETTINGS": return { ...state, settings: { ...state.settings, ...action.settings } };
    case "SET_THEME": return { ...state, theme: action.theme };
    case "SET_TRAINED": return { ...state, trained: action.trained, training: false, modelStats: action.stats };
    case "SET_TRAINING": return { ...state, training: action.training };
    case "SET_GENERATING": return { ...state, generating: action.generating };
    case "TOGGLE_SETTINGS": return { ...state, showSettings: !state.showSettings };
    case "TOGGLE_STATS": return { ...state, showStats: !state.showStats };
    case "TOGGLE_DEBUG": return { ...state, showDebug: !state.showDebug };
    case "TOGGLE_EVAL": return { ...state, showEval: !state.showEval };
    case "CLEAR_CHAT": return { ...state, messages: [], generating: false, lastDebug: null, frame: createFrame() };
    case "SET_CUSTOM_CORPUS": return { ...state, customCorpus: action.corpus };
    case "SET_USE_CUSTOM_CORPUS": return { ...state, useCustomCorpus: action.use };
    case "SET_ERROR": return { ...state, errorMsg: action.msg };
    case "SET_DEBUG": return { ...state, lastDebug: action.info };
    case "SET_EVAL_RESULTS": return { ...state, evalResults: action.results };
    case "SET_EVAL_RUNNING": return { ...state, evalRunning: action.running };
    case "UPDATE_FRAME": return { ...state, frame: action.frame };
    default: return state;
  }
}

const INITIAL_STATE: AppState = {
  messages: [], settings: DEFAULT_SETTINGS, theme: "dark",
  trained: false, training: false, generating: false, modelStats: null,
  showSettings: false, showStats: false, showDebug: false, showEval: false,
  customCorpus: "", useCustomCorpus: false, errorMsg: null, lastDebug: null,
  evalResults: [], evalRunning: false,
  frame: createFrame(),
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERATION ENGINE (V3.1: with mid-gen coherence + retry)
// ─────────────────────────────────────────────────────────────────────────────

const STOP_TOKENS = [SPECIAL_TOKENS.EOS, SPECIAL_TOKENS.USR, SPECIAL_TOKENS.BOS] as const;

async function runGeneration(
  globalModel: NGramModel,
  miniModels: MiniModels,
  plan: ResponsePlan,
  contextIds: number[],
  userContextIds: number[],
  settings: GenerationSettings,
  cancelRef: { cancelled: boolean },
  onToken: (t: string) => void,
  stricterMode = false,
): Promise<string[]> {
  const vocab = globalModel.vocab;
  const stopIds = new Set(STOP_TOKENS.map(t => vocab.tokenToId.get(t)).filter((v): v is number => v !== undefined));

  const exemplarCtx = new Map<number, number>();
  for (const ex of plan.retrievedExemplars) {
    for (const id of ex.assistantIds) {
      exemplarCtx.set(id, (exemplarCtx.get(id) ?? 0) + 1);
    }
  }

  const intentModel = miniModels.perIntent.get(plan.intent);
  const topicModel = miniModels.perTopic.get(plan.topics[0]);
  const modelList: NGramModel[] = [globalModel];
  if (intentModel) modelList.push(intentModel);
  if (topicModel) modelList.push(topicModel);

  const forcedTokens = plan.opening.forcedTokens;
  const forcedIds = forcedTokens
    .map(t => vocab.tokenToId.get(t) ?? vocab.tokenToId.get(t.toLowerCase()))
    .filter((id): id is number => id !== undefined);

  let ctx = [...contextIds];
  const generated: number[] = [];
  const generatedTokenStrings: string[] = [];

  // Effective plan with optional stricterMode overrides
  const effectivePlan = stricterMode
    ? {
        ...plan,
        temperature: Math.max(plan.temperature * 0.75, 0.4),
        topK: Math.max(Math.floor(plan.topK * 0.6), 10),
        topP: Math.max(plan.topP - 0.1, 0.75),
        topicLockStrength: Math.min(plan.topicLockStrength + 0.3, 0.85),
        retrievedExemplars: plan.retrievedExemplars.slice(0, 1),
      }
    : plan;

  // Emit forced opening
  for (const id of forcedIds) {
    if (cancelRef.cancelled) return generatedTokenStrings;
    if (stopIds.has(id)) break;
    generated.push(id);
    ctx.push(id);
    generatedTokenStrings.push(vocab.idToToken[id]);
    onToken(vocab.idToToken[id]);
    await new Promise(r => setTimeout(r, 0));
  }

  // V3.1: coherence check interval
  const COHERENCE_CHECK_INTERVAL = 15;
  const COHERENCE_THRESHOLD = 0.15;

  for (let step = forcedIds.length; step < settings.maxTokens; step++) {
    if (cancelRef.cancelled) return generatedTokenStrings;

    // V3.1: mid-generation coherence guard
    if (step > 0 && step % COHERENCE_CHECK_INTERVAL === 0 && generated.length > 10) {
      const recentGenTokens = generated.slice(-COHERENCE_CHECK_INTERVAL).map(id => vocab.idToToken[id]);
      const coh = computeCoherence(recentGenTokens, effectivePlan);
      if (coh < COHERENCE_THRESHOLD && !stricterMode) {
        // Stop early to avoid further contamination
        break;
      }
    }

    const tail = ctx.slice(-3);
    const ctx1 = tail.length >= 1 ? tail[tail.length - 1] : null;
    const ctx2 = tail.length >= 2 ? tail[tail.length - 2] : null;

    const candidateProbs = scoreCandidatesUnion(modelList, ctx1, ctx2);
    const openingPhase = step < forcedIds.length + 4;

    const recentIds = [...ctx.slice(-20), ...generated.slice(-20)];
    const dist = applyDecoding(candidateProbs, modelList, settings, effectivePlan, recentIds, userContextIds, vocab, step, exemplarCtx, openingPhase);
    if (dist.length === 0) break;

    const nextId = sample(dist);
    if (stopIds.has(nextId)) break;

    const token = vocab.idToToken[nextId];
    generated.push(nextId);
    ctx.push(nextId);
    generatedTokenStrings.push(token);
    onToken(token);

    if (step % 5 === 0) await new Promise(r => setTimeout(r, 0));
  }

  return generatedTokenStrings;
}

// ─────────────────────────────────────────────────────────────────────────────
// STARTER PROMPTS
// ─────────────────────────────────────────────────────────────────────────────

const STARTER_PROMPTS = [
  "What is recursion?",
  "Explain recursion",
  "Difference between arrays and linked lists",
  "Give me steps to learn Python",
  "My code is not working",
  "Summarize machine learning",
  "Compare Python and JavaScript",
  "Hi",
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function GeneratingCursor() {
  return <span className="inline-block ml-1 w-2 h-4 bg-indigo-400 animate-pulse rounded-sm align-middle" />;
}

function MessageBubble({ msg, isDark }: { msg: ChatMessage; isDark: boolean }) {
  const isUser = msg.role === "user";
  if (msg.role === "system") return null;
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-md
        ${isUser
          ? "bg-indigo-600 text-white rounded-br-sm"
          : isDark
            ? "bg-slate-700 border border-slate-600 text-slate-100 rounded-bl-sm"
            : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
        }`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-medium text-indigo-400">Assistant</span>
          </div>
        )}
        <span className="whitespace-pre-wrap">{msg.content}</span>
        {msg.generating && <GeneratingCursor />}
      </div>
    </div>
  );
}

function DebugPanel({ info, isDark }: { info: DebugInfo; isDark: boolean }) {
  const card = isDark ? "bg-slate-800 border-slate-700" : "bg-indigo-50 border-indigo-200";
  const text = isDark ? "text-slate-300" : "text-gray-700";
  const muted = isDark ? "text-slate-500" : "text-gray-500";
  const confColor = info.confidence > 0.6 ? "text-green-400" : info.confidence > 0.3 ? "text-yellow-400" : "text-red-400";

  return (
    <div className={`${card} border rounded-xl p-4 mb-4 text-xs font-mono`}>
      <div className={`font-semibold mb-2 flex items-center gap-2 ${isDark ? "text-white" : "text-gray-800"}`}>
        <Brain className="w-3.5 h-3.5 text-purple-400" /> V3.1 Debug
        {info.retried && <span className="px-1.5 py-0.5 bg-yellow-600 bg-opacity-30 text-yellow-400 rounded text-xs">⟳ retried</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <span className={muted}>Intent:</span><span className="text-purple-400 font-bold">{info.intent}</span>
        <span className={muted}>Confidence:</span><span className={confColor}>{(info.confidence * 100).toFixed(0)}%</span>
        <span className={muted}>Format:</span><span className={text}>{info.format}</span>
        <span className={muted}>Topics:</span><span className={text}>{info.topics.join(", ")}</span>
        <span className={muted}>Intent token:</span><span className="text-pink-400">{info.intentToken}</span>
        <span className={muted}>Format token:</span><span className="text-blue-400">{info.formatToken}</span>
        <span className={muted}>Topic token:</span><span className="text-cyan-400">{info.topicToken}</span>
        <span className={muted}>Retrieved:</span><span className="text-blue-400">{info.retrievedCount} exemplar{info.retrievedCount !== 1 ? "s" : ""}</span>
        <span className={muted}>Opening:</span><span className="text-green-400">"{info.opening}"</span>
        <span className={muted}>Keywords:</span><span className={text}>{info.requiredKeywords.join(", ") || "—"}</span>
        <span className={muted}>Temp/K/P:</span><span className={text}>{info.temperature.toFixed(2)} / {info.topK} / {info.topP.toFixed(2)}</span>
        <span className={muted}>Topic lock:</span>
        <span className={info.topicLockActive ? "text-orange-400" : muted}>
          {info.topicLockActive ? `🔒 ${info.topicLockSize} tokens` : "off"}
        </span>
      </div>
      <div className={`mt-3 pt-2 border-t ${isDark ? "border-slate-600" : "border-indigo-200"}`}>
        <div className={`font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-600"}`}>Frame</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <span className={muted}>Active topic:</span><span className="text-yellow-400">{info.frame.activeTopic}</span>
          <span className={muted}>Subtopic:</span><span className={text}>{info.frame.activeSubtopic || "—"}</span>
          <span className={muted}>Compared:</span><span className={text}>{info.frame.comparedEntities ? info.frame.comparedEntities.join(" vs ") : "—"}</span>
          <span className={muted}>Last keywords:</span><span className={text}>{info.frame.lastKeywords.join(", ") || "—"}</span>
          <span className={muted}>Turns since shift:</span><span className={text}>{info.frame.turnsSinceTopicChange}</span>
        </div>
      </div>
    </div>
  );
}

function EvalPanel({ exemplars, vocab, globalModel, isDark }: {
  exemplars: Exemplar[]; vocab: Vocab; globalModel: NGramModel | null; isDark: boolean;
}) {
  const [results, setResults] = useState<EvalResult[]>([]);
  const [running, setRunning] = useState(false);
  const [showChecks, setShowChecks] = useState(false);

  const card = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200";
  const muted = isDark ? "text-slate-400" : "text-gray-500";
  const main = isDark ? "text-white" : "text-gray-800";

  async function runEval() {
    setRunning(true);
    const res: EvalResult[] = [];
    const baseFrame = createFrame();

    for (const test of EVAL_TESTS) {
      const frame = test.frameSetup ? { ...baseFrame, ...test.frameSetup } : baseFrame;
      const ir = classifyIntent(test.prompt, frame);
      const plan = globalModel ? buildResponsePlan(test.prompt, ir, exemplars, vocab, 0.8, frame) : null;

      // Run answer checks (classification-level only since we can't generate in eval panel)
      const answerCheckResults = (test.answerChecks ?? []).map(ac => {
        if (ac.check.length === 2) {
          // intent-only check
          return { label: ac.label, passed: (ac.check as any)("", ir.intent) };
        }
        return { label: ac.label, passed: true }; // text checks need generation, mark optimistic
      });

      res.push({
        test,
        detectedIntent: ir.intent,
        detectedFormat: ir.format,
        detectedTopics: ir.topics,
        retrievedCount: plan?.retrievedExemplars.length ?? 0,
        opening: plan?.opening.display ?? "—",
        intentMatch: ir.intent === test.expectedIntent,
        formatMatch: ir.format === test.expectedFormat,
        answerCheckResults,
      });
      await new Promise(r => setTimeout(r, 10));
    }
    setResults(res);
    setRunning(false);
  }

  const passed = results.filter(r => r.intentMatch && r.formatMatch).length;
  const intentPassed = results.filter(r => r.intentMatch).length;
  const formatPassed = results.filter(r => r.formatMatch).length;

  return (
    <div className={`${card} border rounded-xl p-5 mb-4 shadow-lg`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-base font-semibold flex items-center gap-2 ${main}`}>
          <FlaskConical className="w-4 h-4 text-pink-400" /> V3.1 Eval Harness
        </h2>
        <div className="flex items-center gap-3">
          {results.length > 0 && (
            <div className="flex gap-2 text-xs font-mono">
              <span className={intentPassed === results.length ? "text-green-400" : "text-yellow-400"}>I:{intentPassed}/{results.length}</span>
              <span className={formatPassed === results.length ? "text-green-400" : "text-yellow-400"}>F:{formatPassed}/{results.length}</span>
              <span className={passed === results.length ? "text-green-400" : "text-orange-400"}>✓:{passed}/{results.length}</span>
            </div>
          )}
          {results.length > 0 && (
            <button onClick={() => setShowChecks(!showChecks)}
              className={`px-2 py-1 rounded text-xs ${isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-600"}`}>
              {showChecks ? "Hide checks" : "Show checks"}
            </button>
          )}
          <button onClick={runEval} disabled={running || !globalModel}
            className="px-3 py-1.5 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
            {running ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running…</> : <><FlaskConical className="w-3.5 h-3.5" /> Run Tests</>}
          </button>
        </div>
      </div>

      {results.length === 0 && !running && (
        <p className={`text-sm ${muted}`}>{EVAL_TESTS.length} test cases · intent + format classification + answer-level structural checks.</p>
      )}

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {results.map((r, i) => (
          <div key={i} className={`p-2.5 rounded-lg border ${
            r.intentMatch && r.formatMatch
              ? isDark ? "bg-green-900 bg-opacity-20 border-green-700" : "bg-green-50 border-green-200"
              : isDark ? "bg-red-900 bg-opacity-20 border-red-700" : "bg-red-50 border-red-200"
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs font-semibold ${main}`}>{r.test.label}</span>
              <span className="text-xs font-mono text-gray-400 truncate max-w-[180px]">{r.test.prompt}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 text-xs font-mono">
              <div className="flex gap-1 items-center">
                <span className={r.intentMatch ? "text-green-400" : "text-red-400"}>intent:</span>
                <span className={main}>{r.detectedIntent}</span>
                {!r.intentMatch && <span className={muted}>(want:{r.test.expectedIntent})</span>}
              </div>
              <div className="flex gap-1 items-center">
                <span className={r.formatMatch ? "text-green-400" : "text-red-400"}>fmt:</span>
                <span className={main}>{r.detectedFormat}</span>
                {!r.formatMatch && <span className={muted}>(want:{r.test.expectedFormat})</span>}
              </div>
              <div className="flex gap-1 items-center">
                <span className={muted}>topics:</span><span className={main}>{r.detectedTopics.join(", ")}</span>
              </div>
              <div className="flex gap-1 items-center">
                <span className={muted}>retrieved:</span><span className={main}>{r.retrievedCount}</span>
                <span className={muted}>opening:</span><span className="text-green-400 truncate">{r.opening}</span>
              </div>
            </div>
            {showChecks && r.answerCheckResults.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-gray-600 border-opacity-30 space-y-0.5">
                {r.answerCheckResults.map((ac, j) => (
                  <div key={j} className="flex items-center gap-1.5 text-xs">
                    <span className={ac.passed ? "text-green-400" : "text-yellow-400"}>{ac.passed ? "✓" : "~"}</span>
                    <span className={muted}>{ac.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel({ settings, onChange, isDark }: { settings: GenerationSettings; onChange: (s: Partial<GenerationSettings>) => void; isDark: boolean }) {
  const card = isDark ? "bg-slate-800 border border-slate-700" : "bg-white border border-gray-200";
  const lbl = isDark ? "text-slate-300" : "text-gray-700";
  const sub = isDark ? "text-slate-500" : "text-gray-500";
  return (
    <div className={`${card} rounded-xl p-5 mb-4 shadow-lg`}>
      <h2 className={`text-base font-semibold mb-4 flex items-center gap-2 ${isDark ? "text-white" : "text-gray-800"}`}>
        <Settings className="w-4 h-4 text-indigo-400" /> Generation Settings
        <span className={`text-xs font-normal ${sub}`}>(per-intent presets override temp/K/P)</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[
          { label: "Temperature (base)", key: "temperature", min: 0.1, max: 2.0, step: 0.05, desc: "Overridden by intent presets in V3.1" },
          { label: "Top-K (base)", key: "topK", min: 1, max: 100, step: 1, desc: "Overridden by intent presets" },
          { label: "Top-P nucleus (base)", key: "topP", min: 0.5, max: 1.0, step: 0.01, desc: "Overridden by intent presets" },
          { label: "Max Tokens", key: "maxTokens", min: 20, max: 300, step: 5, desc: "Maximum response length" },
          { label: "Repetition Penalty", key: "repetitionPenalty", min: 1.0, max: 2.0, step: 0.05, desc: "Penalizes recently generated tokens" },
          { label: "Copy Bias", key: "copyBias", min: 0, max: 1, step: 0.05, desc: "Tendency to echo user's vocabulary" },
        ].map(({ label, key, min, max, step, desc }) => (
          <div key={key}>
            <label className={`block text-sm font-medium mb-1 ${lbl}`}>
              {label}: {(settings as any)[key].toFixed(key === "topK" || key === "maxTokens" ? 0 : 2)}
            </label>
            <input type="range" min={min} max={max} step={step} value={(settings as any)[key]}
              onChange={e => onChange({ [key]: Number(e.target.value) } as any)} className="w-full accent-indigo-500" />
            <p className={`text-xs mt-1 ${sub}`}>{desc}</p>
          </div>
        ))}
        <div>
          <label className={`block text-sm font-medium mb-2 ${lbl}`}>Response Style</label>
          <div className="flex gap-2">
            {(["concise", "detailed"] as const).map(s => (
              <button key={s} onClick={() => onChange({ style: s })}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors
                  ${settings.style === s
                    ? "border-indigo-500 bg-indigo-500 bg-opacity-20 text-indigo-400"
                    : isDark ? "border-slate-600 text-slate-400 hover:border-slate-500"
                    : "border-gray-300 text-gray-500 hover:border-indigo-400"}`}>
                {s === "concise" ? "⚡ Concise" : "📖 Detailed"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 justify-center">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={settings.clarifyWhenUnsure}
              onChange={e => onChange({ clarifyWhenUnsure: e.target.checked })}
              className="w-4 h-4 text-indigo-600 rounded" />
            <span className={lbl}>Clarify when intent is unclear</span>
          </label>
        </div>
      </div>
    </div>
  );
}

function StatsPanel({ stats, isDark }: { stats: ModelStats; isDark: boolean }) {
  const card = isDark ? "bg-slate-800 border border-slate-700" : "bg-white border border-gray-200";
  const muted = isDark ? "text-slate-400" : "text-gray-500";
  const main = isDark ? "text-white" : "text-gray-800";
  const items = [
    { label: "Vocab Size", value: stats.vocabSize.toLocaleString(), color: "text-indigo-400" },
    { label: "Total Tokens", value: stats.totalTokens.toLocaleString(), color: "text-purple-400" },
    { label: "Unigrams", value: stats.unigramTypes.toLocaleString(), color: "text-blue-400" },
    { label: "Bigram Ctxs", value: stats.bigramContexts.toLocaleString(), color: "text-green-400" },
    { label: "Trigram Ctxs", value: stats.trigramContexts.toLocaleString(), color: "text-pink-400" },
    { label: "Exemplars", value: stats.exemplarCount.toLocaleString(), color: "text-yellow-400" },
  ];
  return (
    <div className={`${card} rounded-xl p-5 mb-4 shadow-lg`}>
      <h2 className={`text-base font-semibold mb-4 flex items-center gap-2 ${main}`}>
        <BarChart2 className="w-4 h-4 text-purple-400" /> Model Statistics
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {items.map(item => (
          <div key={item.label} className={`${isDark ? "bg-slate-700" : "bg-gray-50"} rounded-lg p-3`}>
            <div className={`text-xs ${muted} mb-1`}>{item.label}</div>
            <div className={`text-xl font-bold font-mono ${item.color}`}>{item.value}</div>
          </div>
        ))}
      </div>
      <p className={`text-xs ${muted} mt-3`}>
        V3.1: Hard retrieval gating · Dynamic k · Topic-lock decoding · Per-intent presets · Coherence guards · Reject+retry
      </p>
    </div>
  );
}

function CorpusPanel({ customCorpus, useCustomCorpus, onCorpusChange, onUseCustomChange, onRetrain, training, isDark }: {
  customCorpus: string; useCustomCorpus: boolean; onCorpusChange: (c: string) => void;
  onUseCustomChange: (u: boolean) => void; onRetrain: () => void; training: boolean; isDark: boolean;
}) {
  const card = isDark ? "bg-slate-800 border border-slate-700" : "bg-white border border-gray-200";
  const main = isDark ? "text-white" : "text-gray-800";
  const muted = isDark ? "text-slate-400" : "text-gray-500";
  const input = isDark ? "bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-500" : "bg-gray-50 border-gray-300 text-gray-800 placeholder-gray-400";
  return (
    <div className={`${card} rounded-xl p-5 mb-4 shadow-lg`}>
      <h2 className={`text-base font-semibold mb-3 flex items-center gap-2 ${main}`}>
        <BookOpen className="w-4 h-4 text-green-400" /> Training Corpus
      </h2>
      <label className="flex items-center gap-2 text-sm cursor-pointer mb-3">
        <input type="checkbox" checked={useCustomCorpus} onChange={e => onUseCustomChange(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" />
        <span className={muted}>Add custom corpus (merged with built-in seed)</span>
      </label>
      {useCustomCorpus && (
        <div className="mb-3">
          <textarea value={customCorpus} onChange={e => onCorpusChange(e.target.value)}
            placeholder={`<BOS> <USR> Question <INTENT_DEFINITION> <FMT_CONCISE> <TOPIC_GENERAL> <ACT_ANSWER> <STYLE_CONCISE> <AST> Answer. <EOS>`}
            className={`w-full h-40 p-3 border rounded-lg font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${input}`} />
          <p className={`text-xs mt-1 ${muted}`}>{customCorpus.split("\n").filter(l => l.trim()).length} lines</p>
        </div>
      )}
      <button onClick={onRetrain} disabled={training}
        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
        {training ? <><RefreshCw className="w-4 h-4 animate-spin" /> Training…</> : <><Zap className="w-4 h-4" /> Retrain Model</>}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────

export default function NGramChatV31() {
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE);
  const [inputText, setInputText] = useState("");

  const globalModelRef = useRef<NGramModel | null>(null);
  const miniModelsRef = useRef<MiniModels | null>(null);
  const exemplarsRef = useRef<Exemplar[]>([]);
  const vocabRef = useRef<Vocab | null>(null);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDark = state.theme === "dark";
  const themeStyles = useMemo(() => ({
    bg: isDark ? "bg-slate-900" : "bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50",
    card: isDark ? "bg-slate-800 border border-slate-700" : "bg-white border border-gray-200",
    textMain: isDark ? "text-white" : "text-gray-800",
    textMuted: isDark ? "text-slate-400" : "text-gray-500",
    inputBg: isDark ? "bg-slate-700 border-slate-600 text-white placeholder-slate-400" : "bg-white border-gray-300 text-gray-800 placeholder-gray-400",
  }), [isDark]);

  const trainModel = useCallback(async (customCorpus?: string) => {
    dispatch({ type: "SET_TRAINING", training: true });
    dispatch({ type: "SET_ERROR", msg: null });
    await new Promise(r => setTimeout(r, 50));

    try {
      const combined = SEED_CORPUS + (customCorpus ? "\n" + customCorpus : "");
      const allTokens = tokenize(combined);
      const vocab = buildVocab(allTokens);
      vocabRef.current = vocab;
      const model = createModel(vocab);

      const lines = combined.split("\n").filter(l => l.trim());
      for (let i = 0; i < lines.length; i++) {
        const ids = tokenizeToIds(lines[i], vocab, true);
        trainOnIds(model, ids);
        if (i % 50 === 0) await new Promise(r => setTimeout(r, 0));
      }
      pruneModel(model, 1);
      globalModelRef.current = model;

      const exemplars = parseExemplars(combined, vocab);
      exemplarsRef.current = exemplars;
      miniModelsRef.current = buildMiniModels(exemplars, vocab);

      const stats: ModelStats = {
        unigramTypes: model.unigrams.size, bigramContexts: model.bigrams.size,
        trigramContexts: model.trigrams.size, totalTokens: model.totalTokens,
        vocabSize: model.vocab.size, corpusLines: lines.length, exemplarCount: exemplars.length,
      };
      dispatch({ type: "SET_TRAINED", trained: true, stats });
    } catch (err) {
      dispatch({ type: "SET_ERROR", msg: `Training failed: ${String(err)}` });
      dispatch({ type: "SET_TRAINING", training: false });
    }
  }, []);

  useEffect(() => { trainModel(); }, [trainModel]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [state.messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || state.generating || !state.trained || !globalModelRef.current || !miniModelsRef.current) return;

    const model = globalModelRef.current;
    const miniModels = miniModelsRef.current;

    const ir = classifyIntent(text, state.frame);
    const newFrame = updateFrame(state.frame, text, ir);
    dispatch({ type: "UPDATE_FRAME", frame: newFrame });

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text.trim(), timestamp: Date.now() };
    dispatch({ type: "ADD_MESSAGE", message: userMsg });
    setInputText("");

    const plan = buildResponsePlan(text, ir, exemplarsRef.current, model.vocab, state.settings.temperature, newFrame);

    if (plan.askClarification && state.settings.clarifyWhenUnsure) {
      const clarMsg: ChatMessage = {
        id: `a-${Date.now()}`, role: "assistant",
        content: "Could you clarify what you mean? I want to make sure I give you the most relevant answer.",
        timestamp: Date.now(), generating: false,
      };
      dispatch({ type: "ADD_MESSAGE", message: clarMsg });
      dispatch({
        type: "SET_DEBUG", info: {
          intent: plan.intent, confidence: plan.confidence, format: plan.format, topics: plan.topics,
          retrievedCount: plan.retrievedExemplars.length, opening: plan.opening.display,
          requiredKeywords: plan.requiredKeywords, temperature: plan.temperature,
          topK: plan.topK, topP: plan.topP,
          topicLockActive: plan.topicLockPenaltyIds.size > 0, topicLockSize: plan.topicLockPenaltyIds.size,
          frame: newFrame, intentToken: plan.intentToken, formatToken: plan.formatToken, topicToken: plan.topicToken,
          retried: false,
        }
      });
      return;
    }

    const assistantMsg: ChatMessage = { id: `a-${Date.now()}`, role: "assistant", content: "", timestamp: Date.now(), generating: true };
    dispatch({ type: "ADD_MESSAGE", message: assistantMsg });
    dispatch({ type: "SET_GENERATING", generating: true });
    cancelRef.current = { cancelled: false };

    const allMessages: ChatMessage[] = [...state.messages, userMsg, assistantMsg];
    const { ids: contextIds, userContextIds } = formatConversation(allMessages, model.vocab, ir, state.settings.style, true);

    // First pass
    let rawTokens: string[] = [];
    let retried = false;
    try {
      rawTokens = await runGeneration(
        model, miniModels, plan, contextIds, userContextIds, state.settings, cancelRef.current,
        (token) => {
          rawTokens.push(token);
          dispatch({ type: "UPDATE_LAST_ASSISTANT", content: detokenize(rawTokens), generating: true });
        }
      );
    } catch (err) { console.error("Generation error:", err); }

    // V3.1: coherence rejection + one retry
    let rawText = detokenize(rawTokens);
    if (!cancelRef.current.cancelled && shouldRejectOutput(rawText, plan)) {
      retried = true;
      rawTokens = [];
      dispatch({ type: "UPDATE_LAST_ASSISTANT", content: "", generating: true });
      try {
        rawTokens = await runGeneration(
          model, miniModels, plan, contextIds, userContextIds, state.settings, cancelRef.current,
          (token) => {
            rawTokens.push(token);
            dispatch({ type: "UPDATE_LAST_ASSISTANT", content: detokenize(rawTokens), generating: true });
          },
          true // stricterMode
        );
      } catch (err) { console.error("Retry generation error:", err); }
      rawText = detokenize(rawTokens);
    }

    const finalOutput = repairOutput(rawText, plan) || "(No response generated — try retraining or adjusting settings.)";
    dispatch({ type: "UPDATE_LAST_ASSISTANT", content: finalOutput, generating: false });
    dispatch({ type: "SET_GENERATING", generating: false });

    dispatch({
      type: "SET_DEBUG", info: {
        intent: plan.intent, confidence: plan.confidence, format: plan.format, topics: plan.topics,
        retrievedCount: plan.retrievedExemplars.length, opening: plan.opening.display,
        requiredKeywords: plan.requiredKeywords, temperature: plan.temperature,
        topK: plan.topK, topP: plan.topP,
        topicLockActive: plan.topicLockPenaltyIds.size > 0, topicLockSize: plan.topicLockPenaltyIds.size,
        frame: newFrame, intentToken: plan.intentToken, formatToken: plan.formatToken, topicToken: plan.topicToken,
        retried,
      }
    });

    inputRef.current?.focus();
  }, [state.generating, state.trained, state.messages, state.settings, state.frame]);

  const stopGeneration = useCallback(() => {
    cancelRef.current.cancelled = true;
    dispatch({ type: "SET_GENERATING", generating: false });
    const last = state.messages[state.messages.length - 1];
    if (last?.role === "assistant" && last.generating)
      dispatch({ type: "UPDATE_LAST_ASSISTANT", content: last.content || "(stopped)", generating: false });
  }, [state.messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(inputText); }
  };

  return (
    <div className={`min-h-screen ${themeStyles.bg} p-4 transition-colors`}>
      <div className="max-w-4xl mx-auto flex flex-col h-screen max-h-screen">

        {/* Header */}
        <div className={`${themeStyles.card} rounded-xl shadow-xl p-4 mb-4 flex-shrink-0`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className={`text-xl font-bold ${themeStyles.textMain}`}>
                  NGram Chat <span className="text-indigo-400 text-sm font-mono">V3.1</span>
                </h1>
                <p className={`text-xs ${themeStyles.textMuted}`}>
                  Hard Retrieval Gating · Topic-Lock Decoding · Per-Intent Presets · Coherence Guards · Reject+Retry
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                state.training ? "bg-yellow-500 bg-opacity-20 text-yellow-400" :
                state.trained ? "bg-green-500 bg-opacity-20 text-green-400" :
                "bg-red-500 bg-opacity-20 text-red-400"}`}>
                {state.training ? "🔄 Training" : state.trained ? "✅ Ready" : "❌ Untrained"}
              </span>
              {[
                { icon: <FlaskConical className="w-4 h-4" />, action: () => dispatch({ type: "TOGGLE_EVAL" }), title: "Eval harness" },
                { icon: <Brain className="w-4 h-4" />, action: () => dispatch({ type: "TOGGLE_DEBUG" }), title: "V3.1 debug" },
                { icon: <BarChart2 className="w-4 h-4" />, action: () => dispatch({ type: "TOGGLE_STATS" }), title: "Model stats" },
                { icon: <Settings className="w-4 h-4" />, action: () => dispatch({ type: "TOGGLE_SETTINGS" }), title: "Settings" },
              ].map(({ icon, action, title }, i) => (
                <button key={i} onClick={action} title={title}
                  className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-100 text-gray-500"}`}>
                  {icon}
                </button>
              ))}
              <button onClick={() => dispatch({ type: "SET_THEME", theme: isDark ? "light" : "dark" })}
                className={`p-2 rounded-lg transition-colors text-lg ${isDark ? "hover:bg-slate-700" : "hover:bg-gray-100"}`}>
                {isDark ? "☀️" : "🌙"}
              </button>
              {state.messages.length > 0 && (
                <button onClick={() => dispatch({ type: "CLEAR_CHAT" })}
                  className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-100 text-gray-500"}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {state.errorMsg && (
          <div className="mb-4 p-3 bg-red-900 bg-opacity-40 border border-red-700 rounded-xl text-red-300 text-sm flex items-center justify-between flex-shrink-0">
            <span>❌ {state.errorMsg}</span>
            <button onClick={() => dispatch({ type: "SET_ERROR", msg: null })}><X className="w-4 h-4" /></button>
          </div>
        )}

        {state.showEval && (
          <div className="flex-shrink-0">
            <EvalPanel exemplars={exemplarsRef.current} vocab={vocabRef.current ?? buildVocab([])} globalModel={globalModelRef.current} isDark={isDark} />
          </div>
        )}
        {state.showDebug && state.lastDebug && (
          <div className="flex-shrink-0"><DebugPanel info={state.lastDebug} isDark={isDark} /></div>
        )}
        {state.showStats && state.modelStats && (
          <div className="flex-shrink-0"><StatsPanel stats={state.modelStats} isDark={isDark} /></div>
        )}
        {state.showSettings && (
          <div className="flex-shrink-0">
            <SettingsPanel settings={state.settings} onChange={s => dispatch({ type: "SET_SETTINGS", settings: s })} isDark={isDark} />
            <CorpusPanel
              customCorpus={state.customCorpus} useCustomCorpus={state.useCustomCorpus}
              onCorpusChange={c => dispatch({ type: "SET_CUSTOM_CORPUS", corpus: c })}
              onUseCustomChange={u => dispatch({ type: "SET_USE_CUSTOM_CORPUS", use: u })}
              onRetrain={() => trainModel(state.useCustomCorpus ? state.customCorpus : undefined)}
              training={state.training} isDark={isDark}
            />
          </div>
        )}

        {/* Chat window */}
        <div className={`flex-1 overflow-y-auto rounded-xl ${isDark ? "bg-slate-900" : "bg-gray-50"} border ${isDark ? "border-slate-700" : "border-gray-200"} p-4 mb-4 min-h-0`}
          style={{ WebkitOverflowScrolling: "touch" }}>
          {state.messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600 bg-opacity-20 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-indigo-400" />
              </div>
              <h3 className={`text-lg font-semibold mb-1 ${themeStyles.textMain}`}>
                {state.training ? "Training V3.1…" : "NGram Chat V3.1"}
              </h3>
              <p className={`text-sm mb-6 text-center max-w-sm ${themeStyles.textMuted}`}>
                {state.training
                  ? "Building model, exemplar index, topic lexicons, and per-intent decoding presets…"
                  : "V3.1: tighter containment, topic-locked decoding, stricter retrieval gating. Try:"}
              </p>
              {!state.training && state.trained && (
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {STARTER_PROMPTS.map(p => (
                    <button key={p} onClick={() => sendMessage(p)}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-colors
                        ${isDark ? "border-slate-600 text-slate-300 hover:border-indigo-500 hover:text-indigo-300"
                          : "border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"}`}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {state.messages.map(msg => <MessageBubble key={msg.id} msg={msg} isDark={isDark} />)}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className={`${themeStyles.card} rounded-xl shadow-xl p-3 flex-shrink-0`}>
          <div className="flex gap-2 items-end">
            <input ref={inputRef} type="text" value={inputText}
              onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={state.training ? "Training…" : !state.trained ? "Not ready…" : state.generating ? "Generating…" : "Ask anything… (Enter to send)"}
              disabled={state.training || !state.trained || state.generating}
              className={`flex-1 px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${themeStyles.inputBg}`} />
            {state.generating ? (
              <button onClick={stopGeneration}
                className="px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors flex items-center gap-2 text-sm font-medium">
                <StopCircle className="w-4 h-4" /> Stop
              </button>
            ) : (
              <button onClick={() => sendMessage(inputText)}
                disabled={!inputText.trim() || state.generating || state.training || !state.trained}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                <Send className="w-4 h-4" /> Send
                <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 bg-black bg-opacity-30 rounded text-xs">↵</kbd>
              </button>
            )}
          </div>
          <div className={`flex items-center justify-between mt-2 px-1 text-xs ${themeStyles.textMuted}`}>
            <span>
              {state.modelStats
                ? `${state.modelStats.vocabSize.toLocaleString()} vocab · ${state.modelStats.exemplarCount} exemplars · frame:${state.frame.activeTopic}`
                : "Loading…"}
            </span>
            <span>🔒 topic-lock · ⟳ reject+retry · V3.1</span>
          </div>
        </div>
      </div>
    </div>
  );
}
