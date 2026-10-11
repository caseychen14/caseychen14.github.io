import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getProjects } from "./content";

describe("project content", () => {
  const projects = getProjects();

  it("loads at least one project with a valid schema", () => {
    expect(projects.length).toBeGreaterThan(0);
  });

  it.each(projects.map((p) => [p.id, p] as const))(
    "%s references only files that exist in static/",
    (_id, p) => {
      for (const file of [p.data.pdf, p.data.thumbnail].filter(Boolean)) {
        expect(existsSync(`static/${file}`), `static/${file}`).toBe(true);
      }
    },
  );
});
