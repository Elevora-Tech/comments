import { defineConfig } from "tsup";

const shared = {
  format: ["esm"] as const,
  dts: true,
  minify: true,
  target: "es2020" as const,
  platform: "browser" as const,
  external: ["react", "react-dom"],
  // Bundle runtime deps so dist stays a self-contained drop-in (browser <script
  // type=module> and CDN usage can't resolve bare specifiers like @medv/finder).
  noExternal: ["@medv/finder"],
};

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/index.ts" },
    clean: true,
  },
  {
    ...shared,
    entry: { react: "src/react.tsx" },
    clean: false,
    // Guarantee the RSC client boundary marker survives bundling/minification.
    banner: { js: '"use client";' },
  },
]);
