import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const gitCommit = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? "local").slice(0, 12);

export default defineConfig({
  plugins: [react()],
  define: {
    __FLIM_GIT_COMMIT__: JSON.stringify(gitCommit),
  },
});
