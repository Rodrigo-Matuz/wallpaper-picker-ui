import { describe, expect, it } from "bun:test";
import { parseReleaseNotes, releaseNotesPreview } from "./release-notes";

describe("release notes text grammar", () => {
	it("accepts only headings 1–6 with whitespace and closed bold tokens", () => {
		expect(
			parseReleaseNotes("## Heading **bold**\r\n####### literal\n#no heading\n**unclosed"),
		).toEqual([
			{
				tag: "h2",
				content: [
					{ kind: "text", text: "Heading " },
					{ kind: "strong", text: "bold" },
				],
			},
			{ tag: "p", content: [{ kind: "text", text: "####### literal" }] },
			{ tag: "p", content: [{ kind: "text", text: "#no heading" }] },
			{ tag: "p", content: [{ kind: "text", text: "**unclosed" }] },
		]);
	});
	it("keeps empty, whitespace-only and malformed headings literal", () => {
		for (const line of [
			"#",
			"# ",
			"###### 	\u00a0",
			"####### Heading",
			"# Heading\rinside",
			"# Heading\r\r",
			"# \rHeading",
			"# Heading\u2028",
			"# Heading\u2029",
			"# \u2028Heading",
			"# \u2029Heading",
		]) {
			expect(parseReleaseNotes(line)).toEqual([
				{ tag: "p", content: [{ kind: "text", text: line.replace(/\r$/, "") }] },
			]);
		}
	});
	it("retains valid heading levels and whitespace without trimming content", () => {
		for (const level of [1, 2, 3, 4, 5, 6] as const) {
			for (const space of [
				" ",
				"	",
				"\v",
				"\f",
				"\u00a0",
				"\u1680",
				"\u2003",
				"\u202f",
				"\u205f",
				"\u3000",
				"\ufeff",
			]) {
				expect(parseReleaseNotes(`${"#".repeat(level)}${space}Heading  \r\n`)).toEqual([
					{ tag: `h${level}`, content: [{ kind: "text", text: "Heading  " }] },
				]);
			}
		}
	});
	it("parses adversarial whitespace headings linearly in a deadline-bounded worker", () => {
		// A regressed regex cannot freeze the shared test runner or its module state.
		const worker = Bun.spawnSync(
			[
				process.execPath,
				"--no-install",
				"--no-env-file",
				"--eval",
				`
				import { parseReleaseNotes } from ${JSON.stringify(new URL("./release-notes.ts", import.meta.url).href)};
				const samples = [];
				outer: for (const size of [20_000, 40_000, 80_000, 320_000]) {
					for (const ending of ["\\u2028\\u2028", "\\u2029\\u2029", "\\r\\r"]) {
						const body = "#" + " ".repeat(size) + ending;
						const start = performance.now();
						const blocks = parseReleaseNotes(body);
						const elapsedMs = performance.now() - start;
						const literal = blocks.length === 1 && blocks[0].tag === "p" &&
							blocks[0].content.length === 1 && blocks[0].content[0].kind === "text" &&
							blocks[0].content[0].text === body.replace(/\\r$/, "");
						samples.push({ size, ending, elapsedMs, literal });
						if (!literal || elapsedMs > 250) break outer;
					}
				}
				console.log(JSON.stringify(samples));
				process.exit(samples.length === 12 && samples.every(s => s.literal && s.elapsedMs <= 250) ? 0 : 1);
				`,
			],
			{ cwd: process.cwd(), timeout: 5000 },
		);
		const output = new TextDecoder().decode(worker.stdout);
		expect(worker.exitCode, output || new TextDecoder().decode(worker.stderr)).toBe(0);
		const samples = JSON.parse(output) as {
			size: number;
			ending: string;
			elapsedMs: number;
			literal: boolean;
		}[];
		expect(samples).toHaveLength(12);
		for (const sample of samples) {
			expect(sample.literal).toBe(true);
			expect(sample.elapsedMs).toBeLessThanOrEqual(250);
		}
	}, 8000);
	it("retains HTML, links, images and unsupported Markdown as text", () => {
		const text =
			"<script>evil()</script> [bad](javascript:evil()) ![pixel](https://evil.invalid) `code` - item";
		expect(parseReleaseNotes(text)).toEqual([{ tag: "p", content: [{ kind: "text", text }] }]);
	});
	it("bounds structural nodes for giant multiline input without dropping its tail", () => {
		const body = `${"line\n".repeat(20_000)}TAIL`;
		const blocks = parseReleaseNotes(body);
		expect(blocks).toHaveLength(1001);
		expect(blocks.at(-1)?.content).toEqual([{ kind: "text", text: body.slice(5000) }]);
	});
	it("shares the structural budget across many bold-heavy lines", () => {
		const body = `${`${"**b** ".repeat(600)}\n`.repeat(20)}TAIL`;
		const blocks = parseReleaseNotes(body);
		expect(
			blocks.reduce((count, block) => count + block.content.length, 0),
		).toBeLessThanOrEqual(2002);
		expect(blocks.at(-1)?.content.at(-1)?.text.endsWith("TAIL")).toBe(true);
	});
	it("bounds inline nodes and retains oversized delimiter tails literally", () => {
		const body = `${"**bold** ".repeat(20_000)}TAIL`;
		const blocks = parseReleaseNotes(body);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].content.length).toBeLessThanOrEqual(1002);
		expect(blocks[0].content.at(-1)?.text).toContain("**bold**");
		expect(blocks[0].content.at(-1)?.text.endsWith("TAIL")).toBe(true);
	});
	it.each([
		"",
		"Short",
		"x".repeat(360),
		"1\n2\n3\n4\n5",
	])("does not truncate short notes (%s)", (body) => {
		expect(releaseNotesPreview(body)).toBe(body);
	});
	it("limits the preview to five logical lines or 360 characters", () => {
		expect(releaseNotesPreview("1\n2\n3\n4\n5\nTAIL")).toBe("1\n2\n3\n4\n5");
		expect(releaseNotesPreview("x".repeat(10_000))).toHaveLength(360);
		expect(releaseNotesPreview(`${"x".repeat(300)} ${"y".repeat(100)}`)).toBe("x".repeat(300));
	});
	it("does not cut a surrogate pair or create a bold tail during preview", () => {
		const preview = releaseNotesPreview(`${"x".repeat(359)}😀TAIL`);
		expect(preview).toBe("x".repeat(359));
		const prefix = releaseNotesPreview(`**${"x".repeat(400)}**`);
		expect(parseReleaseNotes(prefix)[0].content).toEqual([{ kind: "text", text: prefix }]);
	});
});
