import { readonly, writable } from "svelte/store";
import type {
	AvailableUpdate,
	NativeUpdateResource,
	UpdateActionResult,
	UpdateDownloadEvent,
	UpdateFailureCategory,
	UpdateFailurePhase,
	UpdateProgress,
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

/** DOCS: Copies untrusted IPC policy into a frozen snapshot; malformed policy fails closed. */
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

/** DOCS: Exposes metadata only, normalizing native nulls without leaking handles or methods. */
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

/** DOCS: Approval requires the complete policy/architecture/installer match, not just a feed key. */
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

/** DOCS: Heuristic UI diagnostics only; these categories never authorize native operations. */
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

/** DOCS: Validates positive byte totals/timeouts; zero-length progress chunks use a different rule. */
function isPositiveSafeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** DOCS: Normalizes arbitrary rejections, including values whose string conversion throws. */
function normalizeUpdaterError(raw: unknown): Error {
	try {
		return raw instanceof Error && typeof raw.message === "string"
			? raw
			: new Error(String(raw));
	} catch {
		return new Error("Unrecognized updater failure");
	}
}

/** DOCS: Immutable progress; an unknown total stays indeterminate and percent never exceeds 100. */
function createDownloadProgress(
	downloadedBytes: number,
	totalBytes: number | null,
): UpdateProgress {
	return Object.freeze({
		downloadedBytes,
		totalBytes,
		percent: totalBytes === null ? null : Math.min(100, (downloadedBytes / totalBytes) * 100),
	});
}

/** DOCS:
 * Reduces accounting events without changing lifecycle state. Finished is deliberately ignored:
 * only the awaited native download can establish signature-verified readiness.
 * @returns Frozen progress, or null when an event must not publish a new snapshot.
 */
function nextDownloadProgress(
	previous: UpdateProgress | null,
	event: UpdateDownloadEvent,
): UpdateProgress | null {
	const downloadedBytes = previous?.downloadedBytes ?? 0;
	const totalBytes = previous?.totalBytes ?? null;
	if (event.event === "Started") {
		const total = event.data.contentLength;
		return createDownloadProgress(0, isPositiveSafeInteger(total) ? total : null);
	}
	if (event.event !== "Progress") return null;
	const chunk = event.data.chunkLength;
	if (!Number.isSafeInteger(chunk) || chunk < 0) return null;
	return createDownloadProgress(
		Math.min(Number.MAX_SAFE_INTEGER, downloadedBytes + chunk),
		totalBytes,
	);
}

/** DOCS:
 * Creates an isolated updater controller without performing native work on construction.
 * @param dependencies - Native boundary, clock, and application version for this controller.
 * @returns Read-only reactive state and explicit, policy-gated check/download/install/retry actions.
 */
export function createUpdaterController(dependencies: UpdaterDependencies) {
	const configuredTimeout = dependencies.downloadTimeoutMs;
	const downloadTimeout = isPositiveSafeInteger(configuredTimeout) ? configuredTimeout : 600000;
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
	// Sole native owner, including resources quarantined after a rejected close.
	let pending: NativeUpdateResource | null = null;
	// Irreversible Linux install success: recovery must never install again. Not Windows handoff.
	let installed = false;

	function fail(raw: unknown, phase: UpdateFailurePhase) {
		const error = normalizeUpdaterError(raw);
		const category = failureCategory(phase, error.message);
		publish({
			status: installed ? "restart-required" : "error",
			failure: Object.freeze({ phase, category }),
			availableUpdate: installed ? snapshot.availableUpdate : null,
		});
		reportErrorSafely(phase, error);
	}

	/** DOCS: Diagnostics are best effort, never awaited and never allowed to break recovery. */
	function reportErrorSafely(phase: UpdateFailurePhase, error: Error) {
		try {
			void Promise.resolve(dependencies.reportError?.({ phase, error })).catch(() => {
				/* Rejected diagnostics cannot alter the public failure or operation result. */
			});
		} catch {
			/* A synchronous reporter failure has the same isolation guarantee. */
		}
	}

	/** DOCS: Clear ownership only after confirmed close; rejection retains quarantine for retry. */
	async function releasePending() {
		if (!pending) return;
		await pending.close();
		pending = null;
	}

	/** DOCS: Derives UI capabilities without weakening the guards on the explicit actions. */
	function availableActions() {
		return {
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
		};
	}

	/** DOCS: Release the lock before final publication, allowing a subscriber to start a new action. */
	function finishOperation() {
		active = null;
		activeKind = null;
		publish({ busy: null, ...availableActions() });
	}

	/** DOCS:
	 * Register the exact final promise BEFORE publishing: store subscribers run synchronously
	 * and may reenter an action. This must stay synchronous, not an async operation wrapper.
	 */
	function beginOperation(
		operation: Promise<UpdateActionResult>,
		kind: NonNullable<UpdaterSnapshot["busy"]>,
		changes: Partial<UpdaterSnapshot> = {},
	): Promise<UpdateActionResult> {
		active = operation;
		activeKind = kind;
		publish({
			...changes,
			busy: kind,
			canCheck: false,
			canRetry: false,
			canDownload: false,
			canInstall: false,
		});
		return operation;
	}

	/** DOCS: Secondary cleanup failures supersede the displayed failure but retain native ownership. */
	async function releasePendingReportingFailure() {
		try {
			await releasePending();
		} catch (cleanupError) {
			fail(cleanupError, "cleanup");
		}
	}

	/** DOCS: Refresh policy before using an acquired resource; callers still compare exact targets. */
	async function refreshSupport(): Promise<UpdateSupport> {
		const support = readSupport(await dependencies.detectSupport());
		publish({ support });
		return support;
	}

	/** DOCS: Revocation becomes manual-only only after successful resource disposal. */
	async function discardPendingAsManualOnly() {
		await releasePending();
		publish({ status: "manual-only", availableUpdate: null, progress: null });
	}

	/** DOCS:
	 * Discards an available/verified resource; rejected close remains quarantined for explicit retry.
	 * @returns Joined dismissal promise, busy for a conflicting action, or not-available without a resource.
	 */
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
		return beginOperation(operation, "dismiss");
	}

	/** DOCS:
	 * Downloads privately after revalidating the acquired resource's exact installation target.
	 * @returns Joined download promise; completed means the awaited native verification succeeded,
	 * not merely that progress reported Finished. Conflicting actions return busy.
	 */
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
				const support = await refreshSupport();
				if (previousTarget === null || approvedTarget(support) !== previousTarget) {
					phase = "cleanup";
					await discardPendingAsManualOnly();
					return "not-available" as const;
				}
				phase = "download";
				await download.call(
					update,
					(event: UpdateDownloadEvent) => {
						if (active !== operation || snapshot.status !== "downloading") return;
						const progress = nextDownloadProgress(snapshot.progress, event);
						if (progress) publish({ progress });
					},
					{ timeout: downloadTimeout },
				);
				publish({ status: "ready-to-install" });
				return "completed" as const;
			})
			.catch(async (error: unknown) => {
				fail(error, phase);
				if (phase !== "cleanup" && !installed) {
					await releasePendingReportingFailure();
				}
				return "failed" as const;
			})
			.finally(finishOperation);
		return beginOperation(operation, "download", {
			status: "downloading",
			failure: null,
			progress: createDownloadProgress(0, null),
		});
	}

	/** DOCS:
	 * Requires consent for this exact version and strict true from the application's safety gate.
	 * Gate denial retains the verified resource. Windows hands off to its installer; Linux records
	 * successful replacement before cleanup/relaunch so later recovery never repeats installation.
	 * @param confirmation - Explicit user consent and the currently verified available version.
	 * @returns Joined installation promise. Windows completed means handoff, not proven installation.
	 */
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
				const previousTarget = snapshot.support && approvedTarget(snapshot.support);
				const support = await refreshSupport();
				if (previousTarget === null || approvedTarget(support) !== previousTarget) {
					phase = "cleanup";
					await discardPendingAsManualOnly();
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
					await releasePendingReportingFailure();
				}
				return "failed" as const;
			})
			.finally(finishOperation);
		return beginOperation(operation, "install", { status: "installing", failure: null });
	}

	/** DOCS: Called only after successful Linux installation; retries cleanup/safety/relaunch, not install. */
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
		return beginOperation(operation, "restart", { status: "restarting", failure: null });
	}

	/** DOCS:
	 * Pre-install failures reacquire metadata and payload rather than blindly replaying install.
	 * @returns A new check, or cleanup/restart only after successful replacement; busy on conflicts.
	 */
	function retry(): Promise<UpdateActionResult> {
		if (active) return activeKind === "restart" ? active : Promise.resolve("busy");
		if (installed && snapshot.status === "restart-required") return restartOnly();
		if (snapshot.status !== "error") return Promise.resolve("not-available");
		return checkForUpdates();
	}

	/** DOCS:
	 * Releases the previous resource before policy detection and an exact-target, no-downgrade check.
	 * @returns Joined check promise; completed may mean manual-only or up-to-date, not update found.
	 */
	function checkForUpdates(): Promise<UpdateActionResult> {
		if (active) return activeKind === "check" ? active : Promise.resolve("busy" as const);
		if (installed || snapshot.status === "installer-handoff")
			return Promise.resolve("not-available" as const);
		let phase: UpdateFailurePhase = "cleanup";
		const operation = Promise.resolve()
			.then(async () => {
				await releasePending();
				phase = "support";
				const support = await refreshSupport();
				const target = approvedTarget(support);
				if (target === null) {
					publish({ status: "manual-only" });
					return "completed" as const;
				}
				phase = "check";
				const update = await dependencies.check({
					target,
					timeout: 15000,
				});
				// Take ownership before reading getters: malformed metadata still requires cleanup.
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
					await releasePendingReportingFailure();
				}
				return "failed" as const;
			})
			.finally(finishOperation);
		return beginOperation(operation, "check", {
			status: "checking",
			failure: null,
			availableUpdate: null,
			progress: null,
		});
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
