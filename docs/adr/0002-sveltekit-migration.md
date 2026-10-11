# ADR 0002: Migrate to SvelteKit

- **Status:** Accepted. Supersedes ADR 0001.
- **Context:** The site needs papers/posters/project pages, and the owner wants Svelte with room to grow into interactive features or a backend.
- **Options:** Astro (content-first, zero JS) · Astro + Svelte islands · SvelteKit.
- **Choice:** SvelteKit 3 + Svelte 5, fully prerendered via adapter-static; projects are Markdown (mdsvex) validated by Zod.
- **Consequence:** Pages ship a small JS runtime for client-side navigation, and content validation is hand-written (`src/lib/content.ts`) rather than built in. In exchange, interactivity and server routes are available when needed.
