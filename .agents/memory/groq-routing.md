---
name: Groq routing
description: The app routes lightweight changes and diagnostics to separate Groq secrets with Gemini fallback.
---

Groq model access and quotas can vary by key. Keep a short ordered model fallback and keep Groq token budgets below the organization TPM limit; route large HTML contexts or attachment-heavy requests to Gemini.

**Why:** A configured Groq key rejected an older model ID and rejected a 16k-token request under an 8k TPM limit, while smaller requests succeeded.

**How to apply:** Preserve the provider split: Gemini for creation/large changes, Groq 1 for ordinary edits, Groq 2 for errors/security, with deterministic local security checks and Gemini fallback.