import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { compile } from "tailwindcss";

const markup = readFileSync(new URL("./display.svelte", import.meta.url), "utf8");
const gridClasses = markup
	.match(/data-wallpaper-grid class="([^"]+)"/)?.[1]
	.split(/\s+/)
	.filter((name) => name.includes("grid-cols-"));

if (!gridClasses?.length) throw new Error("Wallpaper grid classes are missing");

const compiled = await compile(
	`@theme { --breakpoint-sm: 40rem; --breakpoint-md: 48rem; } @tailwind utilities; @source inline("${gridClasses.join(" ")}");`,
);
const css = postcss.parse(compiled.build([]));

function columnCountAt(width: number) {
	let columns = 0;
	css.walkDecls("grid-template-columns", (declaration) => {
		let minimumWidth = 0;
		let parent = declaration.parent;
		while (parent && parent.type !== "root") {
			if (parent.type === "atrule" && parent.name === "media") {
				const breakpoint = parent.params.match(/width\s*>=\s*(\d+)(px|rem)/);
				if (breakpoint) {
					minimumWidth = Number(breakpoint[1]) * (breakpoint[2] === "rem" ? 16 : 1);
				}
			}
			parent = parent.parent;
		}
		if (minimumWidth <= width) {
			columns = Number(declaration.value.match(/repeat\((\d+)/)?.[1] ?? 0);
		}
	});
	return columns;
}

test("the compiled wallpaper grid has four columns at the app's 900px viewport", () => {
	expect(columnCountAt(900)).toBe(4);
	expect(columnCountAt(700)).toBe(3);
});
