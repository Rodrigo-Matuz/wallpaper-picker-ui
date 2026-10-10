export type UpdaterTarget = "windows-x86_64-nsis" | "windows-x86_64-msi" | "linux-x86_64-appimage";

export interface UpdateSupport {
	readonly mode: "development" | "package-managed" | "manual-only" | "unknown" | "self-managed";
	readonly platform: string;
	readonly architecture: string;
	readonly installer: "nsis" | "msi" | "appimage" | "deb" | "rpm" | "nix" | null;
	readonly target: UpdaterTarget | null;
	/** Exact metadata-check target only; never grants download or installation authority. */
	readonly checkTarget?: UpdaterTarget | null;
	readonly reason: string;
}

export interface AvailableUpdate {
	readonly currentVersion: string;
	readonly version: string;
	readonly body?: string;
	readonly date?: string;
}

export type UpdateFailurePhase =
	| "support"
	| "check"
	| "cleanup"
	| "download"
	| "install"
	| "restart";

export type UpdateDownloadEvent =
	| { event: "Started"; data: { contentLength?: number | null } }
	| { event: "Progress"; data: { chunkLength: number } }
	| { event: "Finished" };

export interface UpdateProgress {
	readonly downloadedBytes: number;
	readonly totalBytes: number | null;
	readonly percent: number | null;
}
export type UpdateFailureCategory =
	| "timeout"
	| "network"
	| "missing-feed"
	| "invalid-manifest"
	| "missing-target"
	| "support-unavailable"
	| "cleanup-failed"
	| "invalid-signature"
	| "install-failed"
	| "restart-failed"
	| "unknown";

export interface UpdateFailure {
	readonly phase: UpdateFailurePhase;
	readonly category: UpdateFailureCategory;
}

export interface UpdaterSnapshot {
	readonly status:
		| "idle"
		| "checking"
		| "up-to-date"
		| "available"
		| "manual-only"
		| "error"
		| "downloading"
		| "ready-to-install"
		| "installing"
		| "installer-handoff"
		| "restarting"
		| "restart-required";
	readonly busy: "check" | "dismiss" | "download" | "install" | "restart" | "update" | null;
	readonly progress: UpdateProgress | null;
	readonly currentVersion: string;
	readonly support: UpdateSupport | null;
	readonly availableUpdate: AvailableUpdate | null;
	readonly failure: UpdateFailure | null;
	readonly lastCheckedAt: number | null;
	readonly canCheck: boolean;
	readonly canRetry: boolean;
	readonly canDownload: boolean;
	readonly canInstall: boolean;
	readonly canUpdate: boolean;
	readonly installBlocked: boolean;
}

/** The native resource is owned privately by one controller, never by a component. */
export interface NativeUpdateResource extends Omit<AvailableUpdate, "body" | "date"> {
	readonly body?: string | null;
	readonly date?: string | null;
	download?(
		onEvent: (event: UpdateDownloadEvent) => void,
		options: { timeout: number },
	): Promise<void>;
	install?(): Promise<void>;
	close(): Promise<void>;
}

export interface UpdaterCheckOptions {
	readonly target: UpdaterTarget;
	readonly timeout: number;
}

/** Exclusive application admission lease; retained until exit on successful handoff/relaunch. */
export interface InstallReservation {
	release(): void;
}

export interface UpdaterDependencies {
	readonly currentVersion: string;
	readonly detectSupport: () => Promise<unknown>;
	readonly check: (options: UpdaterCheckOptions) => Promise<NativeUpdateResource | null>;
	readonly now?: () => number;
	/** Internal HTTP request bound, not an AbortSignal or full lifecycle cancellation guarantee. */
	readonly downloadTimeoutMs?: number;
	/** Missing/denying adapters fail closed; a boolean is never installation authorization. */
	readonly prepareInstall?: () => Promise<InstallReservation | null>;
	readonly relaunch?: () => Promise<void>;
	readonly reportError?: (details: {
		phase: UpdateFailurePhase;
		error: Error;
	}) => void | Promise<void>;
}

export type UpdateActionResult = "completed" | "failed" | "busy" | "not-available";
