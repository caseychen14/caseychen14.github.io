import { asset } from "$app/paths";
import type { AssetPath } from "$app/types";
import type { Component } from "svelte";
import { z } from "zod";
import { PROJECT_KINDS, sortProjects } from "./projects";

const projectSchema = z.object({
  title: z.string(),
  kind: z.enum(PROJECT_KINDS),
  date: z.coerce.date(),
  venue: z.string().optional(),
  authors: z.array(z.string()).default([]),
  summary: z.string(),
  // Paths relative to static/, e.g. "papers/my-paper.pdf".
  pdf: z.string().optional(),
  thumbnail: z.string().optional(),
  links: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
  featured: z.boolean().default(false),
});

export type ProjectData = z.infer<typeof projectSchema>;
export interface Project {
  id: string;
  data: ProjectData;
  Content: Component;
}

const modules = import.meta.glob<{ metadata: unknown; default: Component }>(
  "/src/content/projects/*.md",
  { eager: true },
);

// Parsed once at build time; a bad frontmatter field fails the build and names the file.
const projects: Project[] = sortProjects(
  Object.entries(modules).map(([path, mod]) => {
    const id = path.split("/").pop()!.replace(/\.md$/, "");
    const parsed = projectSchema.safeParse(mod.metadata);
    if (!parsed.success) {
      throw new Error(`Invalid frontmatter in ${path}:\n${z.prettifyError(parsed.error)}`);
    }
    return { id, data: parsed.data, Content: mod.default };
  }),
);

export function getProjects(): Project[] {
  return projects;
}

export function getProject(id: string): Project | undefined {
  return projects.find((p) => p.id === id);
}

/**
 * URL for a file in static/ named in frontmatter. `asset()` only types files known at
 * compile time, so this casts; content.test.ts checks every referenced file exists.
 */
export function staticUrl(file: string): string {
  return asset(file as AssetPath);
}
