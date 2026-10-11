/// <reference types="vitest/config" />
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { mdsvex } from "mdsvex";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter(),
      extensions: [".svelte", ".md"],
      preprocess: [mdsvex({ extensions: [".md"] })],
      // Project page: served at https://caseychen14.github.io/caseychen/.
      // Set base to "" if the repo is renamed to caseychen14.github.io.
      paths: { base: "/caseychen" },
    }),
  ],
  test: { include: ["src/**/*.test.ts"] },
});
