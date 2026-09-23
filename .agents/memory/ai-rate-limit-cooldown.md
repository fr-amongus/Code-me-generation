---
name: AI rate-limit cooldown
description: Shared UI and API behavior for provider throttling across generation and project-edit actions.
---

When an AI provider returns a quota, rate-limit, or temporary-unavailable response, the API should expose a bounded `Retry-After` delay and the frontend should use one shared countdown to disable all AI-triggering actions.

**Why:** Groq TPM limits and Gemini request quotas can fail in sequence, so retrying the same repair or generation button immediately creates more failed requests and makes the user think the app is stuck.

**How to apply:** Treat 429 and temporary 503 provider responses as retryable cooldowns, preserve local/non-AI tools where possible, show the remaining seconds beside the disabled action, and re-enable automatically when the countdown ends.