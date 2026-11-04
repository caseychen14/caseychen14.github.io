export const PROJECT_KINDS = ["paper", "poster", "project"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

/** The minimal shape these helpers need; real collection entries satisfy it. */
export interface ProjectLike {
  id: string;
  data: { date: Date; kind: ProjectKind; featured: boolean };
}

/** Featured first, then newest first. Returns a new array. */
export function sortProjects<T extends ProjectLike>(projects: T[]): T[] {
  return [...projects].sort(
    (a, b) =>
      Number(b.data.featured) - Number(a.data.featured) ||
      b.data.date.getTime() - a.data.date.getTime(),
  );
}

export function byKind<T extends ProjectLike>(projects: T[], kind: ProjectKind): T[] {
  return projects.filter((p) => p.data.kind === kind);
}

/**
 * True for an author string referring to the site's owner, allowing a middle initial and a
 * trailing equal-contribution marker (e.g. "Casey S. Chen *").
 */
export function isSelf(author: string): boolean {
  return /^casey\s+(\w\.\s+)?chen\b/i.test(author.trim());
}
