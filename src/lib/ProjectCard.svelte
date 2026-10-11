<script lang="ts">
  import { resolve } from "$app/paths";
  import { staticUrl, type ProjectData } from "#lib/content.ts";

  let { id, data }: { id: string; data: ProjectData } = $props();
  const meta = $derived([data.venue, data.date.getFullYear()].filter(Boolean).join(" · "));
</script>

<article class="card">
  {#if data.thumbnail}
    <img class="thumb" src={staticUrl(data.thumbnail)} alt="" loading="lazy" />
  {/if}
  <span class="badge">{data.kind}</span>
  <h3><a href={resolve("/projects/[slug]", { slug: id })}>{data.title}</a></h3>
  <p class="meta">{meta}</p>
  <p>{data.summary}</p>
</article>
