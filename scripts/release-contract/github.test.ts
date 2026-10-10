import { expect, test } from "bun:test";
import { createGitHubReader } from "./github";

test("preserves a UTF-8 BOM as sidecar text rather than silently normalizing signature bytes", async () => {
	const bytes = new TextEncoder().encode("\uFEFFsynthetic-signature");
	const read = createGitHubReader(async () => new Response(bytes), { GITHUB_TOKEN: "synthetic" });
	expect(await read("/repos/Owner/repo/releases/assets/1", 100, true)).toBe(
		"\uFEFFsynthetic-signature",
	);
});

test("refuses dot-segment API paths before sending authentication", async () => {
	let calls = 0;
	const read = createGitHubReader(
		async () => {
			calls++;
			return new Response("x");
		},
		{ GITHUB_TOKEN: "synthetic" },
	);
	await expect(read("/repos/Owner/../releases", 100)).rejects.toThrow("read request");
	expect(calls).toBe(0);
});

test("rejects external paths and invalid byte bounds before networking", async () => {
	for (const [path, limit] of [
		["https://example.com", 100],
		["/repos/Owner/repo/../secrets", 100],
		["/repos/Owner/repo/releases", 0],
		["/repos/Owner/repo/releases", 2_000_000],
	] as const) {
		let calls = 0;
		const read = createGitHubReader(
			async () => {
				calls++;
				return new Response("x");
			},
			{ GITHUB_TOKEN: "synthetic" },
		);
		await expect(read(path, limit)).rejects.toThrow("read request");
		expect(calls).toBe(0);
	}
});

test("caps actual streamed bytes even without content-length", async () => {
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode("12345"));
			controller.enqueue(new TextEncoder().encode("67890"));
			controller.close();
		},
	});
	const read = createGitHubReader(async () => new Response(stream), {
		GITHUB_TOKEN: "synthetic",
	});
	await expect(read("/repos/Owner/repo/releases/assets/1", 6, true)).rejects.toThrow(
		"byte bound",
	);
});

test("fails closed on non-success GitHub responses", async () => {
	for (const status of [401, 403, 404, 429, 500, 307]) {
		const read = createGitHubReader(
			async () => new Response("untrusted server body", { status }),
			{ GITHUB_TOKEN: "synthetic" },
		);
		await expect(read("/repos/Owner/repo/releases", 100)).rejects.toThrow("HTTP");
	}
});

test("rejects non-HTTPS, untrusted or non-asset redirects without following them", async () => {
	for (const location of [
		"http://release-assets.githubusercontent.com/x",
		"https://example.com/x",
		"https://release-assets.githubusercontent.com:444/x",
		"https://user@release-assets.githubusercontent.com/x",
	]) {
		let calls = 0;
		const read = createGitHubReader(
			async () => {
				calls++;
				return new Response(null, { status: 302, headers: { location } });
			},
			{ GITHUB_TOKEN: "synthetic" },
		);
		await expect(read("/repos/Owner/repo/releases/assets/1", 100, true)).rejects.toThrow(
			"redirect",
		);
		expect(calls).toBe(1);
	}
});

test("requires an environment token before networking", async () => {
	let calls = 0;
	const read = createGitHubReader(async () => {
		calls++;
		return new Response("x");
	}, {});
	await expect(read("/repos/Owner/repo/releases", 100)).rejects.toThrow("GITHUB_TOKEN");
	expect(calls).toBe(0);
});

test("uses GET with an environment token only on the GitHub API, never the asset redirect", async () => {
	const calls: { url: string; init: RequestInit }[] = [];
	const read = createGitHubReader(
		async (url, init) => {
			calls.push({ url, init });
			if (calls.length === 1)
				return new Response(null, {
					status: 302,
					headers: {
						location:
							"https://release-assets.githubusercontent.com/example?synthetic=1",
					},
				});
			return new Response("signature-fixture");
		},
		{ GITHUB_TOKEN: "synthetic-not-a-credential" },
	);
	expect(await read("/repos/Owner/repo/releases/assets/12", 100, true)).toBe("signature-fixture");
	expect(calls).toHaveLength(2);
	expect(calls[0].init.method).toBe("GET");
	expect(calls[0].init.redirect).toBe("manual");
	expect(new Headers(calls[0].init.headers).get("authorization")).toBe(
		"Bearer synthetic-not-a-credential",
	);
	expect(new Headers(calls[1].init.headers).has("authorization")).toBe(false);
	expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
});
