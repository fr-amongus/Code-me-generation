---
name: Gemini model availability
description: Model IDs available to new user-provided Gemini API keys can differ from older examples.
---

The official Gemini SDK can return `404 NOT_FOUND` for older model IDs such as Gemini 1.5 or 2.5 when a newly created user key is restricted to newer models. In this environment, `gemini-3-flash-preview` worked with `generateContent`.

**Why:** The requested historical model names were accepted by the SDK but rejected by the live API, so checking with a real request matters.

**How to apply:** Keep the model ID configurable or easy to update, and treat model-not-found responses separately from quota errors when diagnosing Gemini generation failures.