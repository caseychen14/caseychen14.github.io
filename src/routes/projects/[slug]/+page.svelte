<script lang="ts">
  import { resolve } from "$app/paths";
  import { staticUrl } from "#lib/content.ts";

  let { data } = $props();
  const { title, kind, venue, date, authors, summary, pdf, thumbnail, links } = $derived(
    data.project.data,
  );
  const Content = $derived(data.project.Content);
  const pdfUrl = $derived(pdf ? staticUrl(pdf) : undefined);
  const meta = $derived(
    [authors.join(", "), venue, date.getFullYear()].filter(Boolean).join(" · "),
  );
</script>

<svelte:head>
  <title>{title} · Casey Chen</title>
  <meta name="description" content={summary} />
</svelte:head>

<p><a href="{resolve('/')}#projects">← All projects</a></p>
<section class="hero">
  <span class="badge">{kind}</span>
  <h1>{title}</h1>
  <p class="meta">{meta}</p>
</section>

{#if kind === "poster" && thumbnail}
  <img class="poster" src={staticUrl(thumbnail)} alt={title} />
{/if}

<section>
  <Content />
</section>

{#if pdfUrl || links.length > 0}
  <ul class="links">
    {#if pdfUrl}<li><a href={pdfUrl} rel="external">Download PDF</a></li>{/if}
    {#each links as link (link.url)}
      <li><a href={link.url} rel="external">{link.label}</a></li>
    {/each}
  </ul>
{/if}

{#if pdfUrl}
  <object class="pdf" data={pdfUrl} type="application/pdf" aria-label={title}>
    <p>
      Your browser can't display the PDF here. <a href={pdfUrl} rel="external">Open it instead.</a>
    </p>
  </object>
{/if}
