import svelte from "rollup-plugin-svelte";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import sveltePreprocess from "svelte-preprocess";
import postcss from "rollup-plugin-postcss";

const production = !process.env.ROLLUP_WATCH;

export default {
  input: "src/webview/Dashboard.svelte",
  output: {
    format: "iife",
    name: "app",
    file: "dist/webview/dashboard-component.js",
    sourcemap: !production,
  },
  plugins: [
    postcss({
      inject: true, // Inject CSS into the bundle
      minimize: production,
    }),
    svelte({
      preprocess: sveltePreprocess(),
      compilerOptions: {
        dev: !production,
      },
      emitCss: false, // Inline CSS for simplicity
    }),
    resolve({
      browser: true,
      dedupe: ["svelte"],
    }),
    commonjs(),
    production && terser(),
  ],
  watch: {
    clearScreen: false,
  },
};
