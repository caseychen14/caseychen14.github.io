<script lang="ts">
  import { resolve } from "$app/paths";
  import type { ProjectData } from "#lib/content.ts";

  // One project as a row: date in glow, title and summary in dirt, kind as a clay chip.
  let { id, data }: { id: string; data: ProjectData } = $props();
  const meta = $derived([data.date.getFullYear(), data.venue].filter(Boolean).join(" · "));
</script>

<article class="row">
  <p class="row-meta label g2">{meta}</p>
  <div class="row-body">
    <h3 class="row-title">
      <a class="tlink" href={resolve("/projects/[slug]", { slug: id })}>
        <span class="dirt">{data.title}</span>
        <span class="arr g3" aria-hidden="true">→</span>
      </a>
    </h3>
    <p class="muted">{data.summary}</p>
  </div>
  <span class="chip">{data.kind}</span>
</article>
