import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base must match the GitHub Pages repo path
export default defineConfig({
  base: '/restaurant-kayan/',
  plugins: [svelte()],
});
