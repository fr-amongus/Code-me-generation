---
name: Gemini chat output handling
description: Chat generation embeds a large HTML document inside a structured response and must tolerate model format drift.
---

The chat generator requests JSON but must also recover a complete HTML document from a raw HTML response or a response wrapped in Markdown; otherwise valid model output can surface as a misleading 502.

**Why:** Models can ignore response formatting instructions, especially when the project is empty or the generated document is large.

**How to apply:** Keep structured output enabled, validate that a complete `</html>` exists, and provide a useful 502 only when neither JSON nor recoverable HTML is present.