import { expect, test } from "bun:test";
import * as driver from "./run";

function attachmentFixture() {
	let time = 0;
	let closed = 0;
	const client = {
		evaluate: async <T>(): Promise<T> => true as T,
		close: () => {
			closed++;
		},
	};
	const diagnostics = new driver.AttachmentDiagnostics(() => time);
	const clients: (typeof client)[] = [];
	const options = {
		diagnostics,
		fetch: async (_url: string, _init: RequestInit) => ({
			ok: true,
			status: 200,
			json: async (): Promise<unknown> => [
				{
					type: "page",
					url: "http://tauri.localhost/",
					webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/owned",
				},
			],
		}),
		connect: async (_url: string) => client,
		now: () => time,
		pause: async () => {
			time += 30000;
		},
	};
	return { options, diagnostics, clients, client, closed: () => closed };
}

for (const stage of ["fetch", "http", "json", "target", "evaluation"] as const) {
	test(`attachment retains ${stage} failure while preserving exact poll timeout`, async () => {
		expect(typeof driver.mainWebview).toBe("function");
		const fixture = attachmentFixture();
		if (stage === "fetch")
			fixture.options.fetch = async () => {
				throw new Error("secret in transport error");
			};
		if (stage === "http")
			fixture.options.fetch = async () => ({
				ok: false,
				status: 503,
				json: async () => {
					throw new Error("must not parse non-OK body");
				},
			});
		if (stage === "json")
			fixture.options.fetch = async () => ({
				ok: true,
				status: 200,
				json: async () => {
					throw new SyntaxError("secret response body");
				},
			});
		if (stage === "target")
			fixture.options.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
		if (stage === "evaluation")
			fixture.client.evaluate = async () => {
				throw new Error("Webview exception: secret native value");
			};
		await expect(driver.mainWebview(9222, fixture.clients, fixture.options)).rejects.toThrow(
			"Timeout: packaged main WebView2 CDP",
		);
		const snapshot = fixture.diagnostics.snapshot();
		expect(snapshot[stage]?.count).toBe(2);
		expect(snapshot[stage]?.first.outcome).toBe("failed");
		expect(snapshot[stage]?.latest.elapsedMs).toBe(30000);
		for (const unavailable of ["listener", "liveness", "browser"] as const)
			expect(snapshot[unavailable]?.first.outcome).toBe("unknown");
		expect(JSON.stringify(snapshot)).not.toContain("secret");
		expect(fixture.clients).toEqual([]);
		expect(fixture.closed()).toBe(stage === "evaluation" ? 2 : 0);
	});
}

test("attachment success retains ordered gates without broadening target selection", async () => {
	expect(typeof driver.mainWebview).toBe("function");
	const fixture = attachmentFixture();
	expect(await driver.mainWebview(9222, fixture.clients, fixture.options)).toBe(fixture.client);
	expect(fixture.clients).toEqual([fixture.client]);
	expect(fixture.closed()).toBe(0);
	const snapshot = fixture.diagnostics.snapshot();
	for (const stage of ["fetch", "http", "json", "target", "websocket", "evaluation"] as const)
		expect(snapshot[stage]?.latest.outcome).toBe("passed");
});

// Characterize the previously proved selectors/catch boundaries through the actual extracted helper.
for (const rejected of ["wrong-type", "wrong-origin", "false-main"] as const) {
	test(`attachment preserves rejection of ${rejected}`, async () => {
		const fixture = attachmentFixture();
		fixture.options.fetch = async () => ({
			ok: true,
			status: 200,
			json: async () => [
				{
					type: rejected === "wrong-type" ? "worker" : "page",
					url:
						rejected === "wrong-origin"
							? "http://tauri.localhost.evil/?secret=value"
							: "https://tauri.localhost/",
					webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/owned",
				},
			],
		});
		if (rejected === "false-main")
			fixture.client.evaluate = async <T>(): Promise<T> => false as T;
		await expect(driver.mainWebview(9222, fixture.clients, fixture.options)).rejects.toThrow(
			"Timeout: packaged main WebView2 CDP",
		);
		expect(fixture.clients).toEqual([]);
		expect(fixture.closed()).toBe(rejected === "false-main" ? 2 : 0);
		expect(JSON.stringify(fixture.diagnostics.snapshot())).not.toContain("secret");
	});
}

for (const immediate of ["connect", "non-loopback", "malformed-list"] as const) {
	test(`attachment preserves immediate ${immediate} failure`, async () => {
		const fixture = attachmentFixture();
		const error = new Error("connection refused");
		if (immediate === "connect")
			fixture.options.connect = async () => {
				throw error;
			};
		if (immediate === "non-loopback")
			fixture.options.fetch = async () => ({
				ok: true,
				status: 200,
				json: async () => [
					{
						type: "page",
						url: "tauri://localhost",
						webSocketDebuggerUrl: "ws://example.com:9222/?secret=value",
					},
				],
			});
		if (immediate === "malformed-list")
			fixture.options.fetch = async () => ({ ok: true, status: 200, json: async () => null });
		const result = driver.mainWebview(9222, fixture.clients, fixture.options);
		if (immediate === "connect") await expect(result).rejects.toBe(error);
		else if (immediate === "non-loopback")
			await expect(result).rejects.toThrow("Non-loopback CDP URL refused");
		else await expect(result).rejects.toBeInstanceOf(TypeError);
		expect(fixture.clients).toEqual([]);
		expect(
			fixture.diagnostics.snapshot()[immediate === "malformed-list" ? "target" : "websocket"]
				?.latest.outcome,
		).toBe("failed");
	});
}

test("target inventory is a bounded predicate sample, not a foreign target dump", async () => {
	const fixture = attachmentFixture();
	fixture.options.fetch = async () => ({
		ok: true,
		status: 200,
		json: async () =>
			Array.from({ length: 64 }, () => ({
				type: "worker",
				url: "https://foreign.invalid/?secret=value",
				webSocketDebuggerUrl: "ws://foreign.invalid:9222",
				title: "SECRET",
				env: "SECRET",
			})),
	});
	await expect(driver.mainWebview(9222, fixture.clients, fixture.options)).rejects.toThrow(
		"Timeout:",
	);
	const snapshot = fixture.diagnostics.snapshot();
	expect(snapshot.target?.latest.targetCount).toBe(64);
	expect(snapshot.target?.latest.targets).toHaveLength(8);
	expect(snapshot.target?.latest.targets?.[0]).toEqual({
		index: 0,
		typeMatches: false,
		originMatches: false,
		socketPresent: true,
	});
	expect(JSON.stringify(snapshot)).not.toContain("foreign");
	expect(JSON.stringify(snapshot)).not.toContain("SECRET");
	for (const stage of ["listener", "liveness", "browser"] as const)
		expect(snapshot[stage]?.latest.outcome).toBe("unknown");
});

test("failure categories never include arbitrary exception text", () => {
	for (const [error, category] of [
		[new DOMException("SECRET", "AbortError"), "request-timeout"],
		[new SyntaxError("SECRET"), "json-syntax"],
		[new Error("Webview exception: SECRET"), "webview-exception"],
		[new Error("CDP timeout: SECRET"), "cdp-timeout"],
		[new Error("CDP: SECRET"), "cdp-protocol"],
		[new Error("CDP connection closed"), "cdp-closed"],
		[new Error("SECRET"), "other-error"],
		["SECRET", "thrown-value"],
	] as const)
		expect(driver.attachmentErrorKind(error)).toBe(category);
});

// The recorder accepts only stage-specific safe summaries, never raw pages/env/IPC payloads.
test("attachment diagnostics retain bounded first/latest samples and saturating counts", () => {
	expect(typeof driver.AttachmentDiagnostics).toBe("function");
	let time = 100;
	const diagnostics = new driver.AttachmentDiagnostics(() => time);
	diagnostics.record("http", { outcome: "failed", reason: "first", httpStatus: 503 });
	for (let i = 0; i < 50; i++) {
		time++;
		diagnostics.record("http", {
			outcome: "passed",
			reason: "x".repeat(2000),
			httpStatus: 200,
		});
	}
	const snapshot = diagnostics.snapshot();
	expect(snapshot.http?.count).toBe(51);
	expect(snapshot.http?.first.reason).toBe("first");
	expect(snapshot.http?.latest.reason?.length).toBeLessThanOrEqual(160);
	expect(snapshot.http?.latest.elapsedMs).toBe(50);
	expect(JSON.stringify(snapshot).length).toBeLessThan(1000);
	if (snapshot.http) snapshot.http.first.reason = "mutated";
	expect(diagnostics.snapshot().http?.first.reason).toBe("first");
	for (let i = 0; i < 1000001; i++) diagnostics.record("http", { outcome: "passed" });
	expect(diagnostics.snapshot().http?.count).toBe(1000000);
	expect(diagnostics.snapshot().http?.first.reason).toBe("first");
});
