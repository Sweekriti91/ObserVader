/**
 * Contoso Copilot Monitoring — CLI OTel Synthetic Data Seeder
 *
 * Generates Copilot CLI-specific OTel telemetry (traces + metrics) that follows
 * the official CLI OTel specification:
 *   https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#opentelemetry-monitoring
 *
 * Key differences from seed-data.ts (IDE OTel):
 *   - service.name = "github-copilot" (CLI) vs "copilot-chat" (IDE)
 *   - Emits github.copilot.cost and github.copilot.aiu on spans
 *   - Emits cache token attributes (cache_read, cache_creation)
 *   - Emits session.shutdown span events with lines_added/removed, files_modified_count, total_premium_requests
 *   - Emits session.truncation and session.compaction events
 *   - Uses CLI tool names: bash, view, edit, create, grep, glob, web_fetch, task
 *   - Emits gen_ai.client.operation.time_per_output_chunk metric
 *
 * Usage:
 *   npx tsx seed-cli-data.ts                              # 7 days, ~80 sessions
 *   npx tsx seed-cli-data.ts --days 1                     # Last 24h only
 *   npx tsx seed-cli-data.ts --scale 3                    # 3x more data
 *   npx tsx seed-cli-data.ts --endpoint http://host:4318
 */

const ENDPOINT = getArg("--endpoint", "http://localhost:4318");
const DAYS = parseInt(getArg("--days", "7"), 10);
const SCALE = parseFloat(getArg("--scale", "1"));

function getArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

// ── Contoso CLI users (subset of org) ──────────────────────────
// CLI adoption is lower than IDE — ~15-25 users across teams
const TEAMS = [
  { name: "Platform",      cliDevs: 8,  modelMix: { "claude-sonnet-4.6": 0.45, "gpt-5.3-codex": 0.30, "claude-opus-4.6": 0.25 }, errorRate: 0.02 },
  { name: "Data-Platform", cliDevs: 6,  modelMix: { "claude-sonnet-4.6": 0.35, "gpt-5.3-codex": 0.25, "claude-opus-4.6": 0.40 }, errorRate: 0.02 },
  { name: "Security",      cliDevs: 5,  modelMix: { "claude-opus-4.6": 0.60, "claude-sonnet-4.6": 0.25, "gpt-5.3-codex": 0.15 }, errorRate: 0.01 },
  { name: "Payments",      cliDevs: 3,  modelMix: { "claude-sonnet-4.6": 0.40, "claude-opus-4.6": 0.35, "gpt-5.3-codex": 0.25 }, errorRate: 0.03 },
  { name: "Frontend",      cliDevs: 2,  modelMix: { "gpt-5.3-codex": 0.50, "claude-sonnet-4.6": 0.35, "claude-opus-4.6": 0.15 }, errorRate: 0.04 },
];

// CLI tool distribution — bash dominates, followed by edit and view
const TOOL_WEIGHTS: [string, number][] = [
  ["bash", 30], ["view", 20], ["edit", 15], ["grep", 10],
  ["glob", 8], ["create", 5], ["web_fetch", 3], ["task", 3],
  ["apply_patch", 3], ["ask_user", 2], ["skill", 1],
];
const TOOL_TOTAL = TOOL_WEIGHTS.reduce((s, [, w]) => s + w, 0);

// Model-specific latency profiles (seconds) — CLI tends to be longer sessions
const MODEL_LATENCY: Record<string, { min: number; p50: number; p95: number }> = {
  "claude-sonnet-4.6": { min: 0.6, p50: 2.0, p95: 5.0 },
  "claude-opus-4.6":   { min: 1.2, p50: 4.0, p95: 10.0 },
  "gpt-5.3-codex":     { min: 0.5, p50: 1.5, p95: 4.0 },
};

// Model-specific cost per 1K tokens (approximate USD) — for github.copilot.cost
const MODEL_COST_PER_1K: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4.6": { input: 0.003, output: 0.015 },
  "claude-opus-4.6":   { input: 0.015, output: 0.075 },
  "gpt-5.3-codex":     { input: 0.002, output: 0.010 },
};

// AIU rates per model (approximate)
const MODEL_AIU_PER_REQUEST: Record<string, number> = {
  "claude-sonnet-4.6": 1.0,
  "claude-opus-4.6":   5.0,
  "gpt-5.3-codex":     1.0,
};

// Tool-specific latency profiles (ms)
const TOOL_LATENCY: Record<string, { min: number; max: number }> = {
  bash: { min: 500, max: 10000 }, view: { min: 10, max: 200 },
  edit: { min: 20, max: 400 }, grep: { min: 50, max: 800 },
  glob: { min: 5, max: 100 }, create: { min: 15, max: 300 },
  web_fetch: { min: 200, max: 5000 }, task: { min: 3000, max: 30000 },
  apply_patch: { min: 30, max: 500 }, ask_user: { min: 1000, max: 15000 },
  skill: { min: 100, max: 2000 },
};

// CLI prompts
const CLI_PROMPTS = [
  "Fix the failing CI pipeline in .github/workflows/deploy.yml",
  "Refactor the database migration to add an index on user_email",
  "Write a bash script to rotate log files older than 30 days",
  "Find all SQL injection vulnerabilities in the API layer",
  "Create a Dockerfile for the new microservice in services/billing",
  "Debug why the integration tests are flaky on the payments module",
  "Review the Terraform config and fix the security group rules",
  "Optimize the data pipeline — the nightly ETL takes 4 hours",
];

const CLI_RESPONSES = [
  "Fixed the deploy workflow. The issue was a missing environment variable `DEPLOY_KEY` in the production job. I've added it to the secrets reference and updated the step.",
  "Added the migration file `20260401_add_user_email_index.sql`. The index is created concurrently to avoid locking the table during deployment.",
  "Created `scripts/rotate-logs.sh` with configurable retention days. Uses `find -mtime` for selection and compresses before archiving.",
  "Found 3 SQL injection vectors in `api/handlers/search.go`. All use string concatenation instead of parameterized queries. Fixed all three.",
];

// ── Helpers ────────────────────────────────────────────────────
function randomId(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
  ).join("");
}
function randomTraceId(): string { return randomId().slice(0, 32); }
function randomSpanId(): string { return randomId().slice(0, 16); }
function randomBetween(min: number, max: number): number { return min + Math.random() * (max - min); }

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
  return "claude-sonnet-4.6";
}

function workdayActivityMultiplier(hourUTC: number): number {
  const localHour = (hourUTC - 8 + 24) % 24;
  if (localHour < 7 || localHour > 19) return 0.05;
  if (localHour < 9 || localHour > 17) return 0.2;
  if (localHour >= 12 && localHour < 13) return 0.6;
  if (localHour >= 10 && localHour < 12) return 1.0;
  if (localHour >= 14 && localHour < 16) return 0.95;
  return 0.7;
}

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
  events?: SpanEvent[];
  status: { code: number };
}

interface SpanEvent {
  timeUnixNano: string;
  name: string;
  attributes: { key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number } }[];
}

function attr(key: string, value: string | number) {
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { key, value: { intValue: String(value) } }
      : { key, value: { doubleValue: value } };
  }
  return { key, value: { stringValue: value } };
}

// ── Invocation generator ───────────────────────────────────────
interface InvocationResult {
  spans: Span[];
  metrics: any[];
}

function generateCLIInvocation(baseTimeMs: number, team: typeof TEAMS[0]): InvocationResult {
  const traceId = randomTraceId();
  const model = pickModel(team.modelMix);
  const latencyProfile = MODEL_LATENCY[model] ?? MODEL_LATENCY["claude-sonnet-4.6"];
  const costProfile = MODEL_COST_PER_1K[model] ?? MODEL_COST_PER_1K["claude-sonnet-4.6"];
  const aiuPerReq = MODEL_AIU_PER_REQUEST[model] ?? 1.0;
  const conversationId = randomId().slice(0, 8);
  const turns = Math.floor(randomBetween(2, 8));
  const isError = Math.random() < team.errorRate;
  const errorTurn = isError ? Math.floor(Math.random() * turns) : -1;

  const spans: Span[] = [];
  const metrics: any[] = [];
  const agentSpanId = randomSpanId();
  const agentStartMs = baseTimeMs;
  let currentTimeMs = baseTimeMs;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCost = 0;
  let totalAiu = 0;
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;
  let totalFilesModified = 0;
  let premiumRequests = 0;

  const userPrompt = CLI_PROMPTS[Math.floor(Math.random() * CLI_PROMPTS.length)];

  for (let turn = 0; turn < turns; turn++) {
    const chatDurationS = Math.max(latencyProfile.min, logNormal(latencyProfile.p50));
    const chatDurationMs = chatDurationS * 1000;
    const inputTokens = Math.floor(logNormal(model === "claude-opus-4.6" ? 8000 : 4000, 0.6));
    const outputTokens = Math.floor(logNormal(model === "claude-opus-4.6" ? 1500 : 800, 0.6));
    const cacheReadTokens = Math.floor(inputTokens * randomBetween(0.3, 0.7));
    const cacheCreationTokens = Math.floor(inputTokens * randomBetween(0.05, 0.15));
    const ttft = Math.max(0.1, logNormal(0.6, 0.4));
    const timePerChunk = Math.max(0.01, logNormal(0.05, 0.4));

    const turnCost = (inputTokens * costProfile.input + outputTokens * costProfile.output) / 1000;
    const turnAiu = aiuPerReq;

    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalCacheReadTokens += cacheReadTokens;
    totalCacheCreationTokens += cacheCreationTokens;
    totalCost += turnCost;
    totalAiu += turnAiu;
    premiumRequests++;

    const chatFailed = turn === errorTurn;
    const chatSpanId = randomSpanId();
    const responseId = `chatcmpl-${randomId().slice(0, 12)}`;

    spans.push({
      traceId, spanId: chatSpanId, parentSpanId: agentSpanId,
      name: `chat ${model}`,
      kind: 3, // CLIENT
      startTimeUnixNano: String(Math.floor(currentTimeMs * 1e6)),
      endTimeUnixNano: String(Math.floor((currentTimeMs + chatDurationMs) * 1e6)),
      attributes: [
        attr("gen_ai.operation.name", "chat"),
        attr("gen_ai.provider.name", "github"),
        attr("gen_ai.request.model", model),
        attr("gen_ai.response.model", model),
        attr("gen_ai.response.id", responseId),
        attr("gen_ai.conversation.id", conversationId),
        attr("gen_ai.usage.input_tokens", inputTokens),
        attr("gen_ai.usage.output_tokens", outputTokens),
        attr("gen_ai.usage.cache_read.input_tokens", cacheReadTokens),
        attr("gen_ai.usage.cache_creation.input_tokens", cacheCreationTokens),
        attr("gen_ai.response.finish_reasons", chatFailed ? '["error"]' : '["stop"]'),
        attr("github.copilot.cost", turnCost),
        attr("github.copilot.aiu", turnAiu),
        attr("github.copilot.server_duration", chatDurationS * 0.95),
        attr("github.copilot.turn_id", `turn-${turn}`),
        attr("contoso.team", team.name),
      ],
      status: { code: chatFailed ? 2 : 0 },
    });

    metrics.push(
      { name: "gen_ai.client.operation.duration", value: chatDurationS, attributes: { "gen_ai.operation.name": "chat", "gen_ai.request.model": model, "contoso.team": team.name } },
      { name: "gen_ai.client.token.usage", value: inputTokens, attributes: { "gen_ai.request.model": model, "gen_ai.token.type": "input", "contoso.team": team.name } },
      { name: "gen_ai.client.token.usage", value: outputTokens, attributes: { "gen_ai.request.model": model, "gen_ai.token.type": "output", "contoso.team": team.name } },
      { name: "gen_ai.client.operation.time_to_first_chunk", value: ttft, attributes: { "gen_ai.request.model": model, "contoso.team": team.name } },
      { name: "gen_ai.client.operation.time_per_output_chunk", value: timePerChunk, attributes: { "gen_ai.request.model": model, "contoso.team": team.name } },
    );

    currentTimeMs += chatDurationMs;
    if (chatFailed) break;

    // Tool calls — CLI sessions tend to have more tool calls per turn
    const toolCount = Math.floor(randomBetween(1, 6));
    for (let t = 0; t < toolCount; t++) {
      const tool = weightedChoice(TOOL_WEIGHTS, TOOL_TOTAL);
      const toolProfile = TOOL_LATENCY[tool] ?? { min: 20, max: 1000 };
      const toolDurationMs = logNormal((toolProfile.min + toolProfile.max) / 2, 0.5);
      const clampedMs = Math.max(toolProfile.min, Math.min(toolDurationMs, toolProfile.max * 3));
      const success = Math.random() > (tool === "bash" ? 0.10 : tool === "task" ? 0.08 : 0.02);

      const toolSpanId = randomSpanId();
      spans.push({
        traceId, spanId: toolSpanId, parentSpanId: agentSpanId,
        name: `execute_tool ${tool}`,
        kind: 1, // INTERNAL
        startTimeUnixNano: String(Math.floor(currentTimeMs * 1e6)),
        endTimeUnixNano: String(Math.floor((currentTimeMs + clampedMs) * 1e6)),
        attributes: [
          attr("gen_ai.operation.name", "execute_tool"),
          attr("gen_ai.tool.name", tool),
          attr("gen_ai.tool.type", "function"),
          attr("gen_ai.tool.call.id", `call-${randomId().slice(0, 8)}`),
          attr("contoso.team", team.name),
        ],
        status: { code: success ? 0 : 2 },
      });

      metrics.push(
        { name: "github.copilot.tool.call.count", value: 1, attributes: { "gen_ai.tool.name": tool, "success": String(success), "contoso.team": team.name } },
        { name: "github.copilot.tool.call.duration", value: clampedMs / 1000, attributes: { "gen_ai.tool.name": tool, "contoso.team": team.name } },
      );

      // Track file modifications from edit/create/apply_patch tools
      if ((tool === "edit" || tool === "apply_patch") && success) {
        totalFilesModified++;
        totalLinesAdded += Math.floor(randomBetween(5, 50));
        totalLinesRemoved += Math.floor(randomBetween(2, 30));
      } else if (tool === "create" && success) {
        totalFilesModified++;
        totalLinesAdded += Math.floor(randomBetween(20, 150));
      }

      currentTimeMs += clampedMs;
    }
  }

  const agentDurationMs = currentTimeMs - agentStartMs;
  const agentDurationS = agentDurationMs / 1000;

  // Build span events for the agent span
  const agentEvents: SpanEvent[] = [];

  // 15% chance of context truncation during session
  if (Math.random() < 0.15) {
    const preTokens = Math.floor(randomBetween(180000, 400000));
    const tokensRemoved = Math.floor(preTokens * randomBetween(0.1, 0.3));
    agentEvents.push({
      timeUnixNano: String(Math.floor((agentStartMs + agentDurationMs * 0.6) * 1e6)),
      name: "github.copilot.session.truncation",
      attributes: [
        attr("github.copilot.token_limit", 200000),
        attr("github.copilot.pre_tokens", preTokens),
        attr("github.copilot.post_tokens", preTokens - tokensRemoved),
        attr("github.copilot.tokens_removed", tokensRemoved),
        attr("github.copilot.messages_removed", Math.floor(randomBetween(2, 8))),
      ],
    });
  }

  // 10% chance of compaction
  if (Math.random() < 0.10) {
    const compactTime = agentStartMs + agentDurationMs * 0.5;
    const preTokens = Math.floor(randomBetween(150000, 300000));
    const tokensRemoved = Math.floor(preTokens * randomBetween(0.3, 0.6));
    agentEvents.push(
      {
        timeUnixNano: String(Math.floor(compactTime * 1e6)),
        name: "github.copilot.session.compaction_start",
        attributes: [],
      },
      {
        timeUnixNano: String(Math.floor((compactTime + 3000) * 1e6)),
        name: "github.copilot.session.compaction_complete",
        attributes: [
          attr("github.copilot.success", "true"),
          attr("github.copilot.pre_tokens", preTokens),
          attr("github.copilot.post_tokens", preTokens - tokensRemoved),
          attr("github.copilot.tokens_removed", tokensRemoved),
          attr("github.copilot.messages_removed", Math.floor(randomBetween(5, 20))),
        ],
      },
    );
  }

  // 8% chance of skill invocation
  if (Math.random() < 0.08) {
    const skillNames = ["code-review", "test-generation", "security-audit", "api-design"];
    agentEvents.push({
      timeUnixNano: String(Math.floor((agentStartMs + agentDurationMs * 0.3) * 1e6)),
      name: "github.copilot.skill.invoked",
      attributes: [
        attr("github.copilot.skill.name", skillNames[Math.floor(Math.random() * skillNames.length)]),
        attr("github.copilot.skill.path", ".github/skills/"),
      ],
    });
  }

  // Session shutdown event — always emitted at end
  agentEvents.push({
    timeUnixNano: String(Math.floor(currentTimeMs * 1e6)),
    name: "github.copilot.session.shutdown",
    attributes: [
      attr("github.copilot.shutdown_type", "normal"),
      attr("github.copilot.total_premium_requests", premiumRequests),
      attr("github.copilot.lines_added", totalLinesAdded),
      attr("github.copilot.lines_removed", totalLinesRemoved),
      attr("github.copilot.files_modified_count", totalFilesModified),
    ],
  });

  // Agent (invoke_agent) span — root of the trace
  spans.unshift({
    traceId, spanId: agentSpanId,
    name: "invoke_agent copilot",
    kind: 3, // CLIENT
    startTimeUnixNano: String(Math.floor(agentStartMs * 1e6)),
    endTimeUnixNano: String(Math.floor(currentTimeMs * 1e6)),
    attributes: [
      attr("gen_ai.operation.name", "invoke_agent"),
      attr("gen_ai.provider.name", "github"),
      attr("gen_ai.agent.id", conversationId),
      attr("gen_ai.agent.version", "1.0.7"),
      attr("gen_ai.conversation.id", conversationId),
      attr("gen_ai.request.model", model),
      attr("gen_ai.response.model", model),
      attr("gen_ai.response.finish_reasons", isError ? '["error"]' : '["stop"]'),
      attr("gen_ai.usage.input_tokens", totalInputTokens),
      attr("gen_ai.usage.output_tokens", totalOutputTokens),
      attr("gen_ai.usage.cache_read.input_tokens", totalCacheReadTokens),
      attr("gen_ai.usage.cache_creation.input_tokens", totalCacheCreationTokens),
      attr("github.copilot.turn_count", turns),
      attr("github.copilot.cost", totalCost),
      attr("github.copilot.aiu", totalAiu),
      attr("contoso.team", team.name),
      ...(isError ? [attr("error.type", "Error")] : []),
    ],
    events: agentEvents,
    status: { code: isError ? 2 : 0 },
  });

  // Agent-level metrics
  metrics.push(
    { name: "gen_ai.client.operation.duration", value: agentDurationS, attributes: { "gen_ai.operation.name": "invoke_agent", "gen_ai.request.model": model, "contoso.team": team.name } },
    { name: "github.copilot.agent.turn.count", value: turns, attributes: { "gen_ai.agent.name": "copilot", "contoso.team": team.name } },
    // ROI metrics — cost, AIU, cache, session outcome
    { name: "github.copilot.cost", value: totalCost, attributes: { "gen_ai.request.model": model, "contoso.team": team.name } },
    { name: "github.copilot.aiu", value: totalAiu, attributes: { "gen_ai.request.model": model, "contoso.team": team.name } },
    { name: "github.copilot.cache_read_tokens", value: totalCacheReadTokens, attributes: { "gen_ai.request.model": model, "contoso.team": team.name } },
    { name: "github.copilot.cache_creation_tokens", value: totalCacheCreationTokens, attributes: { "gen_ai.request.model": model, "contoso.team": team.name } },
    { name: "github.copilot.session.lines_added", value: totalLinesAdded, attributes: { "contoso.team": team.name } },
    { name: "github.copilot.session.lines_removed", value: totalLinesRemoved, attributes: { "contoso.team": team.name } },
    { name: "github.copilot.session.files_modified", value: totalFilesModified, attributes: { "contoso.team": team.name } },
    { name: "github.copilot.session.premium_requests", value: premiumRequests, attributes: { "contoso.team": team.name } },
  );

  return { spans, metrics };
}

// ── OTLP transport ─────────────────────────────────────────────
const SERVICE_NAME = "github-copilot"; // CLI default, distinct from IDE's "copilot-chat"

async function sendTraces(spans: Span[]) {
  const payload = {
    resourceSpans: [{
      resource: { attributes: [attr("service.name", SERVICE_NAME), attr("service.version", "1.0.7")] },
      scopeSpans: [{
        scope: { name: "github.copilot", version: "1.0.7" },
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
  "github.copilot.tool.call.duration",
  "gen_ai.client.operation.time_to_first_chunk",
  "gen_ai.client.operation.time_per_output_chunk",
  "github.copilot.agent.turn.count",
  "github.copilot.cost", "github.copilot.aiu",
  "github.copilot.cache_read_tokens", "github.copilot.cache_creation_tokens",
  "github.copilot.session.lines_added", "github.copilot.session.lines_removed",
  "github.copilot.session.files_modified", "github.copilot.session.premium_requests",
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
      resource: { attributes: [attr("service.name", SERVICE_NAME), attr("service.version", "1.0.7")] },
      scopeMetrics: [{
        scope: { name: "github.copilot", version: "1.0.7" },
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
function generateSchedule(): { timeMs: number; team: typeof TEAMS[0] }[] {
  const schedule: { timeMs: number; team: typeof TEAMS[0] }[] = [];
  const now = Date.now();
  const startMs = now - DAYS * 86400000;

  for (let hourOffset = 0; hourOffset < DAYS * 24; hourOffset++) {
    const hourMs = startMs + hourOffset * 3600000;
    const date = new Date(hourMs);
    const dayOfWeek = date.getUTCDay();
    const hourUTC = date.getUTCHours();
    const dayIndex = Math.floor(hourOffset / 24);

    const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.10 : 1.0;
    const hourFactor = workdayActivityMultiplier(hourUTC);
    const growthFactor = adoptionMultiplier(dayIndex, DAYS);

    for (const team of TEAMS) {
      // CLI usage is sparser — ~0.15 sessions/dev/hour during peak
      const baseRate = team.cliDevs * 0.15;
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

  schedule.sort((a, b) => a.timeMs - b.timeMs);
  return schedule;
}

// ── Main ───────────────────────────────────────────────────────
const WAVE_DELAY_MS = parseInt(getArg("--wave-delay", "2000"), 10);
const NUM_WAVES = parseInt(getArg("--waves", "15"), 10);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const schedule = generateSchedule();

  console.log(`🖥️  Contoso Copilot CLI — OTel Seed Data Generator`);
  console.log(`   Endpoint:     ${ENDPOINT}`);
  console.log(`   Service name: ${SERVICE_NAME}`);
  console.log(`   Time range:   ${DAYS} days`);
  console.log(`   Scale:        ${SCALE}x`);
  console.log(`   Teams:        ${TEAMS.length} (${TEAMS.reduce((s, t) => s + t.cliDevs, 0)} CLI developers)`);
  console.log(`   Sessions:     ${schedule.length}`);
  console.log(`   Waves:        ${NUM_WAVES} (${WAVE_DELAY_MS}ms delay between each)`);
  console.log(`   Est. time:    ~${Math.round(NUM_WAVES * WAVE_DELAY_MS / 1000)}s`);
  console.log(``);

  const waveSize = Math.ceil(schedule.length / NUM_WAVES);
  const BATCH_SIZE = 10;
  let sent = 0;

  for (let wave = 0; wave < NUM_WAVES; wave++) {
    const waveStart = wave * waveSize;
    const waveEnd = Math.min(waveStart + waveSize, schedule.length);
    const waveItems = schedule.slice(waveStart, waveEnd);

    for (let i = 0; i < waveItems.length; i += BATCH_SIZE) {
      const batch = waveItems.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async ({ timeMs, team }) => {
        const { spans, metrics } = generateCLIInvocation(timeMs, team);
        await sendTraces(spans);
        await sendMetrics(metrics, timeMs);
        return { team: team.name, spans: spans.length };
      });

      const results = await Promise.all(promises);
      sent += results.length;

      if (sent % 50 < BATCH_SIZE) {
        const pct = Math.round((sent / schedule.length) * 100);
        const sampleTeams = [...new Set(results.map(r => r.team))].join(", ");
        console.log(`  📊 [${sent}/${schedule.length}] ${pct}% (wave ${wave + 1}/${NUM_WAVES}) — teams: ${sampleTeams}`);
      }
    }

    if (wave < NUM_WAVES - 1) {
      await sleep(WAVE_DELAY_MS);
    }
  }

  console.log(``);
  console.log(`🚀 Done! ${sent} CLI sessions sent.`);
  console.log(``);
  console.log(`   📊 Grafana  → http://localhost:3001`);
  console.log(`   🔍 Jaeger   → http://localhost:16686  (service: ${SERVICE_NAME})`);
  console.log(``);
  console.log(`   CLI-specific signals to look for:`);
  console.log(`   • service.name: ${SERVICE_NAME} (separate from copilot-chat)`);
  console.log(`   • github.copilot.cost on invoke_agent + chat spans`);
  console.log(`   • Cache token attributes on chat spans`);
  console.log(`   • session.shutdown events with lines_added/removed`);
  console.log(`   • CLI tool distribution: bash >> view >> edit`);
}

main().catch(e => { console.error("❌", e); process.exit(1); });
