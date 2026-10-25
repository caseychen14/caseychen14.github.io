<script lang="ts">
  import ProjectCard from "#lib/ProjectCard.svelte";

  let { data } = $props();
</script>

<svelte:head><title>Projects · Casey Chen</title></svelte:head>

<section>
  <h2>Papers, Posters & Projects</h2>
  {#if data.projects.length > 0}
    <div class="grid">
      {#each data.projects as project (project.id)}
        <ProjectCard id={project.id} data={project.data} />
      {/each}
    </div>
  {:else}
    <p>Coming soon.</p>
  {/if}
</section>
