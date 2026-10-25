<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import "../styles/global.css";

  let { children } = $props();
  const year = new Date().getFullYear();
  const home = resolve("/");
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

<header class="container nav">
  <a class="brand" href={home}>Casey Chen</a>
  <nav>
    {#each links as link (link.route)}
      <a
        href={resolve(link.route)}
        aria-current={page.url.pathname.startsWith(resolve(link.route)) ? "page" : undefined}
      >
        {link.label}
      </a>
    {/each}
  </nav>
</header>
<main class="container">
  {@render children()}
</main>
<footer class="container footer">
  <p>© {year} Casey Chen</p>
</footer>
