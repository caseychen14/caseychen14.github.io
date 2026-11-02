<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import readerUrl from "#lib/assets/reader.png";
  import "../styles/global.css";

  let { children } = $props();
  const year = new Date().getFullYear();
  const home = resolve("/");
  // On the home page the name is the current page, so it lights up like a nav link.
  const isHome = $derived(page.url.pathname === home);
  const links = [
    { route: "/experience" as const, label: "Experience" },
    { route: "/projects" as const, label: "Projects" },
    { route: "/contact" as const, label: "Contact" },
  ];
</script>

<svelte:head>
  <title>Casey Chen</title>
  <meta name="description" content="Casey Chen — personal website, projects, and contact." />
</svelte:head>

<!-- The grit on every dirt heading (.dirt in global.css). -->
<svg width="0" height="0" style="position: absolute" aria-hidden="true">
  <filter id="dust" x="-5%" y="-15%" width="110%" height="130%">
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="4" result="edge" />
    <feDisplacementMap
      in="SourceGraphic"
      in2="edge"
      scale="2"
      xChannelSelector="R"
      yChannelSelector="G"
      result="rough"
    />
    <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="9" result="grit" />
    <feColorMatrix
      in="grit"
      type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.2 1.25"
      result="pits"
    />
    <feComposite in="rough" in2="pits" operator="in" />
  </filter>
</svg>

<header class="container nav">
  <a class={["brand", isHome && "g3"]} href={home} aria-current={isHome ? "page" : undefined}>
    Casey Chen
  </a>
  <nav class="label" style:--reader={`url("${readerUrl}")`}>
    {#each links as link (link.route)}
      {@const current = page.url.pathname.startsWith(resolve(link.route))}
      <a
        href={resolve(link.route)}
        class={current ? "g3" : "g2"}
        aria-current={current ? "page" : undefined}
      >
        {#if current}<span class="reader" aria-hidden="true"></span>{/if}
        {link.label}
      </a>
    {/each}
  </nav>
</header>
<main class="container">
  {@render children()}
</main>
<footer class="container footer">
  <span>© {year} Casey Chen</span>
  <span class="footer-links label">
    <a class="g2" href="mailto:caseychen@stanford.edu">Email</a>
    <a class="g2" href="https://github.com/caseychen14">GitHub</a>
    <a class="g2" href="https://www.linkedin.com/in/casey-chen-2a4a70242">LinkedIn</a>
  </span>
</footer>
