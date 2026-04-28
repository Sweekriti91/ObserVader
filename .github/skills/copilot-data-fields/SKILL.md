---
name: copilot-data-fields
description: >
  Complete reference for all fields in Copilot usage metrics API responses and NDJSON exports.
  Covers activity fields, chat mode breakdowns, LoC metrics, dimensional breakdowns, user flags,
  version tracking, and pull request lifecycle fields.
tags: [copilot, metrics, api, fields, ndjson, data, schema, reference]
---

# Copilot Metrics Data Fields — Complete Reference

## Core Activity Fields

| Field | Description | Notes |
|-------|------------|-------|
| `user_initiated_interaction_count` | Number of explicit prompts sent to Copilot | Does NOT count: opening chat panel, switching modes, keyboard shortcuts, config changes |
| `code_generation_activity_count` | Number of distinct Copilot output events | Includes comments and docstrings. One prompt can produce multiple generations (each code block counts separately) |
| `code_acceptance_activity_count` | Number of suggestions/code blocks accepted | Counts: "apply to file," "insert at cursor," "insert into terminal," Copy button. Does NOT count: manual OS clipboard (Ctrl+C) |

> **Important**: `code_generation_activity_count` is NOT directly comparable to `user_initiated_interaction_count`
> since one prompt can produce multiple generations.

---

## Chat Mode Breakdown Fields

| Field | Description |
|-------|------------|
| `chat_panel_agent_mode` | Interactions in the chat panel with agent mode selected |
| `chat_panel_ask_mode` | Interactions in the chat panel with ask mode selected |
| `chat_panel_edit_mode` | Interactions in the chat panel with edit mode selected |
| `chat_panel_custom_mode` | Interactions in the chat panel with a custom agent selected |
| `chat_panel_unknown_mode` | Interactions where the mode is unknown |

---

## Lines of Code (LoC) Fields

| Field | Description | Scope |
|-------|------------|-------|
| `loc_suggested_to_add_sum` | Lines Copilot suggested to add | Completions, inline chat, chat panel — **excludes** agent edits |
| `loc_suggested_to_delete_sum` | Lines Copilot suggested to delete | Future support planned |
| `loc_added_sum` | Lines actually added to the editor | Accepted completions + applied code blocks + agent/edit mode |
| `loc_deleted_sum` | Lines deleted from the editor | Currently from agent edits only |

### How Agent Mode Affects LoC

| Behavior | LoC Field |
|----------|----------|
| Agent code suggestions visible in chat panel | `loc_suggested_to_add_sum` (under `chat_panel_agent_mode`) |
| Agent edits directly in files | `loc_added_sum` and `loc_deleted_sum` (under `agent_edit` feature) |
| Multi-file operations | Each file edit contributes to totals |

---

## Dimensional Breakdown Fields

| Field | Description |
|-------|------------|
| `totals_by_ide` | Metrics broken down by IDE used |
| `totals_by_feature` | Metrics by Copilot feature (inline chat, chat panel, code_completion, agent_edit) |
| `totals_by_language_feature` | Combined language × feature breakdown |
| `totals_by_model_feature` | Model-specific breakdowns for chat activity (not completions) |
| `totals_by_language_model` | Language × model breakdown |
| `totals_by_cli` | CLI-specific metrics (independent of IDE, see CLI metrics skill) |

## CCR Aggregated User Counts (Apr 22 2026)

Enterprise and organization-level reports now include aggregated active/passive Copilot code review user counts:

| Field | Type | Description |
|-------|------|-------------|
| `daily_active_copilot_code_review_users` | integer | Active CCR users on that day |
| `daily_passive_copilot_code_review_users` | integer | Passive CCR users on that day |
| `weekly_active_copilot_code_review_users` | integer | Active CCR users in trailing 7-day window |
| `weekly_passive_copilot_code_review_users` | integer | Passive CCR users in trailing 7-day window |
| `monthly_active_copilot_code_review_users` | integer | Active CCR users in trailing 28-day window |
| `monthly_passive_copilot_code_review_users` | integer | Passive CCR users in trailing 28-day window |

Active = user intentionally requested/applied a CCR review. Passive = auto-triggered by repo policy with no user interaction. Active always trumps passive.

> When **auto model selection** is enabled, activity is attributed to the **actual model used**
> rather than appearing as "Auto".

---

## User Activity Flags

| Field | Type | Description |
|-------|------|------------|
| `used_agent` | boolean | Whether the user used IDE agent mode that day |
| `used_chat` | boolean | Whether the user used IDE chat that day |
| `used_cli` | boolean | Whether the user used Copilot CLI that day |
| `used_copilot_coding_agent` | boolean | Whether the user used Copilot cloud agent (coding agent) that day. **Deprecated Aug 1 2026** — use `used_copilot_cloud_agent` instead |
| `used_copilot_cloud_agent` | boolean | Whether the user had Copilot cloud agent activity during the reporting period (Apr 23 2026). Mirrors `used_copilot_coding_agent` under the updated branding. Both fields coexist until Aug 1 2026 deprecation |
| `used_copilot_code_review_active` | boolean | User intentionally engaged with Copilot code review (assigned reviewer, re-requested, applied suggestion) |
| `used_copilot_code_review_passive` | boolean | Copilot code review auto-ran on user's PR via repo policy but user did not interact |

---

## Version Tracking Fields

| Field | Description |
|-------|------------|
| `last_known_ide_version` | Most recent IDE version detected for the user |
| `last_known_plugin_version` | Most recent Copilot Chat extension version detected |

These help monitor LoC telemetry coverage — users on old versions won't contribute LoC data.

---

## Copilot Cloud Agent Active User Counts (Apr 2026)

Enterprise and organization scope. Available in 1-day and 28-day reports.

| Field | Description |
|-------|------------|
| `daily_active_copilot_cloud_agent_users` | Unique users who used Copilot cloud agent on that day |
| `weekly_active_copilot_cloud_agent_users` | Unique users who used Copilot cloud agent in the trailing 7-day window |
| `monthly_active_copilot_cloud_agent_users` | Unique users who used Copilot cloud agent in the trailing 28-day window |

These fields are nullable — they return a count (including zero) when data is available, or `null` when no cloud agent data exists.

> **Note**: GitHub renamed "Copilot coding agent" to "Copilot cloud agent" in April 2026.
> Existing `used_copilot_coding_agent` fields will be updated in coming weeks.

---

## Report Metadata Fields

| Field | Description |
|-------|------------|
| `report_start_day` / `report_end_day` | Start and end dates for 28-day reporting period |
| `day` | Calendar day this record represents (for 1-day reports) |
| `enterprise_id` | Unique ID of the enterprise |
| `organization_id` | Unique ID of the organization (API only) |
| `user_id` / `user_login` | Unique identifier and GitHub username (user-level reports only) |

---

## Pull Request Lifecycle Fields (API Only)

Enterprise and organization scope. Daily counts.

| Field | Description |
|-------|------------|
| `pull_requests.total_created` | PRs created on this day (one-time event per PR) |
| `pull_requests.total_reviewed` | PRs reviewed on this day (same PR can be counted on multiple days) |
| `pull_requests.total_merged` | PRs merged on this day (one-time event per PR) |
| `pull_requests.median_minutes_to_merge` | Median time from creation to merge for PRs merged this day |
| `pull_requests.total_suggestions` | Total review suggestions generated (all authors) |
| `pull_requests.total_applied_suggestions` | Total review suggestions applied (all authors) |
| `pull_requests.total_created_by_copilot` | PRs created by Copilot |
| `pull_requests.total_reviewed_by_copilot` | PRs reviewed by Copilot |
| `pull_requests.total_merged_created_by_copilot` | PRs created by Copilot that were merged |
| `pull_requests.median_minutes_to_merge_copilot_authored` | Median merge time for Copilot-authored PRs |
| `pull_requests.total_copilot_suggestions` | Review suggestions generated by Copilot |
| `pull_requests.total_copilot_applied_suggestions` | Copilot review suggestions that were applied |
| `pull_requests.total_merged_reviewed_by_copilot` | PRs that were both merged and reviewed by Copilot code review (Apr 2026) |
| `pull_requests.median_minutes_to_merge_copilot_reviewed` | Median time to merge for PRs reviewed by Copilot code review (Apr 2026) |

### PR Metric Notes
- **Enterprise** reports deduplicate users across organizations
- **Organization** reports do NOT deduplicate
- PR data comes from **repository activity** — may appear even without IDE usage
- If a repo/org is transferred, events may be attributed to different entities depending on timing

---

## Feature Buckets (in `totals_by_feature` / `totals_by_language_feature`)

| Feature Bucket | What It Captures |
|---------------|-----------------|
| `code_completion` | Inline ghost text suggestions |
| `chat_panel_ask_mode` | Chat panel in ask mode |
| `chat_panel_edit_mode` | Chat panel in edit mode |
| `chat_panel_agent_mode` | Chat panel in agent mode |
| `chat_panel_custom_mode` | Chat panel with custom agent |
| `chat_panel_unknown_mode` | Chat panel mode unknown |
| `chat_inline` | Inline chat (Cmd+I / Ctrl+I) |
| `agent_edit` | Agent and edit mode file changes |
| `copilot_cli` | CLI activity (Apr 2026 — CLI now included in top-level totals and feature breakdowns) |

---

## Example: Complete User-Level Record

```json
{
  "day": "2025-12-01",
  "user_id": 12345,
  "user_login": "developer1",
  "user_initiated_interaction_count": 42,
  "code_generation_activity_count": 38,
  "code_acceptance_activity_count": 25,
  "loc_suggested_to_add_sum": 350,
  "loc_added_sum": 280,
  "loc_deleted_sum": 45,
  "used_agent": true,
  "used_chat": true,
  "used_cli": false,
  "used_copilot_coding_agent": false,
  "used_copilot_code_review_active": true,
  "used_copilot_code_review_passive": false,
  "last_known_ide_version": "1.104.2",
  "last_known_plugin_version": "0.31.0",
  "chat_panel_agent_mode": 8,
  "chat_panel_ask_mode": 20,
  "chat_panel_edit_mode": 10,
  "chat_panel_custom_mode": 4,
  "totals_by_ide": [...],
  "totals_by_feature": [...],
  "totals_by_language_feature": [...],
  "totals_by_model_feature": [...]
}
```
