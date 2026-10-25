---
name: Code Me secrets and paused conversations
description: Product privacy and interaction rules for per-project secrets and AI questions.
---

Project secret values stay encrypted on the server, are masked by default, and are revealed only after an explicit user action. Keep the master encryption key stable unless a safe re-encryption/rotation path exists. Secret values must never enter AI prompts or replies, project memory, chat transcripts, generated HTML, or browser JavaScript. The current app produces browser-only HTML and cannot safely use server secrets at runtime.

Pending questions and proposals belong to the project's single conversation. They pause further AI work until the user answers or cancels, and choice questions must also allow a free-text clarification.

**Why:** The user requested private, project-scoped secrets and a single project conversation that waits for user input before continuing.

**How to apply:** Preserve these constraints in AI prompts, API routes, storage, and UI changes. If a generated app needs a secret at runtime, add a secure server-side integration rather than exposing the value to the browser.
