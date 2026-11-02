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

<p class="back"><a class="link g3" href={resolve("/projects")}>← All projects</a></p>
<header class="page-head">
  <h1 class="dirt">{title}</h1>
  <p class="label g2">{meta}</p>
</header>

{#if kind === "poster" && thumbnail}
  <img class="poster" src={staticUrl(thumbnail)} alt={title} />
{/if}

<div class="prose">
  <Content />
</div>

{#if pdfUrl || links.length > 0}
  <ul class="detail-links">
    {#if pdfUrl}<li><a class="link g3" href={pdfUrl} rel="external">Download PDF</a></li>{/if}
    {#each links as link (link.url)}
      <li><a class="link g3" href={link.url} rel="external">{link.label}</a></li>
    {/each}
  </ul>
{/if}

{#if pdfUrl}
  <object class="pdf" data={pdfUrl} type="application/pdf" aria-label={title}>
    <p class="prose">
      Your browser can't display the PDF here. <a href={pdfUrl} rel="external">Open it instead.</a>
    </p>
  </object>
{:else}
  <div class="empty"></div>
{/if}
