# caseychen — personal website

Personal site with a showcase of papers, posters, and projects. Built with
[SvelteKit](https://svelte.dev/docs/kit) (Svelte 5, on Vite) + strict TypeScript, prerendered
to static HTML and deployed to GitHub Pages.

## Run locally

```sh
npm install
npm run dev        # http://localhost:5173/
```

Before pushing, run the same checks CI runs:

```sh
npm run lint && npm run format:check && npm run check && npm test && npm run build
```

## Edit

- `src/routes/+page.svelte` — homepage sections (About, Experience, Contact).
- `src/routes/+layout.svelte` — shared head, nav, and footer.
- `src/routes/projects/[slug]/+page.svelte` — the per-project page.
- `src/lib/content.ts` — loads and validates project Markdown.
- `src/styles/global.css` — theme colors live in `:root` at the top.

## Add a paper, poster, or project

1. Put the PDF in `static/papers/` (e.g. `static/papers/my-paper.pdf`).
2. Optionally put a thumbnail image in `static/images/` (create it if needed; posters show it full-width).
3. Create `src/content/projects/<slug>.md`. The slug becomes the URL `/projects/<slug>/`.

```md
---
title: My Paper Title
kind: paper # paper | poster | project
date: 2026-05-01
venue: NeurIPS Workshop # optional
authors: [Casey Chen, Co Author]
summary: One sentence shown on the card.
pdf: papers/my-paper.pdf # optional, relative to static/
thumbnail: images/my-paper.png # optional, relative to static/
links: # optional
  - { label: Code, url: https://github.com/caseychen14/repo }
featured: false # featured items sort first
---

Abstract goes here (Markdown).
```

If the frontmatter doesn't match the schema in `src/lib/content.ts`, the build fails and names the bad
field. `npm test` fails if a referenced PDF or image is missing from `static/`.

## Deploy

Push to `main`. `.github/workflows/pages.yml` builds `build/` and publishes it to
`https://caseychen14.github.io/`. (One-time: **Settings → Pages → Source: GitHub Actions**.)
`.github/workflows/ci.yml` runs every check on every push and PR.

## Glossary

- **SvelteKit** — the framework: file-based routing (`src/routes/`), data loading, and prerendering.
- **Svelte 5 / runes** — the component language; `$props()`, `$derived()` declare inputs and computed values.
- **Vite** — the dev server and bundler under SvelteKit; config (including SvelteKit's) lives in `vite.config.ts`.
- **Prerender** — rendering every page to static HTML at build time (`prerender = true` in `+layout.ts`).
- **adapter-static** — writes the prerendered site to `build/` for static hosting.
- **mdsvex** — compiles Markdown files into Svelte components; frontmatter is exported as `metadata`.
- **Frontmatter** — the `---` YAML block at the top of a Markdown file.
- **Zod schema** — validates each project's frontmatter at build time.
- **`#lib`** — import alias for `src/lib/` (a Node subpath import declared in `package.json`).
- **Base path** — the URL prefix the site is served under; empty here because a user page
  (`<username>.github.io`) serves from the root. Links still go through `resolve()`/`asset()`.
- **`rel="external"`** — tells SvelteKit's router to do a normal page load (PDFs, other sites).
- **`.nojekyll`** — tells Pages to serve files as-is, skipping Jekyll processing.
- **ADR** — Architecture Decision Record; see `docs/adr/`.
