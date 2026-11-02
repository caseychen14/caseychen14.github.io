# ADR 0003: Dirt & Glow design system

- **Status:** Accepted.
- **Context:** The site needed a visual identity joining systems thinking with embodied, being-in-the-world presence, while staying simple and readable. Explored on a design canvas before porting.
- **Options:** A light editorial theme (sage on paper) · a dark theme with one accent · a dark theme with two text "voices" bound to meaning.
- **Choice:** Dark sage ground with two voices. _Dirt_ (sandy earth, heavy Red Hat Display with a static grit filter, Inter body) carries what is said. _Glow_ (lamplight labels, sky-blue links and nodes, a slow light sweep) carries structure and action. The home hero forms out of per-letter dust clumps on a canvas. Square corners, no light mode.
- **Consequence:** Fonts load from Google Fonts. The canvas hero costs a few seconds of animation once per visit, then it stops drawing. Readers who prefer reduced motion get the settled words and no sweeps. Adding a light mode later would mean redefining the tokens in `global.css`.
