import { readonly, writable } from "svelte/store";
import type {
	AvailableUpdate,
	NativeUpdateResource,
	UpdateActionResult,
	UpdateDownloadEvent,
	UpdateFailureCategory,
	UpdateFailurePhase,
	UpdaterDependencies,
	UpdaterSnapshot,
	UpdaterTarget,
	UpdateSupport,
} from "$types/updateTypes";

const modes = ["development", "package-managed", "manual-only", "unknown", "self-managed"];
const installers = ["nsis", "msi", "appimage", "deb", "rpm", "nix"];
const targets = new Map<string, UpdaterTarget>([
	["windows/nsis", "windows-x86_64-nsis"],
	["windows/msi", "windows-x86_64-msi"],
	["linux/appimage", "linux-x86_64-appimage"],
]);

function readSupport(raw: unknown): UpdateSupport {
	const invalid: UpdateSupport = Object.freeze({
		mode: "unknown",
		platform: "unknown",
		architecture: "unknown",
		installer: null,
		target: null,
		reason: "invalid-support",
	});
	if (typeof raw !== "object" || raw === null) return invalid;
	const value = raw as Record<string, unknown>;
	if (
		typeof value.mode !== "string" ||
		!modes.includes(value.mode) ||
		typeof value.platform !== "string" ||
		typeof value.architecture !== "string" ||
		typeof value.reason !== "string" ||
		(value.installer !== null &&
			(typeof value.installer !== "string" || !installers.includes(value.installer))) ||
		(value.target !== null && ![...targets.values()].includes(value.target as UpdaterTarget))
	)
		return invalid;
	return Object.freeze({
		mode: value.mode as UpdateSupport["mode"],
		platform: value.platform,
		architecture: value.architecture,
		installer: value.installer as UpdateSupport["installer"],
		target: value.target as UpdateSupport["target"],
		reason: value.reason,
	});
}

function readMetadata(update: NativeUpdateResource): AvailableUpdate {
	const { currentVersion, version, body: nativeBody, date: nativeDate } = update;
	const body = nativeBody === null ? undefined : nativeBody;
	const date = nativeDate === null ? undefined : nativeDate;
	if (
		typeof currentVersion !== "string" ||
		!currentVersion ||
		typeof version !== "string" ||
		!version ||
		(body !== undefined && typeof body !== "string") ||
		(date !== undefined && typeof date !== "string")
	) {
		throw new Error("Invalid updater manifest metadata");
	}
	return Object.freeze({ currentVersion, version, body, date });
}

function approvedTarget(support: UpdateSupport): UpdaterTarget | null {
	if (
		support.mode !== "self-managed" ||
		support.reason !== "supported" ||
		support.architecture !== "x86_64" ||
		support.target === null ||
		targets.get(`${support.platform}/${support.installer}`) !== support.target
	)
		return null;
	return support.target;
}

function failureCategory(phase: UpdateFailurePhase, message: string): UpdateFailureCategory {
	if (phase === "support") return "support-unavailable";
	if (phase === "cleanup") return "cleanup-failed";
	if (phase === "install") return "install-failed";
	if (phase === "restart") return "restart-failed";
	if (phase === "download" && /signature|public key|key id|prehashed/i.test(message))
		return "invalid-signature";
	if (/timed?\s*out|timeout/i.test(message)) return "timeout";
	if (/(platform|target).*not found|missing target/i.test(message)) return "missing-target";
	if (/404|missing feed|endpoint.*not found/i.test(message)) return "missing-feed";
	if (/json|manifest|deserialize|version.*parse|signature.*decoded/i.test(message))
		return "invalid-manifest";
	if (/network|connect|dns|offline|request|http|tls|certificate/i.test(message)) return "network";
	return "unknown";
}

/** DOCS:
 * Creates an isolated updater controller without performing native work on construction.
 * @param dependencies - Native boundary, clock, and application version for this controller.
 * @returns Read-only reactive state and explicit, policy-gated check/download/install/retry actions.
 */
export function createUpdaterController(dependencies: UpdaterDependencies) {
	const configuredTimeout = dependencies.downloadTimeoutMs;
	const downloadTimeout =
		typeof configuredTimeout === "number" &&
		Number.isSafeInteger(configuredTimeout) &&
		configuredTimeout > 0
			? configuredTimeout
			: 600000;
	let snapshot: UpdaterSnapshot = Object.freeze({
		status: "idle",
		busy: null,
		progress: null,
		currentVersion: dependencies.currentVersion,
		support: null,
		availableUpdate: null,
		failure: null,
		lastCheckedAt: null,
		canCheck: true,
		canRetry: false,
		canDownload: false,
		canInstall: false,
	});
	const store = writable(snapshot);

	function publish(changes: Partial<UpdaterSnapshot>) {
		snapshot = Object.freeze({ ...snapshot, ...changes });
		store.set(snapshot);
	}

	let active: Promise<UpdateActionResult> | null = null;
	let activeKind: UpdaterSnapshot["busy"] = null;
	let pending: NativeUpdateResource | null = null;
	let installed = false;

	function fail(raw: unknown, phase: UpdateFailurePhase) {
		let error: Error;
		try {
			error =
				raw instanceof Error && typeof raw.message === "string"
					? raw
					: new Error(String(raw));
		} catch {
			error = new Error("Unrecognized updater failure");
		}
		const category = failureCategory(phase, error.message);
		publish({
			status: installed ? "restart-required" : "error",
			failure: Object.freeze({ phase, category }),
			availableUpdate: installed ? snapshot.availableUpdate : null,
		});
		try {
			void Promise.resolve(dependencies.reportError?.({ phase, error })).catch(() => {});
		} catch {
			/* Diagnostics must not break the update operation. */
		}
	}

	async function releasePending() {
		if (!pending) return;
		await pending.close();
		pending = null;
	}

	function finishOperation() {
		active = null;
		activeKind = null;
		publish({
			busy: null,
			canCheck: !installed && !["manual-only", "installer-handoff"].includes(snapshot.status),
			canRetry: snapshot.status === "error" || snapshot.status === "restart-required",
			canDownload:
				snapshot.status === "available" &&
				typeof pending?.download === "function" &&
				!!snapshot.support &&
				approvedTarget(snapshot.support) !== null,
			canInstall:
				snapshot.status === "ready-to-install" &&
				typeof pending?.install === "function" &&
				typeof dependencies.prepareInstall === "function" &&
				!!snapshot.support &&
				(snapshot.support.platform === "windows" ||
					typeof dependencies.relaunch === "function") &&
				approvedTarget(snapshot.support) !== null,
		});
	}

	function dismissAvailableUpdate(): Promise<UpdateActionResult> {
		if (active) return activeKind === "dismiss" ? active : Promise.resolve("busy");
		if (!pending || !["available", "ready-to-install"].includes(snapshot.status))
			return Promise.resolve("not-available");
		const operation = Promise.resolve()
			.then(async () => {
				await releasePending();
				publish({ status: "idle", availableUpdate: null, failure: null, progress: null });
				return "completed" as const;
			})
			.catch((error: unknown) => {
				fail(error, "cleanup");
				return "failed" as const;
			})
			.finally(finishOperation);
		active = operation;
		activeKind = "dismiss";
		publish({
			busy: "dismiss",
			canCheck: false,
			canRetry: false,
			canDownload: false,
			canInstall: false,
		});
		return operation;
	}

	/** DOCS: Downloads privately; readiness requires successful native verification, not Finished. */
	function downloadUpdate(): Promise<UpdateActionResult> {
		if (active) return activeKind === "download" ? active : Promise.resolve("busy");
		const update = pending;
		const download = update?.download;
		if (!snapshot.canDownload || !update || typeof download !== "function")
			return Promise.resolve("not-available");
		let phase: UpdateFailurePhase = "support";
		const operation = Promise.resolve()
			.then(async () => {
				const previousTarget = snapshot.support && approvedTarget(snapshot.support);
				const support = readSupport(await dependencies.detectSupport());
				publish({ support });
				if (previousTarget === null || approvedTarget(support) !== previousTarget) {
					phase = "cleanup";
					await releasePending();
					publish({ status: "manual-only", availableUpdate: null, progress: null });
					return "not-available" as const;
				}
				phase = "download";
				await download.call(
					update,
					(event: UpdateDownloadEvent) => {
						if (active !== operation || snapshot.status !== "downloading") return;
						let downloadedBytes = snapshot.progress?.downloadedBytes ?? 0;
						let totalBytes = snapshot.progress?.totalBytes ?? null;
						if (event.event === "Started") {
							downloadedBytes = 0;
							const total = event.data.contentLength;
							totalBytes =
								typeof total === "number" &&
								Number.isSafeInteger(total) &&
								total > 0
									? total
									: null;
						} else if (event.event === "Progress") {
							const chunk = event.data.chunkLength;
							if (!Number.isSafeInteger(chunk) || chunk < 0) return;
							downloadedBytes = Math.min(
								Number.MAX_SAFE_INTEGER,
								downloadedBytes + chunk,
							);
						} else return;
						publish({
							progress: Object.freeze({
								downloadedBytes,
								totalBytes,
								percent:
									totalBytes === null
										? null
										: Math.min(100, (downloadedBytes / totalBytes) * 100),
							}),
						});
					},
					{ timeout: downloadTimeout },
				);
				publish({ status: "ready-to-install" });
				return "completed" as const;
			})
			.catch(async (error: unknown) => {
				fail(error, phase);
				if (phase !== "cleanup" && !installed) {
					try {
						await releasePending();
					} catch (cleanupError) {
						fail(cleanupError, "cleanup");
					}
				}
				return "failed" as const;
			})
			.finally(finishOperation);
		active = operation;
		activeKind = "download";
		publish({
			status: "downloading",
			busy: "download",
			canCheck: false,
			canRetry: false,
			canDownload: false,
			canInstall: false,
			failure: null,
			progress: Object.freeze({ downloadedBytes: 0, totalBytes: null, percent: null }),
		});
		return operation;
	}

	/** DOCS: Requires version-specific consent and the application's pending-work safety gate. */
	function installAndRestart(confirmation?: {
		confirmed: boolean;
		version: string;
	}): Promise<UpdateActionResult> {
		if (active) return activeKind === "install" ? active : Promise.resolve("busy");
		const update = pending;
		const install = update?.install;
		const relaunch = dependencies.relaunch;
		if (
			!snapshot.canInstall ||
			!update ||
			typeof install !== "function" ||
			confirmation?.confirmed !== true ||
			confirmation.version !== snapshot.availableUpdate?.version
		)
			return Promise.resolve("not-available");
		let phase: UpdateFailurePhase = "support";
		const operation = Promise.resolve()
			.then(async () => {
				const target = snapshot.support && approvedTarget(snapshot.support);
				const support = readSupport(await dependencies.detectSupport());
				publish({ support });
				if (target === null || approvedTarget(support) !== target) {
					phase = "cleanup";
					await releasePending();
					publish({ status: "manual-only", availableUpdate: null, progress: null });
					return "not-available" as const;
				}
				phase = "install";
				if ((await dependencies.prepareInstall?.()) !== true) {
					publish({ status: "ready-to-install" });
					return "not-available" as const;
				}
				if (support.platform === "windows") {
					publish({ status: "installer-handoff" });
					await install.call(update);
					// Real Windows install exits. A return is not proof of installation success.
					return "completed" as const;
				}
				await install.call(update);
				installed = true;
				phase = "cleanup";
				await releasePending();
				phase = "restart";
				publish({ status: "restarting" });
				if (!relaunch) throw new Error("Relaunch adapter is unavailable");
				await relaunch();
				return "completed" as const;
			})
			.catch(async (error: unknown) => {
				fail(error, phase);
				if (phase !== "cleanup" && !installed) {
					try {
						await releasePending();
					} catch (cleanupError) {
						fail(cleanupError, "cleanup");
					}
				}
				return "failed" as const;
			})
			.finally(finishOperation);
		active = operation;
		activeKind = "install";
		publish({
			status: "installing",
			busy: "install",
			canCheck: false,
			canDownload: false,
			canInstall: false,
			canRetry: false,
			failure: null,
		});
		return operation;
	}

	function restartOnly(): Promise<UpdateActionResult> {
		const relaunch = dependencies.relaunch;
		if (typeof relaunch !== "function") return Promise.resolve("not-available");
		let phase: UpdateFailurePhase = "cleanup";
		const operation = Promise.resolve()
			.then(async () => {
				await releasePending();
				phase = "restart";
				if ((await dependencies.prepareInstall?.()) !== true) {
					publish({ status: "restart-required" });
					return "not-available" as const;
				}
				await relaunch();
				return "completed" as const;
			})
			.catch((error: unknown) => {
				fail(error, phase);
				return "failed" as const;
			})
			.finally(finishOperation);
		active = operation;
		activeKind = "restart";
		publish({
			status: "restarting",
			busy: "restart",
			failure: null,
			canCheck: false,
			canRetry: false,
			canDownload: false,
			canInstall: false,
		});
		return operation;
	}

	function retry(): Promise<UpdateActionResult> {
		if (active) return activeKind === "restart" ? active : Promise.resolve("busy");
		if (installed && snapshot.status === "restart-required") return restartOnly();
		if (snapshot.status !== "error") return Promise.resolve("not-available");
		return checkForUpdates();
	}

	function checkForUpdates() {
		if (active) return activeKind === "check" ? active : Promise.resolve("busy" as const);
		if (installed || snapshot.status === "installer-handoff")
			return Promise.resolve("not-available" as const);
		let phase: UpdateFailurePhase = "cleanup";
		const operation = Promise.resolve()
			.then(async () => {
				await releasePending();
				phase = "support";
				const support = readSupport(await dependencies.detectSupport());
				const target = approvedTarget(support);
				publish({ support });
				if (target === null) {
					publish({ status: "manual-only" });
					return "completed" as const;
				}
				phase = "check";
				const update = await dependencies.check({
					target,
					timeout: 15000,
					allowDowngrades: false,
				});
				pending = update;
				publish({
					status: update ? "available" : "up-to-date",
					availableUpdate: update ? readMetadata(update) : null,
					lastCheckedAt: (dependencies.now ?? Date.now)(),
				});
				return "completed" as const;
			})
			.catch(async (error: unknown) => {
				fail(error, phase);
				if (phase === "check" && pending) {
					try {
						await releasePending();
					} catch (cleanupError) {
						fail(cleanupError, "cleanup");
					}
				}
				return "failed" as const;
			})
			.finally(finishOperation);
		active = operation;
		activeKind = "check";
		publish({
			status: "checking",
			busy: "check",
			canCheck: false,
			canRetry: false,
			failure: null,
			availableUpdate: null,
			progress: null,
			canDownload: false,
			canInstall: false,
		});
		return operation;
	}

	return {
		state: readonly(store),
		checkForUpdates,
		downloadUpdate,
		installAndRestart,
		retry,
		dismissAvailableUpdate,
	};
}
