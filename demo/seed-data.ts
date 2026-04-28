/**
 * Contoso Copilot Monitoring — Synthetic Data Seeder
 *
 * Generates realistic org-wide Copilot agent telemetry that tells a story:
 *  - 6 engineering teams with distinct usage patterns
 *  - Adoption growth curve over 7 days (week-over-week)
 *  - Peak-hours traffic (9am-5pm bell curve, lunch dip)
 *  - Realistic model mix (GPT-5.3-Codex dominant, Claude & Gemini mix)
 *  - Weighted tool distribution (readFile >> runTests)
 *  - Occasional errors and slow outliers
 *  - Subagent traces (nested invoke_agent spans)
 *
 * Usage:
 *   npx tsx seed-data.ts                             # 7 days, ~500 invocations
 *   npx tsx seed-data.ts --days 1                    # Last 24h only
 *   npx tsx seed-data.ts --scale 3                   # 3x more data (~1500)
 *   npx tsx seed-data.ts --endpoint http://host:4318
 */

const ENDPOINT = getArg("--endpoint", "http://localhost:4318");
const DAYS = parseInt(getArg("--days", "7"), 10);
const SCALE = parseFloat(getArg("--scale", "1"));

function getArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

// ── Contoso org structure ──────────────────────────────────────
const TEAMS = [
  { name: "Platform",      devs: 45, modelMix: { "gpt-5.3-codex": 0.45, "claude-sonnet-4.6": 0.25, "claude-opus-4.6": 0.15, "gemini-3.1-pro": 0.15 }, agentBias: 0.7, errorRate: 0.02 },
  { name: "Payments",      devs: 30, modelMix: { "gpt-5.3-codex": 0.35, "claude-sonnet-4.6": 0.20, "claude-opus-4.6": 0.30, "gemini-3.1-pro": 0.15 }, agentBias: 0.6, errorRate: 0.03 },
  { name: "Mobile",        devs: 25, modelMix: { "gpt-5.3-codex": 0.50, "claude-sonnet-4.6": 0.30, "claude-opus-4.6": 0.05, "gemini-3.1-pro": 0.15 }, agentBias: 0.8, errorRate: 0.04 },
  { name: "Data-Platform", devs: 20, modelMix: { "gpt-5.3-codex": 0.30, "claude-sonnet-4.6": 0.20, "claude-opus-4.6": 0.20, "gemini-3.1-pro": 0.30 }, agentBias: 0.5, errorRate: 0.02 },
  { name: "Frontend",      devs: 35, modelMix: { "gpt-5.3-codex": 0.55, "claude-sonnet-4.6": 0.25, "claude-opus-4.6": 0.05, "gemini-3.1-pro": 0.15 }, agentBias: 0.9, errorRate: 0.05 },
  { name: "Security",      devs: 15, modelMix: { "gpt-5.3-codex": 0.20, "claude-sonnet-4.6": 0.15, "claude-opus-4.6": 0.50, "gemini-3.1-pro": 0.15 }, agentBias: 0.4, errorRate: 0.01 },
];

// Weighted tool distribution — readFile and searchFiles dominate
const TOOL_WEIGHTS: [string, number][] = [
  ["readFile", 30], ["searchFiles", 20], ["editFile", 15], ["listFiles", 10],
  ["runCommand", 8], ["codeSearch", 7], ["getErrors", 5], ["runTests", 3],
  ["fetchUrl", 1], ["githubApi", 1],
];
const TOOL_TOTAL = TOOL_WEIGHTS.reduce((s, [, w]) => s + w, 0);

// Model-specific latency profiles (seconds)
const MODEL_LATENCY: Record<string, { min: number; p50: number; p95: number }> = {
  "gpt-5.3-codex":     { min: 0.4, p50: 1.2, p95: 3.5 },
  "claude-sonnet-4.6": { min: 0.5, p50: 1.5, p95: 4.0 },
  "claude-opus-4.6":   { min: 1.0, p50: 3.0, p95: 8.0 },
  "gemini-3.1-pro":    { min: 0.5, p50: 1.4, p95: 3.8 },
};

// Tool-specific latency profiles (ms)
const TOOL_LATENCY: Record<string, { min: number; max: number }> = {
  readFile: { min: 10, max: 200 }, searchFiles: { min: 50, max: 800 },
  editFile: { min: 20, max: 300 }, listFiles: { min: 5, max: 100 },
  runCommand: { min: 500, max: 8000 }, codeSearch: { min: 100, max: 1500 },
  getErrors: { min: 200, max: 3000 }, runTests: { min: 2000, max: 15000 },
  fetchUrl: { min: 200, max: 5000 }, githubApi: { min: 100, max: 2000 },
};

// ── Helpers ────────────────────────────────────────────────────
function randomId(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
  ).join("");
}
function randomTraceId(): string { return randomId().slice(0, 32); }
function randomSpanId(): string { return randomId().slice(0, 16); }
function randomBetween(min: number, max: number): number { return min + Math.random() * (max - min); }

// Log-normal distribution for realistic latency (long tail of slow requests)
function logNormal(p50: number, spread = 0.5): number {
  const u1 = Math.random(), u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return p50 * Math.exp(spread * z);
}

function weightedChoice(weights: [string, number][], total: number): string {
  let r = Math.random() * total;
  for (const [item, weight] of weights) {
    r -= weight;
    if (r <= 0) return item;
  }
  return weights[weights.length - 1][0];
}

function pickModel(mix: Record<string, number>): string {
  let r = Math.random();
  for (const [model, prob] of Object.entries(mix)) {
    r -= prob;
    if (r <= 0) return model;
  }
  return "gpt-5.3-codex";
}

// Bell curve: peak at 11am and 3pm, dip at noon, low outside 9-5
function workdayActivityMultiplier(hourUTC: number): number {
  // Assume US Pacific: UTC-8. Convert to local hour.
  const localHour = (hourUTC - 8 + 24) % 24;
  if (localHour < 7 || localHour > 19) return 0.05; // nights
  if (localHour < 9 || localHour > 17) return 0.2;  // early/late
  if (localHour >= 12 && localHour < 13) return 0.6; // lunch dip
  if (localHour >= 10 && localHour < 12) return 1.0; // morning peak
  if (localHour >= 14 && localHour < 16) return 0.95; // afternoon peak
  return 0.7;
}

// Adoption growth: linear ramp from 30% to 100% over the time window
function adoptionMultiplier(dayIndex: number, totalDays: number): number {
  if (totalDays <= 1) return 1;
  return 0.3 + 0.7 * (dayIndex / (totalDays - 1));
}

// ── OTel data types ────────────────────────────────────────────
interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: { key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number } }[];
  status: { code: number };
}

function attr(key: string, value: string | number) {
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { key, value: { intValue: String(value) } }
      : { key, value: { doubleValue: value } };
  }
  return { key, value: { stringValue: value } };
}

// ── Realistic content samples for captureContent demo ──────────
const SAMPLE_PROMPTS = [
  "Look at the authentication middleware and find any security vulnerabilities",
  "Refactor the payment processing module to use the new Stripe API v3",
  "Add unit tests for the user registration flow covering edge cases",
  "Explain how the caching layer works and suggest performance improvements",
  "Fix the race condition in the order processing pipeline",
  "Create a new REST endpoint for managing team notification preferences",
  "Review the database migration scripts and check for data loss risks",
  "Optimize the search indexing pipeline — it's taking over 30 seconds",
  "Add retry logic with exponential backoff to the external API client",
  "Generate TypeScript types from the OpenAPI spec in docs/api.yaml",
];

const SAMPLE_RESPONSES = [
  "I've analyzed the authentication middleware in `src/auth/middleware.ts`. I found 2 issues:\n\n1. **JWT validation doesn't check `aud` claim** — an attacker could reuse tokens from another service\n2. **Session expiry uses client-provided timestamp** — should use server time\n\nHere are the fixes...",
  "I've refactored the payment module. Key changes:\n- Replaced `stripe.charges.create()` with `stripe.paymentIntents.create()`\n- Added idempotency keys to prevent duplicate charges\n- Updated webhook handler for the new event types\n\nAll 12 existing tests pass, and I added 3 new ones.",
  "I found the race condition in `OrderProcessor.processAsync()`. Two concurrent requests can both read `order.status === 'pending'` before either writes. Fixed with optimistic locking using a version column.",
  "The search indexing bottleneck is in the N+1 query pattern in `buildIndex()`. Each document triggers a separate DB call for related entities. Refactored to batch-load with a single JOIN query — indexing time dropped from 34s to 2.1s in my test.",
];

const SAMPLE_TOOL_ARGS: Record<string, () => string> = {
  readFile: () => JSON.stringify({ path: `src/${["auth","api","services","utils","middleware"][Math.floor(Math.random()*5)]}/${["index","handler","service","types","config"][Math.floor(Math.random()*5)]}.ts` }),
  editFile: () => JSON.stringify({ path: `src/services/${["payment","auth","user","order"][Math.floor(Math.random()*4)]}.ts`, description: "Apply fix" }),
  searchFiles: () => JSON.stringify({ query: ["TODO","FIXME","deprecated","security","vulnerability"][Math.floor(Math.random()*5)], pattern: "**/*.ts" }),
  listFiles: () => JSON.stringify({ path: `src/${["components","services","lib","api"][Math.floor(Math.random()*4)]}` }),
  runCommand: () => JSON.stringify({ command: ["npm test","npm run lint","npm run build","git diff --stat"][Math.floor(Math.random()*4)] }),
  codeSearch: () => JSON.stringify({ query: ["handleAuth","processPayment","validateInput","createUser"][Math.floor(Math.random()*4)] }),
  getErrors: () => JSON.stringify({}),
  runTests: () => JSON.stringify({ testFile: `src/__tests__/${["auth","payment","user","api"][Math.floor(Math.random()*4)]}.test.ts` }),
  fetchUrl: () => JSON.stringify({ url: "https://api.github.com/repos/contoso/platform/issues" }),
  githubApi: () => JSON.stringify({ endpoint: "/repos/contoso/platform/pulls?state=open" }),
};

// Model-specific request parameters
const MODEL_PARAMS: Record<string, { maxTokens: number; maxPromptTokens: number; temperature: number; topP: number }> = {
  "gpt-5.3-codex":     { maxTokens: 16384, maxPromptTokens: 400000, temperature: 0.1, topP: 0.95 },
  "claude-sonnet-4.6": { maxTokens: 8192,  maxPromptTokens: 200000, temperature: 0.1, topP: 0.95 },
  "claude-opus-4.6":   { maxTokens: 16384, maxPromptTokens: 200000, temperature: 0.1, topP: 0.95 },
  "gemini-3.1-pro":    { maxTokens: 8192,  maxPromptTokens: 1000000, temperature: 0.1, topP: 0.95 },
};

// Versioned model names for response
const MODEL_RESPONSE_VERSIONS: Record<string, string> = {
  "gpt-5.3-codex":     "gpt-5.3-codex-2026-02-12",
  "claude-sonnet-4.6": "claude-sonnet-4.6-20260218",
  "claude-opus-4.6":   "claude-opus-4.6-20260218",
  "gemini-3.1-pro":    "gemini-3.1-pro-2026-02",
};

// ── OTel Log record (events) ───────────────────────────────────
interface LogRecord {
  timeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: { stringValue: string };
  attributes: { key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number } }[];
  traceId: string;
  spanId: string;
}

let logEndpointWarningShown = false;

// ── Invocation generator ───────────────────────────────────────
interface InvocationOpts {
  baseTimeMs: number;
  team: typeof TEAMS[0];
  isSubagent?: boolean;
  parentTraceId?: string;
  parentSpanId?: string;
}

function generateAgentInvocation(opts: InvocationOpts): { spans: Span[]; metrics: any[]; logs: LogRecord[] } {
  const { baseTimeMs, team, isSubagent = false, parentTraceId, parentSpanId: parentSpan } = opts;
  const traceId = parentTraceId ?? randomTraceId();
  const model = pickModel(team.modelMix);
  const responseModel = MODEL_RESPONSE_VERSIONS[model] ?? model;
  const params = MODEL_PARAMS[model] ?? MODEL_PARAMS["gpt-5.3-codex"];
  const agent = Math.random() < team.agentBias ? "copilot" : "workspace";
  const conversationId = randomId().slice(0, 8);
  const turns = isSubagent ? Math.floor(randomBetween(1, 3)) : Math.floor(randomBetween(1, 7));
  const spans: Span[] = [];
  const metrics: any[] = [];
  const logs: LogRecord[] = [];
  const subagentResults: { spans: Span[]; metrics: any[]; logs: LogRecord[] }[] = [];

  const userPrompt = SAMPLE_PROMPTS[Math.floor(Math.random() * SAMPLE_PROMPTS.length)];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let currentTimeMs = baseTimeMs;
  const agentSpanId = randomSpanId();
  const agentStartMs = currentTimeMs;
  const latencyProfile = MODEL_LATENCY[model] ?? MODEL_LATENCY["gpt-5.3-codex"];
  const isError = Math.random() < team.errorRate;
  const errorTurn = isError ? Math.floor(Math.random() * turns) : -1;

  // Session start event
  if (!isSubagent) {
    logs.push({
      timeUnixNano: String(Math.floor(currentTimeMs * 1e6)),
      severityNumber: 9, severityText: "INFO",
      body: { stringValue: "copilot_chat.session.start" },
      attributes: [
        attr("event.name", "copilot_chat.session.start"),
        attr("gen_ai.conversation.id", conversationId),
        attr("gen_ai.agent.name", agent),
        attr("contoso.team", team.name),
      ],
      traceId, spanId: agentSpanId,
    });
  }

  const allToolsCalled: string[] = [];

  for (let turn = 0; turn < turns; turn++) {
    const chatDurationS = Math.max(latencyProfile.min, logNormal(latencyProfile.p50));
    const chatDurationMs = chatDurationS * 1000;
    const inputTokens = Math.floor(logNormal(
      model === "gpt-5.3-codex" ? 2000 : model === "claude-opus-4.6" ? 6000 : 4000, 0.6));
    const outputTokens = Math.floor(logNormal(
      model === "gpt-5.3-codex" ? 500 : model === "claude-opus-4.6" ? 1200 : 800, 0.6));
    const ttft = Math.max(0.1, logNormal(0.5, 0.4));
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    const chatFailed = turn === errorTurn;

    const chatSpanId = randomSpanId();
    const responseId = `chatcmpl-${randomId().slice(0, 12)}`;
    const chatSpanAttrs = [
      attr("gen_ai.operation.name", "chat"),
      attr("gen_ai.provider.name", "github"),
      attr("gen_ai.request.model", model),
      attr("gen_ai.response.model", responseModel),
      attr("gen_ai.response.id", responseId),
      attr("gen_ai.conversation.id", conversationId),
      attr("gen_ai.request.max_tokens", params.maxTokens),
      attr("gen_ai.request.temperature", params.temperature),
      attr("gen_ai.request.top_p", params.topP),
      attr("copilot_chat.request.max_prompt_tokens", params.maxPromptTokens),
      attr("gen_ai.usage.input_tokens", inputTokens),
      attr("gen_ai.usage.output_tokens", outputTokens),
      attr("gen_ai.response.finish_reasons", chatFailed ? '["error"]' : '["stop"]'),
      attr("copilot_chat.time_to_first_token", Math.round(ttft * 1000)),
      attr("contoso.team", team.name),
    ];

    // captureContent attributes (opt-in, included in seed for demo richness)
    if (turn === 0) {
      chatSpanAttrs.push(attr("gen_ai.input.messages", JSON.stringify([
        { role: "system", content: "You are a helpful coding assistant." },
        { role: "user", content: userPrompt },
      ])));
    }
    if (turn === turns - 1 && !chatFailed) {
      const response = SAMPLE_RESPONSES[Math.floor(Math.random() * SAMPLE_RESPONSES.length)];
      chatSpanAttrs.push(attr("gen_ai.output.messages", JSON.stringify([
        { role: "assistant", content: response },
      ])));
    }

    spans.push({
      traceId, spanId: chatSpanId, parentSpanId: agentSpanId,
      name: `chat ${model}`,
      kind: 3,
      startTimeUnixNano: String(Math.floor(currentTimeMs * 1e6)),
      endTimeUnixNano: String(Math.floor((currentTimeMs + chatDurationMs) * 1e6)),
      attributes: chatSpanAttrs,
      status: { code: chatFailed ? 2 : 0 },
    });

    // gen_ai.client.inference.operation.details event
    logs.push({
      timeUnixNano: String(Math.floor((currentTimeMs + chatDurationMs - 1) * 1e6)),
      severityNumber: 9, severityText: "INFO",
      body: { stringValue: "gen_ai.client.inference.operation.details" },
      attributes: [
        attr("event.name", "gen_ai.client.inference.operation.details"),
        attr("gen_ai.operation.name", "chat"),
        attr("gen_ai.request.model", model),
        attr("gen_ai.response.model", responseModel),
        attr("gen_ai.response.id", responseId),
        attr("gen_ai.usage.input_tokens", inputTokens),
        attr("gen_ai.usage.output_tokens", outputTokens),
        attr("gen_ai.response.finish_reasons", chatFailed ? '["error"]' : '["stop"]'),
      ],
      traceId, spanId: chatSpanId,
    });

    metrics.push(
      { name: "gen_ai.client.operation.duration", value: chatDurationS, attributes: { "gen_ai.request.model": model, "contoso.team": team.name } },
      { name: "gen_ai.client.token.usage", value: inputTokens, attributes: { "gen_ai.request.model": model, "gen_ai.token.type": "input", "contoso.team": team.name } },
      { name: "gen_ai.client.token.usage", value: outputTokens, attributes: { "gen_ai.request.model": model, "gen_ai.token.type": "output", "contoso.team": team.name } },
      { name: "copilot_chat.time_to_first_token", value: ttft, attributes: { "contoso.team": team.name } },
    );

    // copilot_chat.agent.turn event
    logs.push({
      timeUnixNano: String(Math.floor((currentTimeMs + chatDurationMs) * 1e6)),
      severityNumber: 9, severityText: "INFO",
      body: { stringValue: "copilot_chat.agent.turn" },
      attributes: [
        attr("event.name", "copilot_chat.agent.turn"),
        attr("gen_ai.agent.name", agent),
        attr("gen_ai.usage.input_tokens", inputTokens),
        attr("gen_ai.usage.output_tokens", outputTokens),
        attr("copilot_chat.turn_index", turn),
      ],
      traceId, spanId: agentSpanId,
    });

    currentTimeMs += chatDurationMs;

    if (chatFailed) break;

    // Tool calls (weighted, 0-4 per turn)
    const toolCount = Math.floor(randomBetween(0, 5));
    for (let t = 0; t < toolCount; t++) {
      const tool = weightedChoice(TOOL_WEIGHTS, TOOL_TOTAL);
      const toolProfile = TOOL_LATENCY[tool] ?? { min: 20, max: 1000 };
      const toolDurationMs = logNormal((toolProfile.min + toolProfile.max) / 2, 0.5);
      const clampedMs = Math.max(toolProfile.min, Math.min(toolDurationMs, toolProfile.max * 3));
      const success = Math.random() > (tool === "runTests" ? 0.15 : tool === "runCommand" ? 0.08 : 0.02);
      const toolSpanId = randomSpanId();
      const toolArgs = SAMPLE_TOOL_ARGS[tool]?.() ?? "{}";

      const toolSpanAttrs = [
        attr("gen_ai.operation.name", "execute_tool"),
        attr("copilot_chat.tool.name", tool),
        attr("copilot_chat.tool.success", success ? "true" : "false"),
        attr("contoso.team", team.name),
      ];
      // captureContent: include tool arguments
      toolSpanAttrs.push(attr("copilot_chat.tool.arguments", toolArgs));

      spans.push({
        traceId, spanId: toolSpanId, parentSpanId: agentSpanId,
        name: `execute_tool ${tool}`,
        kind: 1,
        startTimeUnixNano: String(Math.floor(currentTimeMs * 1e6)),
        endTimeUnixNano: String(Math.floor((currentTimeMs + clampedMs) * 1e6)),
        attributes: toolSpanAttrs,
        status: { code: success ? 0 : 2 },
      });

      // copilot_chat.tool.call event
      logs.push({
        timeUnixNano: String(Math.floor((currentTimeMs + clampedMs) * 1e6)),
        severityNumber: success ? 9 : 14,
        severityText: success ? "INFO" : "ERROR",
        body: { stringValue: "copilot_chat.tool.call" },
        attributes: [
          attr("event.name", "copilot_chat.tool.call"),
          attr("copilot_chat.tool.name", tool),
          attr("copilot_chat.tool.success", success ? "true" : "false"),
          attr("copilot_chat.tool.duration_ms", Math.round(clampedMs)),
        ],
        traceId, spanId: toolSpanId,
      });

      allToolsCalled.push(tool);

      metrics.push(
        { name: "copilot_chat.tool.call.count", value: 1, attributes: { "copilot_chat.tool.name": tool, "copilot_chat.tool.success": String(success), "contoso.team": team.name } },
        { name: "copilot_chat.tool.call.duration", value: clampedMs, attributes: { "copilot_chat.tool.name": tool, "contoso.team": team.name } },
      );
      currentTimeMs += clampedMs;
    }

    // 5% chance of subagent invocation (nested trace) — only from top-level
    if (!isSubagent && Math.random() < 0.05) {
      const sub = generateAgentInvocation({
        baseTimeMs: currentTimeMs,
        team,
        isSubagent: true,
        parentTraceId: traceId,
        parentSpanId: agentSpanId,
      });
      subagentResults.push(sub);
      const lastSubSpan = sub.spans[sub.spans.length - 1];
      currentTimeMs = Number(BigInt(lastSubSpan.endTimeUnixNano) / 1000000n) + 10;
    }
  }

  const agentDurationMs = currentTimeMs - agentStartMs;

  const agentAttrs = [
    attr("gen_ai.operation.name", "invoke_agent"),
    attr("gen_ai.provider.name", "github"),
    attr("gen_ai.agent.name", agent),
    attr("gen_ai.conversation.id", conversationId),
    attr("gen_ai.request.model", model),
    attr("gen_ai.response.model", responseModel),
    attr("gen_ai.usage.input_tokens", totalInputTokens),
    attr("gen_ai.usage.output_tokens", totalOutputTokens),
    attr("copilot_chat.turn_count", turns),
    attr("contoso.team", team.name),
    ...(isError ? [attr("error.type", "Error")] : []),
  ];
  // captureContent: tool definitions on agent span
  if (allToolsCalled.length > 0) {
    const uniqueTools = [...new Set(allToolsCalled)];
    agentAttrs.push(attr("gen_ai.tool.definitions", JSON.stringify(
      uniqueTools.map(t => ({ type: "function", function: { name: t, description: `Execute ${t} tool` } }))
    )));
  }
  // captureContent: input/output messages on agent span
  agentAttrs.push(attr("gen_ai.input.messages", JSON.stringify([
    { role: "user", content: userPrompt },
  ])));
  if (!isError) {
    agentAttrs.push(attr("gen_ai.output.messages", JSON.stringify([
      { role: "assistant", content: SAMPLE_RESPONSES[Math.floor(Math.random() * SAMPLE_RESPONSES.length)] },
    ])));
  }

  spans.unshift({
    traceId, spanId: agentSpanId, parentSpanId: parentSpan,
    name: `invoke_agent ${agent}`,
    kind: 1,
    startTimeUnixNano: String(Math.floor(agentStartMs * 1e6)),
    endTimeUnixNano: String(Math.floor(currentTimeMs * 1e6)),
    attributes: agentAttrs,
    status: { code: isError ? 2 : 0 },
  });

  metrics.push(
    { name: "copilot_chat.agent.invocation.duration", value: agentDurationMs / 1000, attributes: { "gen_ai.agent.name": agent, "contoso.team": team.name } },
    { name: "copilot_chat.agent.turn.count", value: turns, attributes: { "gen_ai.agent.name": agent, "contoso.team": team.name } },
    { name: "copilot_chat.session.count", value: 1, attributes: { "contoso.team": team.name } },
  );

  // Merge subagent data
  for (const sub of subagentResults) {
    spans.push(...sub.spans);
    metrics.push(...sub.metrics);
    logs.push(...sub.logs);
  }

  return { spans, metrics, logs };
}

async function sendLogs(logs: LogRecord[]) {
  if (logs.length === 0) return;
  const payload = {
    resourceLogs: [{
      resource: { attributes: [attr("service.name", "copilot-chat")] },
      scopeLogs: [{
        scope: { name: "copilot-chat-otel", version: "1.0.0" },
        logRecords: logs,
      }],
    }],
  };
  const res = await fetch(`${ENDPOINT}/v1/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    // Logs pipeline may not be configured — warn once but don't fail.
    if (!logEndpointWarningShown) {
      console.warn(`⚠️  Logs endpoint returned ${res.status} (suppressing repeat warnings; traces & metrics still sent)`);
      logEndpointWarningShown = true;
    }
    return;
  }
}

// ── OTLP transport ─────────────────────────────────────────────
async function sendTraces(spans: Span[]) {
  const payload = {
    resourceSpans: [{
      resource: { attributes: [attr("service.name", "copilot-chat")] },
      scopeSpans: [{
        scope: { name: "copilot-chat-otel", version: "1.0.0" },
        spans,
      }],
    }],
  };
  const res = await fetch(`${ENDPOINT}/v1/traces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Traces: ${res.status} ${await res.text()}`);
}

const HISTOGRAM_BOUNDS = [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10, 30, 60];
const HISTOGRAM_METRIC_NAMES = new Set([
  "gen_ai.client.operation.duration", "gen_ai.client.token.usage",
  "copilot_chat.tool.call.duration", "copilot_chat.time_to_first_token",
  "copilot_chat.agent.invocation.duration", "copilot_chat.agent.turn.count",
]);

function buildHistogramDataPoint(value: number, timestampMs: number, attrs: any[]) {
  const bucketCounts = HISTOGRAM_BOUNDS.map(b => (value <= b ? 1 : 0));
  bucketCounts.push(1);
  return {
    startTimeUnixNano: String(Math.floor((timestampMs - 60000) * 1e6)),
    timeUnixNano: String(Math.floor(timestampMs * 1e6)),
    count: "1", sum: value, min: value, max: value,
    explicitBounds: HISTOGRAM_BOUNDS,
    bucketCounts: bucketCounts.map(String),
    attributes: attrs,
  };
}

async function sendMetrics(metrics: any[], timestampMs: number) {
  const dataPoints = metrics.map(m => {
    const attrs = Object.entries(m.attributes).map(([k, v]) => attr(k, v as string));
    if (HISTOGRAM_METRIC_NAMES.has(m.name)) {
      return {
        name: m.name,
        histogram: {
          dataPoints: [buildHistogramDataPoint(m.value, timestampMs, attrs)],
          aggregationTemporality: 1,
        },
      };
    }
    return {
      name: m.name,
      sum: {
        dataPoints: [{
          asDouble: m.value,
          timeUnixNano: String(Math.floor(timestampMs * 1e6)),
          attributes: attrs,
        }],
        aggregationTemporality: 1,
        isMonotonic: true,
      },
    };
  });

  const payload = {
    resourceMetrics: [{
      resource: { attributes: [attr("service.name", "copilot-chat")] },
      scopeMetrics: [{
        scope: { name: "copilot-chat-otel", version: "1.0.0" },
        metrics: dataPoints,
      }],
    }],
  };
  const res = await fetch(`${ENDPOINT}/v1/metrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Metrics: ${res.status} ${await res.text()}`);
}

// ── Schedule generator ─────────────────────────────────────────
interface ScheduledInvocation {
  timeMs: number;
  team: typeof TEAMS[0];
}

function generateSchedule(): ScheduledInvocation[] {
  const schedule: ScheduledInvocation[] = [];
  const now = Date.now();
  const startMs = now - DAYS * 86400000;

  // Walk hour-by-hour across the time window
  for (let hourOffset = 0; hourOffset < DAYS * 24; hourOffset++) {
    const hourMs = startMs + hourOffset * 3600000;
    const date = new Date(hourMs);
    const dayOfWeek = date.getUTCDay();
    const hourUTC = date.getUTCHours();
    const dayIndex = Math.floor(hourOffset / 24);

    // Weekends: 15% of weekday traffic
    const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.15 : 1.0;
    const hourFactor = workdayActivityMultiplier(hourUTC);
    const growthFactor = adoptionMultiplier(dayIndex, DAYS);

    for (const team of TEAMS) {
      // Base: each dev averages ~0.8 sessions/hour during peak
      const baseRate = team.devs * 0.8;
      const rate = baseRate * hourFactor * weekendFactor * growthFactor * SCALE;
      const count = Math.floor(rate + (Math.random() < (rate % 1) ? 1 : 0));

      for (let i = 0; i < count; i++) {
        schedule.push({
          timeMs: hourMs + Math.floor(Math.random() * 3600000),
          team,
        });
      }
    }
  }

  // Sort chronologically
  schedule.sort((a, b) => a.timeMs - b.timeMs);
  return schedule;
}

// ── Main ───────────────────────────────────────────────────────
const FAST = process.argv.includes("--fast");
const WAVE_DELAY_MS = parseInt(getArg("--wave-delay", FAST ? "200" : "3000"), 10);
const NUM_WAVES = parseInt(getArg("--waves", FAST ? "5" : "30"), 10);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const schedule = generateSchedule();

  console.log(`🏢 Contoso Copilot Monitoring — Seed Data Generator`);
  console.log(`   Endpoint:    ${ENDPOINT}`);
  console.log(`   Time range:  ${DAYS} days`);
  console.log(`   Scale:       ${SCALE}x`);
  console.log(`   Teams:       ${TEAMS.length} (${TEAMS.reduce((s, t) => s + t.devs, 0)} developers)`);
  console.log(`   Invocations: ${schedule.length}`);
  console.log(`   Waves:       ${NUM_WAVES} (${WAVE_DELAY_MS}ms delay between each)`);
  console.log(`   Est. time:   ~${Math.round(NUM_WAVES * WAVE_DELAY_MS / 1000)}s`);
  console.log(``);

  // Split schedule into waves with delays between them so Prometheus
  // sees counters incrementing across multiple scrapes
  const waveSize = Math.ceil(schedule.length / NUM_WAVES);
  const BATCH_SIZE = 20;
  let sent = 0;

  for (let wave = 0; wave < NUM_WAVES; wave++) {
    const waveStart = wave * waveSize;
    const waveEnd = Math.min(waveStart + waveSize, schedule.length);
    const waveItems = schedule.slice(waveStart, waveEnd);

    for (let i = 0; i < waveItems.length; i += BATCH_SIZE) {
      const batch = waveItems.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async ({ timeMs, team }) => {
        const { spans, metrics, logs } = generateAgentInvocation({ baseTimeMs: timeMs, team });
        await sendTraces(spans);
        await sendMetrics(metrics, timeMs);
        await sendLogs(logs);
        return { name: spans[0].name, team: team.name, spans: spans.length, logs: logs.length };
      });

      const results = await Promise.all(promises);
      sent += results.length;

      if (sent % 100 < BATCH_SIZE) {
        const pct = Math.round((sent / schedule.length) * 100);
        const sampleTeams = [...new Set(results.map(r => r.team))].join(", ");
        console.log(`  📊 [${sent}/${schedule.length}] ${pct}% (wave ${wave + 1}/${NUM_WAVES}) — teams: ${sampleTeams}`);
      }
    }

    // Delay between waves so Prometheus scrapes see incremental growth
    if (wave < NUM_WAVES - 1) {
      await sleep(WAVE_DELAY_MS);
    }
  }

  console.log(``);
  console.log(`🚀 Done! ${sent} invocations sent.`);
  console.log(``);
  console.log(`   📊 Grafana  → http://localhost:3001  (admin / contoso)`);
  console.log(`   🔍 Jaeger   → http://localhost:16686`);
  console.log(``);
  console.log(`   Story highlights to look for:`);
  console.log(`   • Adoption ramp: sessions growing ~3x over ${DAYS} days`);
  console.log(`   • Peak hours: 10am-12pm and 2pm-4pm Pacific`);
  console.log(`   • Model mix: GPT-5.3-Codex leads, Opus 4.6 for Security/Payments`);
  console.log(`   • Tool usage: readFile + searchFiles >> runTests`);
  console.log(`   • Team comparison: Security uses Claude Opus 4.6 50%, lowest error rate`);
}

main().catch(e => { console.error("❌", e); process.exit(1); });
