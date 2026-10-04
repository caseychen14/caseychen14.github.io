# caseychen — personal website

A minimal, professional personal site. Plain HTML + CSS, deployed with GitHub Pages.

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Edit

- `index.html` — all content. Replace every `[bracketed placeholder]`.
- `assets/styles.css` — theme colors live in `:root` at the top.
- `assets/resume.pdf` — add your résumé here (linked from the hero).

## Deploy

1. Push to `main`.
2. In GitHub: **Settings → Pages → Source: GitHub Actions** (one-time).
3. The site publishes at `https://caseychen14.github.io/caseychen/`.

To serve at the root `https://caseychen14.github.io/`, rename the repo to `caseychen14.github.io`.

## Glossary

- **GitHub Pages** — GitHub's free static-site hosting.
- **Workflow** — a GitHub Actions file (`.github/workflows/pages.yml`) that deploys on every push to `main`.
- **`.nojekyll`** — tells Pages to serve files as-is, skipping Jekyll processing.
- **ADR** — Architecture Decision Record; see `docs/adr/`.
