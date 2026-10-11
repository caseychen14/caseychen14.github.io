import { describe, expect, it } from "vitest";
import { byKind, sortProjects, type ProjectLike } from "./projects";

const p = (
  id: string,
  date: string,
  kind: ProjectLike["data"]["kind"] = "paper",
  featured = false,
): ProjectLike => ({ id, data: { date: new Date(date), kind, featured } });

describe("sortProjects", () => {
  it("puts featured projects first", () => {
    const out = sortProjects([p("a", "2026-01-01"), p("b", "2024-01-01", "paper", true)]);
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("orders ties newest first", () => {
    const out = sortProjects([p("old", "2024-05-01"), p("new", "2026-05-01")]);
    expect(out.map((x) => x.id)).toEqual(["new", "old"]);
  });

  it("does not mutate its input", () => {
    const input = [p("old", "2024-05-01"), p("new", "2026-05-01")];
    sortProjects(input);
    expect(input.map((x) => x.id)).toEqual(["old", "new"]);
  });

  it("returns [] for no projects", () => {
    expect(sortProjects([])).toEqual([]);
  });
});

describe("byKind", () => {
  it("returns only projects of that kind", () => {
    const out = byKind([p("a", "2026-01-01", "poster"), p("b", "2026-01-01")], "poster");
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });
});
