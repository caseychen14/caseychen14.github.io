import { getProjects } from "#lib/content.ts";

export function load() {
  return {
    projects: getProjects()
      .slice(0, 3)
      .map(({ id, data }) => ({ id, data })),
  };
}
