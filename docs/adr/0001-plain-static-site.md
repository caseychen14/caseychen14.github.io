# ADR 0001: Plain HTML/CSS on GitHub Pages

- **Context:** Need a professional personal site, fast, free hosting, minimal maintenance.
- **Options:** Plain HTML/CSS · Jekyll · Astro/Next.js + TypeScript.
- **Choice:** Plain HTML/CSS deployed by a GitHub Actions Pages workflow.
- **Consequence:** Zero build step and zero dependencies. If content grows (blog, many projects), migrate to Astro.
