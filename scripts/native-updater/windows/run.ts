import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { dirname, join, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import {
	assertMetadata,
	assertSupport,
	assertUpgrade,
	type ProcessIdentity,
	type Registration,
} from "./assertions";
import { AttachmentDiagnostics, attachmentErrorKind, mainWebview } from "./attachment";
import { Cdp } from "./cdp";
import { stopWithComparisons } from "./cleanup-diagnostics";
import {
	type Artifact,
	assertHostedWindows,
	type Installer,
	type Manifest,
	ownedPath,
	requireThat,
	validateManifest,
} from "./guards";
import { verifyCaseRoot } from "./ownership";
import { downloadExpression, installExpression, validRid } from "./protocol";

export { AttachmentDiagnostics, attachmentErrorKind, mainWebview } from "./attachment";
export { parseStopComparisons, readStopComparisons } from "./cleanup-diagnostics";
export type NativeMode = "acceptance" | "diagnostic-only";

/** Parse the explicit mode before file/native work; never coerce Boolean-looking strings. */
export function resolveNativeMode(value: string | undefined): NativeMode {
	requireThat(
		value === undefined || value === "0" || value === "1",
		"WALLPAPER_PICKER_NATIVE_DIAGNOSTIC_ONLY must be absent, '0' or '1'",
	);
	return value === "1" ? "diagnostic-only" : "acceptance";
}

interface MsiIdentity {
	ProductCode: string;
	UpgradeCode: string;
	ProductVersion: string;
}
interface Discovery {
	path: string;
	installedMsi?: MsiIdentity;
}
interface DownloadState {
	events: { event: string; data?: { contentLength?: number; chunkLength?: number } }[];
	downloadVerified: boolean;
	bytesRid?: number;
	error?: string;
	installError?: string;
}
interface Report {
	schemaVersion: 1;
	mode: NativeMode;
	acceptancePassed: boolean;
	updaterInvocations: { check: number; download: number; install: number; relaunch: number };
	case: string;
	platform: "windows";
	status: "running" | "passed" | "failed";
	startedUtc: string;
	finishedUtc?: string;
	steps: { name: string; utc: string; status: "passed" | "failed"; detail?: string }[];
	assertions: string[];
	evidence: Record<string, unknown>;
	errors: string[];
}

const script = fileURLToPath(new URL("./native.ps1", import.meta.url));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const iso = () => new Date().toISOString();
const digest = async (file: string) =>
	createHash("sha256")
		.update(await readFile(file))
		.digest("hex");

class Native {
	constructor(readonly root: string) {}
	async call<T>(
		action: string,
		payload: Record<string, unknown> = {},
		consumeOutput?: (stdout: string) => string,
	): Promise<T> {
		assertHostedWindows(process.env, process.platform);
		resolveNativeMode(process.env.WALLPAPER_PICKER_NATIVE_DIAGNOSTIC_ONLY);
		const input = Buffer.from(JSON.stringify({ ...payload, caseRoot: this.root })).toString(
			"base64",
		);
		const child = Bun.spawn(
			[
				"powershell.exe",
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				script,
				"-Action",
				action,
				"-Payload",
				input,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const timer = setTimeout(() => child.kill(), action === "install" ? 200000 : 45000);
		try {
			const [stdout, stderr, code] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);
			const resultText = consumeOutput ? consumeOutput(stdout) : stdout;
			requireThat(code === 0, `Native ${action} failed (${code}): ${stderr.slice(0, 4000)}`);
			return JSON.parse(resultText.trim().replace(/^\uFEFF/, "")) as T;
		} finally {
			clearTimeout(timer);
		}
	}
	async registrations() {
		return (await this.call<{ registrations: Registration[] }>("registrations")).registrations;
	}
	async processes() {
		return (await this.call<{ processes: ProcessIdentity[] }>("processes")).processes;
	}
}

interface PollTiming {
	now?: () => number;
	pause?: () => Promise<void>;
}

/** A diagnostic completes its read-only boundary by refusing the acceptance continuation. */
export class DiagnosticOnlyComplete extends Error {
	constructor() {
		super(
			"Diagnostic-only attachment/read-only IPC complete; packaged updater acceptance skipped",
		);
	}
}

/** Exactly one read-only support IPC; diagnostic completion refuses every acceptance continuation. */
export async function readSupportGate(options: {
	client: Pick<Cdp, "evaluate">;
	kind: Installer;
	mode: NativeMode;
	onSupport: (support: unknown) => void;
	diagnostics?: AttachmentDiagnostics;
}) {
	try {
		const support = await options.client.evaluate(
			"window.__TAURI_INTERNALS__.invoke('get_update_support')",
		);
		options.onSupport(support);
		assertSupport(support, options.kind);
		options.diagnostics?.record("support", {
			outcome: "passed",
			reason: "expected packaged policy; null production target",
		});
	} catch (error) {
		options.diagnostics?.record("support", {
			outcome: "failed",
			errorKind: attachmentErrorKind(error),
		});
		throw error;
	}
	if (options.mode === "diagnostic-only") throw new DiagnosticOnlyComplete();
}

async function poll<T>(
	name: string,
	ms: number,
	probe: () => Promise<T | undefined>,
	timing: PollTiming = {},
): Promise<T> {
	const now = timing.now ?? Date.now;
	const deadline = now() + ms;
	while (now() < deadline) {
		const value = await probe();
		if (value !== undefined) return value;
		await (timing.pause ?? (() => sleep(500)))();
	}
	throw new Error(`Timeout: ${name}`);
}

interface HandoffOptions extends PollTiming {
	client: Pick<Cdp, "evaluate" | "ownsClosure" | "closedRemotely">;
	expression: string;
	pre: ProcessIdentity;
	requestedUtc: string;
	processes: () => Promise<ProcessIdentity[]>;
	exitTimeout?: number;
	relaunchTimeout?: number;
}

export async function observeInstallHandoff(options: HandoffOptions) {
	const { client, pre } = options;
	let transportClosed = false;
	const allowOwnedClosure = (error: unknown) => {
		if (!client.ownsClosure(error)) throw error;
		transportClosed = true;
	};
	try {
		await client.evaluate(options.expression);
	} catch (error) {
		allowOwnedClosure(error);
	}
	await poll(
		"original process exit",
		options.exitTimeout ?? 60000,
		async () => {
			const processes = await options.processes();
			if (!processes.some((p) => p.pid === pre.pid && p.startedUtc === pre.startedUtc))
				return true;
			// An acknowledged install can close the transport between response and state read.
			if (client.closedRemotely) transportClosed = true;
			if (!transportClosed) {
				try {
					const state = await client.evaluate<DownloadState>("window.__nativeAcceptance");
					requireThat(
						!state.installError,
						`Native install rejected: ${state.installError}`,
					);
				} catch (error) {
					allowOwnedClosure(error);
				}
			}
			return undefined;
		},
		options,
	);
	const post = await poll(
		"updated auto-relaunch",
		options.relaunchTimeout ?? 180000,
		async () => {
			const processes = await options.processes();
			requireThat(processes.length <= 1, "Duplicate main processes after native handoff");
			return processes.find(
				(p) =>
					p.path.toLowerCase() === pre.path.toLowerCase() &&
					(p.peVersion === "3.6.1" || p.peVersion === "3.6.1.0") &&
					p.sha256 !== pre.sha256 &&
					(p.pid !== pre.pid || p.startedUtc !== pre.startedUtc) &&
					Date.parse(p.startedUtc) >= Date.parse(options.requestedUtc),
			);
		},
		options,
	);
	return { post, transportClosed };
}

interface CleanupOptions {
	paths: string[];
	fixtures: string[];
	ports: number[];
	notBeforeUtc: string;
	stop: (payload: { paths: string[]; notBeforeUtc: string }) => Promise<unknown>;
	processes: () => Promise<ProcessIdentity[]>;
	listenerClosed: (port: number) => Promise<boolean>;
	remove: (path: string) => Promise<void>;
	timeout?: number;
	now?: () => number;
	pause?: () => Promise<void>;
}

// Removal is gated on independent readback, not the termination command's success.
export async function cleanupOwned(options: CleanupOptions) {
	const termination = await options.stop({
		paths: options.paths,
		notBeforeUtc: options.notBeforeUtc,
	});
	const now = options.now ?? Date.now;
	const deadline = now() + (options.timeout ?? 30000);
	while (now() < deadline) {
		const processes = await options.processes();
		// A replacement/reused PID at an owned path is still live and must retain fixtures.
		const live = processes.filter((process) =>
			options.paths.some((path) => path.toLowerCase() === process.path.toLowerCase()),
		);
		const closedPorts: number[] = [];
		if (live.length === 0) {
			for (const port of options.ports)
				if (await options.listenerClosed(port)) closedPorts.push(port);
			if (closedPorts.length === options.ports.length) {
				for (const fixture of options.fixtures) await options.remove(fixture);
				return { termination, processes, closedPorts };
			}
		}
		await (options.pause ?? (() => sleep(500)))();
	}
	throw new Error("Timeout: owned process/debug listener closure; fixtures retained");
}

async function debugListenerClosed(port: number): Promise<boolean> {
	const socket = createConnection({ host: "127.0.0.1", port });
	return new Promise((resolve, reject) => {
		socket.setTimeout(2000, () => {
			socket.destroy();
			reject(new Error("Debug listener readback timeout"));
		});
		socket.once("connect", () => {
			socket.destroy();
			resolve(false);
		});
		socket.once("error", (error: NodeJS.ErrnoException) => {
			socket.destroy();
			if (error.code === "ECONNREFUSED") resolve(true);
			else reject(error);
		});
	});
}

async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	requireThat(address && typeof address !== "string", "Loopback port unavailable");
	const port = address.port;
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	return port;
}

async function verifyArtifact(m: Manifest, artifact: Artifact) {
	const root = await realpath(m.caseRoot);
	const resolved = await realpath(artifact.artifactPath);
	ownedPath(root, resolved);
	requireThat(!(await lstat(artifact.artifactPath)).isSymbolicLink(), "Symlink artifact refused");
	requireThat(
		(await stat(resolved)).isFile() &&
			(await stat(resolved)).size === artifact.size &&
			(await digest(resolved)) === artifact.sha256,
		"Staged published artifact hash/size mismatch",
	);
}

function msiPair(before: MsiIdentity, after: MsiIdentity) {
	const upgrade = "{83118BD9-967B-5A1F-94BE-E18868474288}";
	requireThat(
		before.UpgradeCode.toUpperCase() === upgrade && after.UpgradeCode.toUpperCase() === upgrade,
		"MSI UpgradeCode changed",
	);
	requireThat(
		before.ProductVersion === "3.6.0" &&
			after.ProductVersion === "3.6.1" &&
			before.ProductCode !== after.ProductCode,
		"MSI major upgrade identity/version mismatch",
	);
}

export async function run(args: string[]): Promise<Report> {
	const report: Report = {
		schemaVersion: 1,
		mode: "acceptance",
		acceptancePassed: false,
		updaterInvocations: { check: 0, download: 0, install: 0, relaunch: 0 },
		case: "unknown",
		platform: "windows",
		status: "running",
		startedUtc: iso(),
		steps: [],
		assertions: [],
		evidence: {},
		errors: [],
	};
	let root: string | undefined;
	let native: Native | undefined;
	const clients: Cdp[] = [];
	const ownedExecutables: string[] = [];
	const ownedFixtures: string[] = [];
	const debugPorts: number[] = [];
	const attachment = new AttachmentDiagnostics();
	let attachmentStarted = false;
	const save = async () => {
		if (attachmentStarted) report.evidence.attachment = attachment.snapshot();
		if (root)
			await writeFile(join(root, "report.json"), `${JSON.stringify(report, null, 4)}\n`);
	};
	const step = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
		try {
			const value = await action();
			report.steps.push({ name, utc: iso(), status: "passed" });
			await save();
			return value;
		} catch (error) {
			report.steps.push({
				name,
				utc: iso(),
				status: "failed",
				detail: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	};
	try {
		// Pure mode validation and host approval precede all file/native/socket/subprocess work.
		report.mode = resolveNativeMode(process.env.WALLPAPER_PICKER_NATIVE_DIAGNOSTIC_ONLY);
		assertHostedWindows(process.env, process.platform);
		const flags = new Map<string, string>();
		requireThat(
			args.length % 2 === 0,
			"Expected --case CASE --manifest PATH [--secondary-manifest PATH]",
		);
		for (let i = 0; i < args.length; i += 2) {
			requireThat(
				["--case", "--manifest", "--secondary-manifest"].includes(args[i]) &&
					!flags.has(args[i]) &&
					args[i + 1],
				"Invalid/duplicate CLI argument",
			);
			flags.set(args[i], args[i + 1]);
		}
		report.case = flags.get("--case") ?? "unknown";
		requireThat(
			flags.get("--manifest") && process.env.RUNNER_TEMP,
			"Manifest and RUNNER_TEMP required",
		);
		const m = validateManifest(
			JSON.parse(await readFile(flags.get("--manifest") as string, "utf8")),
			report.case,
			process.env.RUNNER_TEMP,
		);
		// Refuse a symlinked case root or a reused driver run before any native operation.
		await verifyCaseRoot(process.env.RUNNER_TEMP, m.caseRoot);
		await writeFile(
			join(m.caseRoot, "windows-driver-owner.json"),
			JSON.stringify({ startedUtc: report.startedUtc, runId: process.env.GITHUB_RUN_ID }),
			{ flag: "wx" },
		);
		root = m.caseRoot;
		native = new Native(root);
		const n = native;
		const kind: Installer = m.target.endsWith("-msi") ? "msi" : "nsis";
		report.evidence.target = m.target;
		report.evidence.artifacts = { baseline: m.baseline, candidate: m.candidate };
		await step("verify immutable published artifacts", async () => {
			await verifyArtifact(m, m.baseline);
			await verifyArtifact(m, m.candidate);
		});
		let secondary: Manifest | undefined;
		if (report.case === "coexistence") {
			requireThat(
				flags.get("--secondary-manifest"),
				"Coexistence requires --secondary-manifest",
			);
			secondary = validateManifest(
				JSON.parse(await readFile(flags.get("--secondary-manifest") as string, "utf8")),
				kind === "msi" ? "nsis" : "msi",
				process.env.RUNNER_TEMP,
			);
			requireThat(
				secondary.caseRoot !== root && secondary.target !== m.target,
				"Coexistence requires distinct opposite-installer artifact root",
			);
			await verifyCaseRoot(process.env.RUNNER_TEMP, secondary.caseRoot);
			await writeFile(
				join(secondary.caseRoot, "windows-driver-owner.json"),
				JSON.stringify({ startedUtc: report.startedUtc, runId: process.env.GITHUB_RUN_ID }),
				{ flag: "wx" },
			);
			await verifyArtifact(secondary, secondary.baseline);
			report.evidence.secondaryArtifact = secondary.baseline;
		}
		const clean = await step("clean disposable runner preflight", async () => {
			const registrations = await n.registrations();
			const processes = await n.processes();
			report.evidence.initialRegistrations = registrations;
			report.evidence.initialProcesses = processes;
			requireThat(
				registrations.length === 0 && processes.length === 0,
				"Runner already contains app installation/process; refusing mutation",
			);
			return n.call<{ configBase: string; appData: string; localData: string }>("machine");
		});
		let msiBefore: MsiIdentity | undefined;
		if (kind === "msi") {
			msiBefore = await n.call<MsiIdentity>("msi", { artifactPath: m.baseline.artifactPath });
			const candidate = await n.call<MsiIdentity>("msi", {
				artifactPath: m.candidate.artifactPath,
			});
			msiPair(msiBefore, candidate);
			report.evidence.msiArtifacts = { baseline: msiBefore, candidate };
		}
		await step("install published baseline only", () =>
			n.call("install", { artifactPath: m.baseline.artifactPath, kind }),
		);
		const before = await n.registrations();
		report.evidence.beforeRegistrations = before;
		requireThat(
			before.length === 1 && before[0].kind === kind && before[0].version === "3.6.0",
			"Baseline registration mismatch",
		);
		const discovery = await n.call<Discovery>("discover", {
			kind,
			productCode: msiBefore?.ProductCode,
		});
		report.evidence.baselineExecutable = discovery;
		ownedExecutables.push(discovery.path);
		if (kind === "msi")
			requireThat(
				discovery.installedMsi?.ProductCode === msiBefore?.ProductCode &&
					discovery.installedMsi?.UpgradeCode === msiBefore?.UpgradeCode,
				"Installed MSI identity differs from baseline artifact",
			);
		if (secondary) {
			const otherKind: Installer = kind === "msi" ? "nsis" : "msi";
			const sn = new Native(secondary.caseRoot);
			let otherMsi: MsiIdentity | undefined;
			if (otherKind === "msi")
				otherMsi = await sn.call("msi", { artifactPath: secondary.baseline.artifactPath });
			await step("install opposite baseline for guarded coexistence evidence", () =>
				sn.call("install", {
					artifactPath: secondary?.baseline.artifactPath,
					kind: otherKind,
				}),
			);
			const other = await sn.call<Discovery>("discover", {
				kind: otherKind,
				productCode: otherMsi?.ProductCode,
			});
			ownedExecutables.push(other.path);
			report.evidence.secondaryExecutable = other;
			const registrations = await n.registrations();
			report.evidence.coexistingRegistrations = registrations;
			requireThat(
				registrations.length === 2 &&
					registrations.some((r) => r.kind === "msi") &&
					registrations.some((r) => r.kind === "nsis"),
				"Installer did not retain both registrations; coexistence not established",
			);
		}
		const video = join(root, "fixtures", "preservation.mp4");
		const configDir = join(clean.configBase, "WallpaperPickerUI");
		const cacheDir = join(clean.appData, "thumbnails");
		const fixtureFiles: Record<string, string> = {
			config: join(configDir, "config.json"),
			map: join(cacheDir, "map.json"),
			cache: join(cacheDir, "phase0.png"),
			video,
		};
		await step("seed disposable fixtures before any app launch", async () => {
			// Existing data directories are not driver-owned; never overwrite them, even on a runner.
			for (const dir of [configDir, clean.appData, clean.localData]) {
				try {
					await lstat(dir);
					throw new Error(`Existing app data refused: ${dir}`);
				} catch (error) {
					requireThat(
						(error as NodeJS.ErrnoException).code === "ENOENT",
						`Existing app data refused: ${dir}`,
					);
				}
			}
			await mkdir(configDir);
			ownedFixtures.push(configDir);
			await mkdir(clean.appData);
			ownedFixtures.push(clean.appData);
			await mkdir(cacheDir);
			await mkdir(dirname(video), { recursive: true });
			await writeFile(
				video,
				Buffer.from("000000186674797069736f6d0000020069736f6d69736f32", "hex"),
				{ flag: "wx" },
			);
			// Inert MP4 path-preservation fixture; media decoding/regeneration is not claimed.
			await writeFile(
				fixtureFiles.cache,
				Buffer.from(
					"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVSUAAAAASUVORK5CYII=",
					"base64",
				),
				{ flag: "wx" },
			);
			await writeFile(fixtureFiles.map, JSON.stringify({ "phase0.png": video }, null, 4), {
				flag: "wx",
			});
			await writeFile(
				fixtureFiles.config,
				JSON.stringify(
					{
						command: "",
						wallpapersPath: dirname(video),
						debugMode: false,
						newWallpapers: false,
						darkMode: true,
						language: "eng",
						thumbnailsHashMap: {},
						thumbnailVersion: 1,
					},
					null,
					4,
				),
				{ flag: "wx" },
			);
		});
		const hashes = async () =>
			Object.fromEntries(
				await Promise.all(
					Object.entries(fixtureFiles).map(async ([key, file]) => [
						key,
						await digest(file),
					]),
				),
			);
		const initialHashes = await hashes();
		report.evidence.fixturePaths = fixtureFiles;
		report.evidence.seededHashes = initialHashes;
		report.evidence.videoFixtureScope =
			"inert MP4 path-preservation fixture; not a playback test";
		const port = await freePort();
		debugPorts.push(port);
		const launched = await step("launch observed installed main executable once", () =>
			n.call<{ pid: number; launchUtc: string }>("launch", { exe: discovery.path, port }),
		);
		const pre = await poll("baseline main process", 30000, async () => {
			const processes = await n.processes();
			requireThat(processes.length <= 1, "Duplicate baseline main processes");
			return processes.find(
				(p) =>
					p.pid === launched.pid && p.path.toLowerCase() === discovery.path.toLowerCase(),
			);
		});
		report.evidence.preProcess = pre;
		requireThat(
			pre.peVersion === "3.6.0" || pre.peVersion === "3.6.0.0",
			"Baseline executable PE version mismatch",
		);
		attachmentStarted = true;
		const client = await step("connect packaged main webview", () =>
			mainWebview(port, clients, { diagnostics: attachment, fetch, connect: Cdp.connect }),
		);
		await readSupportGate({
			client,
			kind,
			mode: report.mode,
			diagnostics: attachment,
			onSupport: (support) => {
				report.evidence.preSupport = support;
			},
		});
		const nativeDirs = await client.evaluate<{ config: string; appData: string }>(
			"Promise.all([window.__TAURI_INTERNALS__.invoke('plugin:path|resolve_directory', {directory: 3}), window.__TAURI_INTERNALS__.invoke('plugin:path|resolve_directory', {directory: 14})]).then(([config,appData]) => ({config,appData}))",
		);
		report.evidence.nativeDataDirectories = nativeDirs;
		requireThat(
			win32.normalize(nativeDirs.config).toLowerCase() ===
				win32.normalize(clean.configBase).toLowerCase() &&
				win32.normalize(nativeDirs.appData).toLowerCase() ===
					win32.normalize(clean.appData).toLowerCase(),
			"Seeded paths do not match real packaged path IPC",
		);
		await sleep(3000);
		requireThat(
			JSON.stringify(await hashes()) === JSON.stringify(initialHashes),
			"Baseline startup altered fixtures",
		);
		if (secondary) {
			// Ambiguous runner state: collect policy only. No plugin check, download or install invocation.
			report.evidence.updaterInvocations = { check: 0, download: 0, install: 0 };
			report.evidence.coexistencePolicy =
				"observed embedded installer marker with null production target; driver refuses native updater operations on ambiguous registrations";
			report.assertions.push(
				"both native registrations observed",
				"packaged IPC target remains null",
				"no native updater operation attempted",
			);
		} else {
			report.updaterInvocations.check++;
			const metadata = await step("plugin check with exact installer target", () =>
				client.evaluate<unknown>(
					`window.__TAURI_INTERNALS__.invoke('plugin:updater|check', ${JSON.stringify({ target: m.target, timeout: 30000, allowDowngrades: false })})`,
					45000,
				),
			);
			report.evidence.checkMetadata = metadata;
			assertMetadata(metadata, m.target, m.candidate);
			report.updaterInvocations.download++;
			await step("start split native download", () =>
				client.evaluate(downloadExpression(metadata.rid)),
			);
			const downloaded = await step("await signature-verified native bytes resource", () =>
				poll("native signature-verified download", 660000, async () => {
					const state = await client.evaluate<DownloadState>("window.__nativeAcceptance");
					report.evidence.download = state;
					await save();
					requireThat(!state.error, `Native download rejected: ${state.error}`);
					return state.downloadVerified ? state : undefined;
				}),
			);
			validRid(downloaded.bytesRid);
			requireThat(
				downloaded.events.some((e) => e.event === "Finished"),
				"Native Finished event missing",
			);
			const total = downloaded.events
				.filter((e) => e.event === "Progress")
				.reduce((sum, e) => sum + (e.data?.chunkLength ?? 0), 0);
			requireThat(
				total === m.candidate.size,
				"Native downloaded byte count differs from verified artifact",
			);
			const redetected = await client.evaluate(
				"window.__TAURI_INTERNALS__.invoke('get_update_support')",
			);
			report.evidence.preInstallSupport = redetected;
			assertSupport(redetected, kind);
			requireThat(
				(await n.registrations()).length === 1,
				"Ambiguous registration state before native install",
			);
			const requestedUtc = iso();
			report.evidence.installRequestedUtc = requestedUtc;
			await save();
			report.updaterInvocations.install++;
			const handoff = await step(
				"request native install and independently observe exit/relaunch",
				() =>
					observeInstallHandoff({
						client,
						expression: installExpression(metadata.rid, downloaded.bytesRid as number),
						pre,
						requestedUtc,
						processes: async () => {
							const processes = await n.processes();
							report.evidence.lastObservedProcesses = processes;
							return processes;
						},
					}),
			);
			report.evidence.installTransportClosed = handoff.transportClosed;
			const post = handoff.post;
			report.evidence.postProcess = post;
			client.close();
			const reopened = await step("connect automatically reopened packaged webview", () =>
				mainWebview(port, clients, {
					diagnostics: attachment,
					fetch,
					connect: Cdp.connect,
				}),
			);
			const postSupport = await reopened.evaluate(
				"window.__TAURI_INTERNALS__.invoke('get_update_support')",
			);
			report.evidence.postSupport = postSupport;
			assertSupport(postSupport, kind);
			await sleep(3000);
			const after = await n.registrations();
			const postHashes = await hashes();
			report.evidence.afterRegistrations = after;
			report.evidence.postHashes = postHashes;
			assertUpgrade(pre, post, before, after, initialHashes, postHashes, kind, requestedUtc);
			if (kind === "msi") {
				const candidate = (report.evidence.msiArtifacts as { candidate: MsiIdentity })
					.candidate;
				const installed = await n.call<Discovery>("discover", {
					kind,
					productCode: candidate.ProductCode,
				});
				report.evidence.updatedExecutable = installed;
				requireThat(
					installed.installedMsi && msiBefore,
					"Installed MSI metadata unavailable",
				);
				msiPair(msiBefore, installed.installedMsi);
				requireThat(
					installed.installedMsi.ProductCode === candidate.ProductCode,
					"Installed candidate ProductCode mismatch",
				);
				report.assertions.push(
					"MSI UpgradeCode retained and candidate ProductCode installed",
				);
			}
			report.assertions.push(
				"real packaged provenance and null production target",
				"exact approved 3.6.0 to 3.6.1 signed per-installer plugin check",
				"download resolved after signature verification",
				"native original process exited",
				"installer automatically relaunched new PE executable",
				"no duplicate/cross-installer registration",
				"config/map/cache/video hashes preserved",
			);
			await verifyArtifact(m, m.baseline);
			await verifyArtifact(m, m.candidate);
		}
		report.status = "passed";
		report.acceptancePassed = report.mode === "acceptance";
	} catch (error) {
		report.status = "failed";
		if (error instanceof DiagnosticOnlyComplete) report.evidence.diagnosticCompleted = true;
		report.errors.push(error instanceof Error ? error.message : String(error));
	} finally {
		for (const client of clients) client.close();
		if (native && ownedExecutables.length) {
			const n = native;
			try {
				report.evidence.cleanup = await cleanupOwned({
					paths: ownedExecutables,
					fixtures: ownedFixtures,
					ports: debugPorts,
					notBeforeUtc: report.startedUtc,
					stop: async (payload) => {
						return stopWithComparisons(
							n.root,
							async (stopInvocation, consume) => {
								const result = await n.call(
									"stop",
									{ ...payload, stopInvocation },
									consume,
								);
								report.evidence.cleanupTermination = result;
								return result;
							},
							(evidence) => {
								report.evidence.cleanupComparisons = evidence;
							},
						);
					},
					processes: async () => {
						const processes = await n.processes();
						report.evidence.cleanupLastProcesses = processes;
						return processes;
					},
					listenerClosed: async (port) => {
						const closed = await debugListenerClosed(port);
						report.evidence.cleanupLastListener = { port, closed };
						return closed;
					},
					remove: (dir) => rm(dir, { recursive: true }),
				});
			} catch (error) {
				report.status = "failed";
				report.acceptancePassed = false;
				report.errors.push(
					`Owned cleanup failed (fixtures may be retained): ${String(error)}`,
				);
			}
		}
		report.finishedUtc = iso();
		await save();
	}
	return report;
}

if (import.meta.main) {
	const report = await run(process.argv.slice(2));
	console.log(JSON.stringify(report, null, 4));
	process.exitCode = report.status === "passed" && report.acceptancePassed ? 0 : 1;
}
