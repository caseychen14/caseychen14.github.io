<script lang="ts">
  import ProjectCard from "#lib/ProjectCard.svelte";

  let { data } = $props();
</script>

<section class="hero">
  <h1>Casey Chen</h1>
  <p class="lead">Senior studying Symbolic Systems at Stanford</p>
</section>

<section id="about">
  <h2>About</h2>
  <p>Working on agentic architectures for institutional usage.</p>
</section>

<section id="experience">
  <h2>Experience</h2>
  <ul class="timeline">
    <li>
      <h3>RegLab, Research Fellow</h3>
      <p class="meta">June 2026 – Present</p>
      <p>Working on project to use agentic systems for legislative matching and fiscal auditing</p>
    </li>
    <li>
      <h3>BS Symbolic Systems. MS Computer Science · Stanford University</h3>
      <p class="meta">September 2023 — Present. September 2026 — Present</p>
    </li>
  </ul>
</section>

{#if data.projects.length > 0}
  <section id="projects">
    <h2>Papers, Posters & Projects</h2>
    <div class="grid">
      {#each data.projects as project (project.id)}
        <ProjectCard id={project.id} data={project.data} />
      {/each}
    </div>
  </section>
{/if}

<section id="contact">
  <h2>Contact</h2>
  <ul class="links">
    <li><a href="mailto:caseychen@stanford.edu">Email</a></li>
    <li><a href="https://github.com/caseychen14">GitHub</a></li>
    <li><a href="https://www.linkedin.com/in/casey-chen-2a4a70242">LinkedIn</a></li>
  </ul>
</section>
