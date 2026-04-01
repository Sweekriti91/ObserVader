---
name: copilot-opentelemetry
description: >
  How to enable and configure OpenTelemetry monitoring for Copilot Chat agent interactions
  in VS Code and the Copilot SDK. Covers traces, metrics, events, backend setup (Aspire,
  Jaeger, Azure, Langfuse, Grafana), security, and trace context propagation.
tags: [copilot, opentelemetry, otel, monitoring, observability, tracing, vs-code, copilot-sdk]
---

# OpenTelemetry Monitoring for Copilot — Complete Guide

## Overview

Copilot Chat in VS Code can export traces, metrics, and events via OpenTelemetry (OTel).
All signal names and attributes follow the **OTel GenAI Semantic Conventions**, so the data
works with any OTel-compatible backend.

OTel monitoring is **off by default** and emits no data until explicitly enabled.

---

## What Gets Collected

### Traces (Span Tree per Agent Interaction)

Each agent interaction produces a hierarchical span tree:
```
invoke_agent copilot                           [~15s]
  ├── chat gpt-4o                              [~3s]   (LLM requests tool calls)
  ├── execute_tool readFile                    [~50ms]
  ├── execute_tool runCommand                  [~2s]
  ├── chat gpt-4o                              [~4s]   (LLM generates final response)
  └── (span ends)
```

| Span Type | Description | Key Attributes |
|-----------|------------|----------------|
| `invoke_agent` | Entire agent orchestration | Agent name, conversation ID, turn count, total tokens |
| `chat` | Single LLM API call | Model, token counts, response time, finish reason |
| `execute_tool` | Single tool invocation | Tool name, tool type, duration, success status |

When a subagent is invoked, trace context is automatically propagated — the subagent's
`invoke_agent` span appears as a child of the parent's `execute_tool` span.

### Metrics

| Metric | Type | Description |
|--------|------|------------|
| `gen_ai.client.operation.duration` | Histogram | LLM API call duration (seconds) |
| `gen_ai.client.token.usage` | Histogram | Token counts (input and output) |
| `copilot_chat.tool.call.count` | Counter | Tool invocations by name and success |
| `copilot_chat.tool.call.duration` | Histogram | Tool execution latency (milliseconds) |
| `copilot_chat.agent.invocation.duration` | Histogram | Agent end-to-end duration (seconds) |
| `copilot_chat.agent.turn.count` | Histogram | LLM round-trips per agent invocation |
| `copilot_chat.session.count` | Counter | Chat sessions started |
| `copilot_chat.time_to_first_token` | Histogram | Time to first SSE token (seconds) |

Metrics include attributes for filtering: `gen_ai.request.model`, `gen_ai.provider.name`, `gen_ai.tool.name`, `error.type`.

### Events

| Event | Description |
|-------|------------|
| `gen_ai.client.inference.operation.details` | Full LLM call metadata with model, tokens, finish reason |
| `copilot_chat.session.start` | Emitted when a new chat session begins |
| `copilot_chat.tool.call` | Per-tool invocation with timing and error details |
| `copilot_chat.agent.turn` | Per-turn LLM round-trip with token counts |

### Resource Attributes

All signals carry:
| Attribute | Value |
|-----------|-------|
| `service.name` | `copilot-chat` (configurable with `OTEL_SERVICE_NAME`) |
| `service.version` | Extension version |
| `session.id` | Unique per VS Code window |

Add custom resource attributes for organizational filtering:
```bash
export OTEL_RESOURCE_ATTRIBUTES="team.id=platform,department=engineering"
```

---

## Enabling OTel Monitoring

OTel activates when **any** of these conditions is true:
1. `github.copilot.chat.otel.enabled` = `true`
2. `COPILOT_OTEL_ENABLED=true`
3. `OTEL_EXPORTER_OTLP_ENDPOINT` is set

### VS Code Settings

| Setting | Type | Default | Description |
|---------|------|---------|------------|
| `github.copilot.chat.otel.enabled` | boolean | `false` | Enable OTel emission |
| `github.copilot.chat.otel.exporterType` | string | `"otlp-http"` | `otlp-http`, `otlp-grpc`, `console`, or `file` |
| `github.copilot.chat.otel.otlpEndpoint` | string | `"http://localhost:4318"` | OTLP collector endpoint |
| `github.copilot.chat.otel.captureContent` | boolean | `false` | Capture full prompt and response content |
| `github.copilot.chat.otel.outfile` | string | `""` | File path for JSON-lines output |

### Environment Variables (Take Precedence Over Settings)

| Variable | Default | Description |
|----------|---------|------------|
| `COPILOT_OTEL_ENABLED` | `false` | Enable OTel |
| `COPILOT_OTEL_ENDPOINT` | — | OTLP endpoint (takes precedence over `OTEL_EXPORTER_OTLP_ENDPOINT`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | Standard OTel OTLP endpoint |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` | Only `grpc` changes behavior |
| `OTEL_SERVICE_NAME` | `copilot-chat` | Service name in resource attributes |
| `OTEL_RESOURCE_ATTRIBUTES` | — | Extra attributes (`key1=val1,key2=val2`) |
| `COPILOT_OTEL_CAPTURE_CONTENT` | `false` | Capture full prompt and response content |
| `OTEL_EXPORTER_OTLP_HEADERS` | — | Auth headers (`Authorization=Bearer token`) |

---

## Backend Setup

### Aspire Dashboard (Simplest — Local Development)

```bash
docker run --rm -d \
  -p 18888:18888 \
  -p 4317:18889 \
  --name aspire-dashboard \
  mcr.microsoft.com/dotnet/aspire-dashboard:latest
```

VS Code settings:
```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.exporterType": "otlp-grpc",
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:4317"
}
```

Open `http://localhost:18888` → **Traces** tab.

### Jaeger (Open-Source Distributed Tracing)

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/jaeger:latest
```

VS Code settings:
```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:4318"
}
```

Open `http://localhost:16686` → Select service `copilot-chat` → **Find Traces**.

### Azure Application Insights

1. Deploy an OTel Collector with the Azure Monitor exporter
2. Point VS Code `otlpEndpoint` at the collector's OTLP endpoint
3. Configure the collector to export to your Application Insights connection string

See: [Azure Monitor exporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/azuremonitorexporter)

### Langfuse (LLM Observability)

```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:3000/api/public/otel",
  "github.copilot.chat.otel.captureContent": true
}
```

Set auth: `export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic <base64-creds>"`

See: [Langfuse OTel docs](https://langfuse.com/docs/opentelemetry/introduction)

### Other Compatible Backends
- **Grafana Tempo** — `https://grafana.com/oss/tempo/`
- **Honeycomb** — `https://www.honeycomb.io/`
- **Datadog** — `https://www.datadoghq.com/`
- Any OTLP-compatible backend

---

## Content Capture

By default, **no prompt content, responses, or tool arguments** are captured. Only metadata
(model names, token counts, durations) is included.

To capture full content:
```json
{ "github.copilot.chat.otel.captureContent": true }
```
Or: `export COPILOT_OTEL_CAPTURE_CONTENT=true`

> ⚠️ **Caution**: Content capture can include sensitive information such as code, file contents,
> and user prompts. Only enable this in trusted environments.

---

## Copilot SDK — OTel Instrumentation

For applications built with `@github/copilot-sdk`:

### Configuration by Language

**Node.js / TypeScript**:
```js
import { CopilotClient } from "@github/copilot-sdk";
const client = new CopilotClient({
  telemetry: { otlpEndpoint: "http://localhost:4318" },
});
```

**Python**:
```python
from copilot import CopilotClient, SubprocessConfig
client = CopilotClient(SubprocessConfig(
    telemetry={"otlp_endpoint": "http://localhost:4318"},
))
# Install with: pip install copilot-sdk[telemetry]
```

**Go**:
```go
client, err := copilot.NewClient(copilot.ClientOptions{
    Telemetry: &copilot.TelemetryConfig{
        OTLPEndpoint: "http://localhost:4318",
    },
})
```

**.NET**:
```csharp
var client = new CopilotClient(new CopilotClientOptions {
    Telemetry = new TelemetryConfig { OtlpEndpoint = "http://localhost:4318" },
});
```

### TelemetryConfig Options

| Option | Node.js | Python | Go | .NET |
|--------|---------|--------|----|------|
| OTLP endpoint | `otlpEndpoint` | `otlp_endpoint` | `OTLPEndpoint` | `OtlpEndpoint` |
| File path | `filePath` | `file_path` | `FilePath` | `FilePath` |
| Exporter type | `exporterType` | `exporter_type` | `ExporterType` | `ExporterType` |
| Source name | `sourceName` | `source_name` | `SourceName` | `SourceName` |
| Capture content | `captureContent` | `capture_content` | `CaptureContent` | `CaptureContent` |

### Trace Context Propagation

SDK ↔ CLI propagates W3C `traceparent`/`tracestate` on JSON-RPC payloads:
- **Node.js**: provide `onGetTraceContext` callback for outbound propagation
- **Python/Go/.NET**: automatic when OTel is configured

---

## Security & Privacy Summary

| Aspect | Detail |
|--------|--------|
| Off by default | No data emitted unless explicitly enabled; zero runtime overhead |
| No content by default | Prompts/responses require opt-in with `captureContent` |
| No PII in defaults | Session IDs, model names, token counts are not PII |
| User-configured endpoints | Data goes only where you point it; no phone-home behavior |
