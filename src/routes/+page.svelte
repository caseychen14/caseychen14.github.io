<script lang="ts">
  import { resolve } from "$app/paths";
  import DustText from "#lib/DustText.svelte";
  import ProjectCard from "#lib/ProjectCard.svelte";

  let { data } = $props();
</script>

<section class="hero">
  <DustText lines={["Systems", "thinking"]} />
  <p class="lead">Working on agentic architectures for institutional usage.</p>
  <div class="actions">
    <a class="button" href={resolve("/projects")}>See projects</a>
    <a class="link g3" href={resolve("/contact")}>Get in touch →</a>
  </div>
</section>

{#if data.projects.length > 0}
  <section class="section">
    <div class="section-head">
      <h2 class="label g2">Selected work</h2>
      <a class="link g3" href={resolve("/projects")}>All projects →</a>
    </div>
    <div class="rows">
      {#each data.projects as project (project.id)}
        <ProjectCard id={project.id} data={project.data} />
      {/each}
    </div>
  </section>
{/if}
