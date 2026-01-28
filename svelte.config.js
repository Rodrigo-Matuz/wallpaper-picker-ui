import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			fallback: "index.html",
		}),
		alias: {
			$components: "src/lib/components",
			$api: "src/lib/api",
			$lang: "src/lib/lang",
			$utils: "src/lib/utils",
			$config: "src/lib/config",
			$types: "src/types",
		},
	},
};

export default config;
