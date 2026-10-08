import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import type { ProcessIdentity } from "./assertions";
import { Cdp } from "./cdp";
import * as driver from "./run";
import { run } from "./run";

test("diagnostic mode accepts only literal 1, 0 or absence before native actions", () => {
	expect(typeof driver.resolveNativeMode).toBe("function");
	expect(driver.resolveNativeMode(undefined)).toBe("acceptance");
	expect(driver.resolveNativeMode("0")).toBe("acceptance");
	expect(driver.resolveNativeMode("1")).toBe("diagnostic-only");
	for (const value of ["", "true", "false", "01", " 1", "1 ", "2"])
		expect(() => driver.resolveNativeMode(value)).toThrow(
			"WALLPAPER_PICKER_NATIVE_DIAGNOSTIC_ONLY",
		);
});

for (const mode of ["diagnostic-only", "acceptance"] as const) {
	test(`read-only support gate ${mode} cannot proceed to updater operations when skipped`, async () => {
		expect(typeof driver.readSupportGate).toBe("function");
		const support = {
			mode: "manual-only",
			platform: "windows",
			architecture: "x86_64",
			installer: "msi",
			target: null,
			reason: "native-validation-pending",
		};
		const expressions: string[] = [];
		let observed: unknown;
		let updaterCalls = 0;
		const boundary = driver
			.readSupportGate({
				mode,
				kind: "msi",
				client: {
					evaluate: async <T>(expression: string): Promise<T> => {
						expressions.push(expression);
						return support as T;
					},
				},
				onSupport: (value: unknown) => {
					observed = value;
				},
			})
			.then(() => {
				updaterCalls++;
			});
		if (mode === "diagnostic-only")
			await expect(boundary).rejects.toThrow("acceptance skipped");
		else await boundary;
		expect(observed).toEqual(support);
		expect(expressions).toEqual(["window.__TAURI_INTERNALS__.invoke('get_update_support')"]);
		expect(updaterCalls).toBe(mode === "diagnostic-only" ? 0 : 1);
	});
}

for (const value of ["true", "", " 1"]) {
	test(`invalid mode ${JSON.stringify(value)} is rejected without manifest/native work`, async () => {
		const env = {
			GITHUB_ACTIONS: "true",
			RUNNER_ENVIRONMENT: "github-hosted",
			RUNNER_OS: "Windows",
			WALLPAPER_PICKER_NATIVE_ACCEPTANCE: "1",
			WALLPAPER_PICKER_NATIVE_DIAGNOSTIC_ONLY: value,
		};
		const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
		try {
			Object.assign(process.env, env);
			const report = await run([
				"--case",
				"msi",
				"--manifest",
				"C:/never-read/manifest.json",
			]);
			expect(report.errors[0]).toContain("WALLPAPER_PICKER_NATIVE_DIAGNOSTIC_ONLY");
			expect(report.status).toBe("failed");
			expect(report.acceptancePassed).toBe(false);
			expect(report.updaterInvocations).toEqual({
				check: 0,
				download: 0,
				install: 0,
				relaunch: 0,
			});
			expect(report.steps).toEqual([]);
			expect(report.evidence).toEqual({});
		} finally {
			for (const [key, prior] of Object.entries(previous)) {
				if (prior === undefined) delete process.env[key];
				else process.env[key] = prior;
			}
		}
	});
}

test("driver gates read-only diagnostics before any updater/path IPC and reports honest acceptance", async () => {
	const source = await readFile(new URL("./run.ts", import.meta.url), "utf8");
	const start = source.indexOf("export async function run(");
	const body = source.slice(start);
	expect(body.indexOf("report.mode = resolveNativeMode(")).toBeLessThan(
		body.indexOf("const flags ="),
	);
	expect(body.indexOf("await readSupportGate({")).toBeGreaterThan(
		body.indexOf('step("connect packaged main webview"'),
	);
	expect(body.indexOf("await readSupportGate({")).toBeLessThan(
		body.indexOf("const nativeDirs ="),
	);
	expect(body).toContain('report.acceptancePassed = report.mode === "acceptance"');
	expect(source).toContain('report.status === "passed" && report.acceptancePassed');
});

test("read-only support failures remain failures and become bounded attachment evidence", async () => {
	const diagnostics = new driver.AttachmentDiagnostics();
	const support = {
		mode: "manual-only",
		platform: "windows",
		architecture: "x86_64",
		installer: "msi",
		target: null,
		reason: "native-validation-pending",
	};
	await expect(
		driver.readSupportGate({
			mode: "diagnostic-only",
			kind: "msi",
			diagnostics,
			client: { evaluate: async <T>(): Promise<T> => support as T },
			onSupport: () => {},
		}),
	).rejects.toBeInstanceOf(driver.DiagnosticOnlyComplete);
	await expect(
		driver.readSupportGate({
			mode: "diagnostic-only",
			kind: "msi",
			diagnostics,
			client: {
				evaluate: async (): Promise<never> => {
					throw new Error("Webview exception: secret IPC detail");
				},
			},
			onSupport: () => {},
		}),
	).rejects.toThrow("secret IPC detail");
	expect(diagnostics.snapshot().support?.first.outcome).toBe("passed");
	expect(diagnostics.snapshot().support?.latest.errorKind).toBe("webview-exception");
	expect(diagnostics.snapshot().support?.count).toBe(2);
	expect(JSON.stringify(diagnostics.snapshot())).not.toContain("secret");
});

test("requested diagnostic reports stay diagnostic-only even when the host guard refuses", async () => {
	const keys = ["GITHUB_ACTIONS", "WALLPAPER_PICKER_NATIVE_DIAGNOSTIC_ONLY"] as const;
	const previous = keys.map((key) => process.env[key]);
	try {
		delete process.env.GITHUB_ACTIONS;
		process.env.WALLPAPER_PICKER_NATIVE_DIAGNOSTIC_ONLY = "1";
		const report = await run([]);
		expect(report.mode).toBe("diagnostic-only");
		expect(report.acceptancePassed).toBe(false);
		expect(report.status).toBe("failed");
		expect(report.errors[0]).toMatch(/Native acceptance/);
		expect(report.updaterInvocations).toEqual({
			check: 0,
			download: 0,
			install: 0,
			relaunch: 0,
		});
	} finally {
		for (const [index, key] of keys.entries()) {
			if (previous[index] === undefined) delete process.env[key];
			else process.env[key] = previous[index];
		}
	}
});

const processIdentity: ProcessIdentity = {
	pid: 42,
	path: "C:\\owned\\wallpaper-picker-ui.exe",
	startedUtc: "2026-10-08T12:00:00.000Z",
	peVersion: "3.6.0",
	sha256: "old",
};

function cleanupFixture() {
	let time = 0;
	const events: string[] = [];
	const snapshots = [[processIdentity], []];
	const listeners = [false, true];
	return {
		events,
		snapshots,
		listeners,
		options: {
			paths: [processIdentity.path],
			fixtures: ["owned-data"],
			ports: [9222],
			notBeforeUtc: processIdentity.startedUtc,
			timeout: 30,
			now: () => time,
			pause: async () => {
				time += 10;
			},
			stop: async () => {
				events.push("stop");
				return { stopped: [processIdentity] };
			},
			processes: async () => {
				events.push("readback");
				return snapshots.shift() ?? [];
			},
			listenerClosed: async () => {
				events.push("listener");
				return listeners.shift() ?? true;
			},
			remove: async (path: string) => {
				events.push(`remove:${path}`);
			},
		},
	};
}

test("cleanup waits for process identity readback and debug listener closure before fixture removal", async () => {
	expect(typeof driver.cleanupOwned).toBe("function");
	const fixture = cleanupFixture();
	const result = await driver.cleanupOwned(fixture.options);
	expect(fixture.events).toEqual([
		"stop",
		"readback",
		"readback",
		"listener",
		"readback",
		"listener",
		"remove:owned-data",
	]);
	expect(result.processes).toEqual([]);
	expect(result.closedPorts).toEqual([9222]);
});

test("native termination uses a revalidated process object and bounded exit verification", async () => {
	const source = await readFile(new URL("./native.ps1", import.meta.url), "utf8");
	const stop = source.slice(source.indexOf("\t'stop' {"));
	expect(stop).toContain("Get-Process -Id $process.pid");
	expect(stop).toContain("$handleStart = $handle.StartTime");
	expect(stop).toContain("$handleStartedUtc = $handleStart.ToUniversalTime()");
	expect(stop).toContain("$capturedStart = [DateTime]::Parse($process.startedUtc)");
	expect(stop).toContain("$capturedStartedUtc = $capturedStart.ToUniversalTime()");
	expect(stop).toContain(
		"$handleStartedUtc -ne $capturedStartedUtc -or $handlePath -ine $process.path",
	);
	expect(stop).toContain("@($p.paths) -icontains $process.path");
	expect(stop).toContain(
		"[DateTime]::Parse($process.startedUtc) -ge [DateTime]::Parse($p.notBeforeUtc)",
	);
	expect(stop).toContain("$handle.MainModule.FileName");
	expect(stop).toContain("Stop-Process -InputObject $handle -Force");
	expect(stop).toContain("$handle.WaitForExit(10000)");
	expect(stop).toContain("$stopped += $process");
	expect(stop).not.toContain("Stop-Process -Id");
});

test("driver cleanup delegates fixture removal to verified closure gate", async () => {
	const source = await readFile(new URL("./run.ts", import.meta.url), "utf8");
	const cleanup = source.slice(source.indexOf("for (const client of clients) client.close();"));
	expect(cleanup).toContain("await cleanupOwned({");
	expect(cleanup).toContain("ports: debugPorts");
	expect(cleanup).not.toContain("for (const dir of ownedFixtures)");
});

for (const scenario of [
	"live",
	"reused-pid",
	"listener",
	"stop-error",
	"readback-error",
] as const) {
	test(`cleanup retains fixtures on ${scenario}`, async () => {
		const fixture = cleanupFixture();
		const options = fixture.options;
		if (scenario === "live" || scenario === "reused-pid")
			options.processes = async () => [
				{
					...processIdentity,
					startedUtc:
						scenario === "live"
							? processIdentity.startedUtc
							: "2026-10-08T12:01:00.000Z",
				},
			];
		if (scenario === "listener") options.listenerClosed = async () => false;
		if (scenario === "stop-error")
			options.stop = async () => {
				throw new Error("stop denied");
			};
		if (scenario === "readback-error")
			options.processes = async () => {
				throw new Error("readback denied");
			};
		await expect(driver.cleanupOwned(options)).rejects.toThrow();
		expect(fixture.events.some((event) => event.startsWith("remove:"))).toBe(false);
	});
}

test("native install response closure continues only after independent exit and native candidate relaunch", async () => {
	expect(typeof driver.observeInstallHandoff).toBe("function");
	class Socket extends EventTarget {
		readyState: number = WebSocket.OPEN;
		sends = 0;
		send() {
			this.sends++;
			queueMicrotask(() => {
				this.readyState = WebSocket.CLOSED;
				this.dispatchEvent(new Event("close"));
			});
		}
		close() {
			this.dispatchEvent(new Event("close"));
		}
	}
	const socket = new Socket();
	const client = new Cdp(socket as unknown as WebSocket);
	const post = {
		...processIdentity,
		pid: 43,
		startedUtc: "2026-10-08T12:02:00.000Z",
		peVersion: "3.6.1",
		sha256: "new",
	};
	const snapshots = [[processIdentity], [], [], [post]];
	let time = 0;
	try {
		const result = await driver.observeInstallHandoff({
			client,
			expression: "native install invocation",
			pre: processIdentity,
			requestedUtc: "2026-10-08T12:01:00.000Z",
			processes: async () => snapshots.shift() ?? [post],
			now: () => time,
			pause: async () => {
				time += 10;
			},
			exitTimeout: 30,
			relaunchTimeout: 30,
		});
		expect(result.post).toEqual(post);
		expect(result.transportClosed).toBe(true);
		expect(socket.sends).toBe(1);
		expect(snapshots).toEqual([]);
	} finally {
		client.close();
	}
});

function handoffFixture() {
	let time = 0;
	const post = {
		...processIdentity,
		pid: 43,
		startedUtc: "2026-10-08T12:02:00.000Z",
		peVersion: "3.6.1",
		sha256: "new",
	};
	const closure = new Error("owned closure");
	let reads = 0;
	return {
		post,
		closure,
		options: {
			client: {
				closedRemotely: false,
				evaluate: async <T>(): Promise<T> => {
					throw closure;
				},
				ownsClosure: (error: unknown) => error === closure,
			},
			expression: "install",
			pre: processIdentity,
			requestedUtc: "2026-10-08T12:01:00.000Z",
			processes: async (): Promise<ProcessIdentity[]> => (++reads === 1 ? [] : [post]),
			now: () => time,
			pause: async () => {
				time += 10;
			},
			exitTimeout: 30,
			relaunchTimeout: 30,
		},
	};
}

for (const invalid of ["same-hash", "old-start", "same-identity"] as const) {
	test(`handoff requires independently new candidate identity: ${invalid}`, async () => {
		const fixture = handoffFixture();
		if (invalid === "same-hash") fixture.post.sha256 = processIdentity.sha256;
		if (invalid === "old-start") fixture.post.startedUtc = "2026-10-08T12:00:30.000Z";
		if (invalid === "same-identity") {
			fixture.post.pid = processIdentity.pid;
			fixture.post.startedUtc = processIdentity.startedUtc;
		}
		await expect(driver.observeInstallHandoff(fixture.options)).rejects.toThrow(
			"updated auto-relaunch",
		);
	});
}

test("remote closure after install acknowledgement does not make the state read falsely fail", async () => {
	class Socket extends EventTarget {
		readyState: number = WebSocket.OPEN;
		sends = 0;
		send(raw: string) {
			this.sends++;
			const request = JSON.parse(raw);
			queueMicrotask(() => {
				this.dispatchEvent(
					new MessageEvent("message", {
						data: JSON.stringify({
							id: request.id,
							result: { result: { value: { requested: true } } },
						}),
					}),
				);
				this.readyState = WebSocket.CLOSED;
				this.dispatchEvent(new Event("close"));
			});
		}
		close() {
			this.dispatchEvent(new Event("close"));
		}
	}
	const fixture = handoffFixture();
	const snapshots = [[processIdentity], [], [fixture.post]];
	fixture.options.processes = async () => snapshots.shift() ?? [fixture.post];
	const socket = new Socket();
	const client = new Cdp(socket as unknown as WebSocket);
	try {
		const result = await driver.observeInstallHandoff({ ...fixture.options, client });
		expect(result.transportClosed).toBe(true);
		expect(result.post).toEqual(fixture.post);
		expect(socket.sends).toBe(1);
	} finally {
		client.close();
	}
});

for (const closureDuringState of [false, true]) {
	test(`handoff observes process evidence with ${closureDuringState ? "state-read closure" : "normal CDP acknowledgement"}`, async () => {
		class Socket extends EventTarget {
			readyState: number = WebSocket.OPEN;
			sends = 0;
			send(raw: string) {
				const request = JSON.parse(raw);
				this.sends++;
				queueMicrotask(() => {
					if (closureDuringState && this.sends === 2) {
						this.readyState = WebSocket.CLOSED;
						this.dispatchEvent(new Event("close"));
					} else
						this.dispatchEvent(
							new MessageEvent("message", {
								data: JSON.stringify({
									id: request.id,
									result: { result: { value: { requested: true } } },
								}),
							}),
						);
				});
			}
			close() {
				this.dispatchEvent(new Event("close"));
			}
		}
		const fixture = handoffFixture();
		const snapshots = [[processIdentity], [], [fixture.post]];
		fixture.options.processes = async () => snapshots.shift() ?? [fixture.post];
		const socket = new Socket();
		const client = new Cdp(socket as unknown as WebSocket);
		try {
			const result = await driver.observeInstallHandoff({ ...fixture.options, client });
			expect(result.post).toEqual(fixture.post);
			expect(result.transportClosed).toBe(closureDuringState);
			expect(socket.sends).toBe(2);
		} finally {
			client.close();
		}
	});
}

for (const missing of [
	"old-still-live",
	"no-relaunch",
	"wrong-path",
	"old-version",
	"duplicate",
] as const) {
	test(`owned CDP closure is not handoff evidence alone: ${missing}`, async () => {
		const fixture = handoffFixture();
		if (missing === "old-still-live") fixture.options.processes = async () => [processIdentity];
		if (missing === "no-relaunch") fixture.options.processes = async () => [];
		if (missing === "wrong-path") fixture.post.path = "C:\\unowned\\wallpaper-picker-ui.exe";
		if (missing === "old-version") fixture.post.peVersion = "3.6.0";
		if (missing === "duplicate") {
			let reads = 0;
			fixture.options.processes = async () =>
				++reads === 1 ? [] : [fixture.post, fixture.post];
		}
		await expect(driver.observeInstallHandoff(fixture.options)).rejects.toThrow();
	});
}

for (const phase of ["invocation", "state-read"] as const) {
	test(`handoff propagates arbitrary CDP errors at ${phase}`, async () => {
		const fixture = handoffFixture();
		const error = new Error("CDP connection closed"); // Same text is not ownership.
		let evaluations = 0;
		fixture.options.client.evaluate = async <T>(): Promise<T> => {
			if (phase === "invocation" || ++evaluations > 1) throw error;
			return { requested: true } as T;
		};
		let reads = 0;
		fixture.options.processes = async () => {
			reads++;
			return [processIdentity];
		};
		await expect(driver.observeInstallHandoff(fixture.options)).rejects.toBe(error);
		expect(reads).toBe(phase === "invocation" ? 0 : 1);
	});
}

test("handoff reports native install rejection instead of relying on subsequent process exit", async () => {
	const fixture = handoffFixture();
	fixture.options.client.evaluate = async <T>(): Promise<T> =>
		({ installError: "installer denied" }) as T;
	fixture.options.processes = async () => [processIdentity];
	await expect(driver.observeInstallHandoff(fixture.options)).rejects.toThrow(
		"Native install rejected: installer denied",
	);
});

test("driver native handoff uses independent observer instead of requiring CDP reply success", async () => {
	const source = await readFile(new URL("./run.ts", import.meta.url), "utf8");
	const branch = source.slice(
		source.indexOf("const requestedUtc = iso();"),
		source.indexOf("report.evidence.postProcess = post;"),
	);
	expect(branch).toContain("observeInstallHandoff({");
	expect(branch).not.toContain("() =>\n\t\t\t\tclient.evaluate(installExpression");
});

test("coexistence validates and exclusively claims secondary root before artifact/native use", async () => {
	// Source-wiring contract only; the filesystem behavior is exercised in ownership.test.ts.
	const source = (await readFile(new URL("./run.ts", import.meta.url), "utf8")).replace(
		/\s+/g,
		"",
	);
	const start = source.indexOf('if(report.case==="coexistence")');
	const branch = source.slice(start, source.indexOf("constclean=", start));
	const check = branch.indexOf("awaitverifyCaseRoot(process.env.RUNNER_TEMP,secondary.caseRoot)");
	const claim = branch.indexOf('writeFile(join(secondary.caseRoot,"windows-driver-owner.json")');
	const use = branch.indexOf("awaitverifyArtifact(secondary,secondary.baseline)");
	expect(check).toBeGreaterThan(-1);
	expect(claim).toBeGreaterThan(check);
	expect(use).toBeGreaterThan(claim);
	expect(branch).toContain('flag:"wx"');
});

test("driver fails before manifest reads or native operations for every missing host approval", async () => {
	const approved = {
		GITHUB_ACTIONS: "true",
		RUNNER_ENVIRONMENT: "github-hosted",
		RUNNER_OS: "Windows",
		WALLPAPER_PICKER_NATIVE_ACCEPTANCE: "1",
	};
	const previous = { ...process.env };
	try {
		for (const key of Object.keys(approved)) {
			Object.assign(process.env, approved);
			delete process.env[key];
			const result = await run([
				"--case",
				"msi",
				"--manifest",
				"C:/nonexistent-never-read/manifest.json",
			]);
			expect(result.status).toBe("failed");
			expect(result.steps).toHaveLength(0);
			expect(result.evidence).toEqual({});
			expect(result.errors[0]).toMatch(/Native acceptance/);
		}
	} finally {
		for (const key of Object.keys(approved)) {
			if (previous[key] === undefined) delete process.env[key];
			else process.env[key] = previous[key];
		}
	}
});
