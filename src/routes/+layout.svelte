<script lang="ts">
  import { resolve } from "$app/paths";
  import "../styles/global.css";

  let { children } = $props();
  const year = new Date().getFullYear();
  const home = resolve("/");
</script>

<svelte:head>
  <title>Casey Chen</title>
  <meta name="description" content="Casey Chen — personal website, projects, and contact." />
</svelte:head>

<header class="container nav">
  <a class="brand" href={home}>Casey Chen</a>
  <nav>
    <a href="{home}#about">About</a>
    <a href="{home}#experience">Experience</a>
    <a href="{home}#projects">Projects</a>
    <a href="{home}#contact">Contact</a>
  </nav>
</header>
<main class="container">
  {@render children()}
</main>
<footer class="container footer">
  <p>© {year} Casey Chen</p>
</footer>
