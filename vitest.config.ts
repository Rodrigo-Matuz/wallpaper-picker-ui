import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [sveltekit()],
	resolve: { conditions: ["browser"] },
	test: {
		environment: "jsdom",
		globals: true,
		include: ["src/**/*.component.test.ts"],
		setupFiles: ["./src/test/setup.ts"],
		// Svelte's mode-watcher/runed and svelte-sonner/lucide dependency trees
		// install DOM/module globals that can cross-contaminate files under
		// parallel scheduling. Forked workers isolate the process boundary, but
		// Vitest can still reuse a worker for multiple files; serial file
		// execution keeps the component suite deterministic.
		pool: "forks",
		fileParallelism: false,
	},
});
