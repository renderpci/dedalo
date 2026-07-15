import { defineConfig } from 'vite';

// The site is served from a path under the public web root (e.g. /<slug>/), not the
// domain root, so assets must be referenced relatively. `base: './'` makes the build
// portable across the preprod path, the prod path and any custom domain without a rebuild.
export default defineConfig({
  base: './',
  build: {
    // The platform serves this directory; keep it as the manifest's `output` (dist).
    outDir: 'dist',
    emptyOutDir: true,
  },
});
