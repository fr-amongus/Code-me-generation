---
name: Browser library loading
description: Dependency handling for generated single-file HTML applications and their isolated preview.
---

Generated projects are single-file browser documents, so browser libraries must be loaded with ordered CDN script tags rather than npm imports. The server normalizes new outputs and the preview repairs known missing dependencies for existing projects.

**Why:** An isolated iframe cannot run a project-local package installation, and an omitted CDN script causes runtime errors such as `THREE is not defined`.

**How to apply:** Keep the known browser-dependency registry synchronized between API normalization and preview fallback; insert core libraries before plugins and before inline application scripts.