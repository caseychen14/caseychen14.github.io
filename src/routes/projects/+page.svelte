<script lang="ts">
  import ProjectCard from "#lib/ProjectCard.svelte";

  let { data } = $props();
</script>

<svelte:head><title>Projects · Casey Chen</title></svelte:head>

<header class="page-head">
  <p class="label g2">Work</p>
  <h1 class="dirt">Papers, posters &amp; projects</h1>
</header>

{#if data.projects.length > 0}
  <div class="rows section">
    {#each data.projects as project (project.id)}
      <ProjectCard id={project.id} data={project.data} />
    {/each}
  </div>
{:else}
  <p class="muted empty">Coming soon.</p>
{/if}
