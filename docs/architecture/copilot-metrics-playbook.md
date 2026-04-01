# Copilot Metrics & ROI Playbook

A short reference for what ObserVader measures, how the math works, and what signals are available.

For field-level provenance (metric → official source → seeder → panel), see [Metrics Provenance](metrics-provenance.md).

---

## 1. Data Sources

| Source | What It Provides | Refresh Rate |
|--------|------------------|-------------|
| **Usage Metrics API** (NDJSON) | Adoption (DAU/MAU), completions, chat, LoC, PR lifecycle, code review suggestions, CLI sessions/tokens | Up to 3 UTC days lag |
| **IDE OTel** (VS Code) | Agent traces, LLM call duration, token usage by model, tool call metrics, TTFT, session counts | Real-time |
| **CLI OTel** (Copilot CLI) | Same as IDE OTel **plus**: monetary cost, AI units, cache tokens, session LoC, premium requests, streaming chunk latency | Real-time |

---

## 2. KPI Reference

### Adoption

| KPI | Formula | Data Source |
|-----|---------|-------------|
| **Daily Active Users** | `total_active_users` from NDJSON | Usage Metrics API |
| **Monthly Active Users** | Rolling 28-day unique `total_engaged_users` | Usage Metrics API |
| **CLI Adoption Rate** | `daily_active_cli_users / total_active_users` | Usage Metrics API |
| **Agent Adoption %** | Users with `used_agent=true` / total active users | Usage Metrics API (user-level) |
| **Feature Adoption** | `total_engaged_users` per feature (completions, chat modes, CLI) | Usage Metrics API |

### Code Impact

| KPI | Formula | Data Source |
|-----|---------|-------------|
| **Suggestion Survival Rate** | `total_code_acceptances / total_code_suggestions` | Usage Metrics API |
| **LoC Added (IDE)** | `loc_added_sum` across editors | Usage Metrics API |
| **LoC Added (CLI)** | `session.shutdown → lines_added` summed across sessions | CLI OTel span events |
| **Agent Contribution %** | `loc_added_sum` from agent_edit / total `loc_added_sum` | Usage Metrics API |

### PR Lifecycle

| KPI | Formula | Data Source |
|-----|---------|-------------|
| **Copilot PR Share** | `total_copilot_pr_merged_count / total_pr_merged_count` | Usage Metrics API |
| **Merge Time Delta** | `median_minutes_to_merge_for_copilot_prs − median_minutes_to_merge` | Usage Metrics API |
| **Code Review Suggestion Apply Rate** | `suggestions_applied / suggestions_generated` | Usage Metrics API |

### Agent Observability (OTel)

| KPI | Formula | Data Source |
|-----|---------|-------------|
| **Agent Duration p50/p95** | `histogram_quantile(0.50/0.95, copilot_chat.agent.invocation.duration)` | IDE + CLI OTel |
| **LLM Call Duration by Model** | `histogram_quantile(0.50/0.95, gen_ai.client.operation.duration)` grouped by model | IDE + CLI OTel |
| **Time to First Token** | `histogram_quantile(0.50, copilot_chat.time_to_first_token)` | IDE OTel |
| **Token Usage Rate** | `rate(gen_ai.client.token.usage)` by input/output | IDE + CLI OTel |
| **Tool Call Distribution** | `copilot_chat.tool.call.count` grouped by tool name | IDE + CLI OTel |

### Cost & Efficiency (CLI OTel — new)

| KPI | Formula | Data Source |
|-----|---------|-------------|
| **Cost per Session** | `sum(github.copilot.cost) / count(invoke_agent spans)` | CLI OTel |
| **Cost per Turn** | `github.copilot.cost` on individual `chat` spans | CLI OTel |
| **AI Units per Session** | `sum(github.copilot.aiu)` on `invoke_agent` spans | CLI OTel |
| **Cache Hit Ratio** | `cache_read.input_tokens / (cache_read + cache_creation + input_tokens)` | CLI OTel |
| **Premium Requests per Session** | `session.shutdown → total_premium_requests` | CLI OTel span events |
| **Context Pressure Rate** | Count of `session.truncation` + `session.compaction_start` events / total sessions | CLI OTel span events |

---

## 3. ROI Math

### Seat Utilization (Usage Metrics API)

```
Seat Utilization % = (total_active_users / licensed_seats) × 100
```

Measures whether paid seats are being used. Available from Usage Metrics API + User Management API.

### Cost Efficiency (CLI OTel)

With CLI OTel emitting `github.copilot.cost`:

```
Cost per Session     = sum(github.copilot.cost on invoke_agent spans) / count(sessions)
Cost per Line        = sum(github.copilot.cost) / sum(session.shutdown → lines_added)
Cost per Premium Req = sum(github.copilot.cost) / sum(session.shutdown → total_premium_requests)
```

These are **variable cost metrics** — they differ per developer, per model, per session. They answer: "is the spend justified by the output?"

### Productivity Ratio

```
LoC per Session      = sum(loc_added) / sum(sessions)
Merge Time Savings   = median_minutes_to_merge − median_minutes_to_merge_for_copilot_prs
Acceptance Efficiency = code_acceptance_activity_count / code_generation_activity_count
```

### Example Values (from seeded data)

| Metric | Example Value | Source |
|--------|--------------|--------|
| DAU | ~155 | NDJSON `total_active_users` |
| Suggestion Survival Rate | ~30% | NDJSON `acceptances / suggestions` |
| Copilot PR Share | ~35-50% | NDJSON `copilot_merged / total_merged` |
| Merge Time Delta | −60 to −80 min | NDJSON `copilot_ttm − all_ttm` |
| Agent p50 Duration | ~5-8s | OTel `copilot_chat.agent.invocation.duration` |
| TTFT p50 | ~0.5s | OTel `copilot_chat.time_to_first_token` |
| Token Rate (input) | ~2000-6000/call | OTel `gen_ai.client.token.usage` |

---

## 4. Signal Matrix: What's Measurable Where

| Metric Category | Usage Metrics API | IDE OTel | CLI OTel |
|----------------|-------------------|----------|----------|
| Adoption (DAU/MAU) | ✅ | — | — |
| Completions (suggestions/acceptances) | ✅ | — | — |
| Chat mode breakdown | ✅ | — | — |
| LoC added/removed | ✅ | — | ✅ (span events) |
| PR lifecycle (merge time, reviews) | ✅ | — | — |
| Agent traces (span tree) | — | ✅ | ✅ |
| LLM call latency | — | ✅ | ✅ |
| Token usage by model | — | ✅ | ✅ |
| Tool call metrics | — | ✅ | ✅ |
| Time to first token | — | ✅ | ✅ |
| **Monetary cost** | — | — | ✅ |
| **AI units consumed** | — | — | ✅ |
| **Cache token efficiency** | — | — | ✅ |
| **Premium request count** | — | — | ✅ |
| **Context pressure (truncation/compaction)** | — | — | ✅ |
| **Streaming chunk latency** | — | — | ✅ |
| Session count | — | ✅ | ✅ |
| CLI sessions/tokens/prompts | ✅ | — | ✅ |
| Editor/IDE breakdown | ✅ | — | — |
| Language breakdown | ✅ | — | — |

---

## 5. Remaining Gaps

Even with all three data sources combined, these cannot be computed today:

| Metric | Why |
|--------|-----|
| **Commits created with Copilot** | Not tracked in any API or OTel signal |
| **Which merged PRs used Copilot (attribution)** | No session-to-PR diff matching system |
| **Active coding time** | Not emitted by any signal |
| **Cost from IDE OTel** | `github.copilot.cost` is CLI OTel only — IDE does not emit it |
| **Token usage across all IDEs** | OTel only emits from VS Code and CLI; JetBrains/Visual Studio/Eclipse have no OTel |
| **Per-user cost from Usage Metrics API** | Cost is seat-based ($19/$39 per seat), not variable per user in the API |
