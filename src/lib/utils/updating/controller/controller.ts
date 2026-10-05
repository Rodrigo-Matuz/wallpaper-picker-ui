import { readonly, writable } from "svelte/store";
import type {
	AvailableUpdate,
	NativeUpdateResource,
	UpdateActionResult,
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
 * @returns Controller with a read-only reactive snapshot and explicit check action.
 */
export function createUpdaterController(dependencies: UpdaterDependencies) {
	let snapshot: UpdaterSnapshot = Object.freeze({
		status: "idle",
		busy: null,
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
	let activeKind: "check" | "dismiss" | null = null;
	let pending: NativeUpdateResource | null = null;

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
			status: "error",
			failure: Object.freeze({ phase, category }),
			availableUpdate: null,
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
			canCheck: snapshot.status !== "manual-only",
			canRetry: snapshot.status === "error",
		});
	}

	function dismissAvailableUpdate(): Promise<UpdateActionResult> {
		if (active) return activeKind === "dismiss" ? active : Promise.resolve("busy");
		if (!pending || snapshot.status !== "available") return Promise.resolve("not-available");
		const operation = Promise.resolve()
			.then(async () => {
				await releasePending();
				publish({ status: "idle", availableUpdate: null, failure: null });
				return "completed" as const;
			})
			.catch((error: unknown) => {
				fail(error, "cleanup");
				return "failed" as const;
			})
			.finally(finishOperation);
		active = operation;
		activeKind = "dismiss";
		publish({ busy: "dismiss", canCheck: false, canRetry: false });
		return operation;
	}

	function retry(): Promise<UpdateActionResult> {
		if (active) return Promise.resolve("busy");
		if (snapshot.status !== "error") return Promise.resolve("not-available");
		return checkForUpdates();
	}

	function checkForUpdates() {
		if (active) return activeKind === "check" ? active : Promise.resolve("busy" as const);
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
		});
		return operation;
	}

	return { state: readonly(store), checkForUpdates, retry, dismissAvailableUpdate };
}
