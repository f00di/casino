import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS === 'true' && repositoryName !== undefined ? `/${repositoryName}/` : '/');

export default defineConfig({
  plugins: [react()],
  base,
  server: { port: 5173 },
  build: { sourcemap: true, target: 'es2022' },
});
