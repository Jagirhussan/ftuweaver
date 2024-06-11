import { defineConfig, loadEnv } from "vite";
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
export default defineConfig({
  build: {
    assetsInlineLimit: '2048', // 2kb
  },
  plugins: [monacoEditorPlugin()],
});