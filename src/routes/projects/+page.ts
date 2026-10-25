import { getProjects } from "#lib/content.ts";

export function load() {
  return { projects: getProjects().map(({ id, data }) => ({ id, data })) };
}
