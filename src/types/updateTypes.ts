export type UpdaterTarget = "windows-x86_64-nsis" | "windows-x86_64-msi" | "linux-x86_64-appimage";

export interface UpdateSupport {
	readonly mode: "development" | "package-managed" | "manual-only" | "unknown" | "self-managed";
	readonly platform: string;
	readonly architecture: string;
	readonly installer: "nsis" | "msi" | "appimage" | "deb" | "rpm" | "nix" | null;
	readonly target: UpdaterTarget | null;
	readonly reason: string;
}

export interface AvailableUpdate {
	readonly currentVersion: string;
	readonly version: string;
	readonly body?: string;
	readonly date?: string;
}

export type UpdateFailurePhase = "support" | "check" | "cleanup";
export type UpdateFailureCategory =
	| "timeout"
	| "network"
	| "missing-feed"
	| "invalid-manifest"
	| "missing-target"
	| "support-unavailable"
	| "cleanup-failed"
	| "unknown";

export interface UpdateFailure {
	readonly phase: UpdateFailurePhase;
	readonly category: UpdateFailureCategory;
}

export interface UpdaterSnapshot {
	readonly status: "idle" | "checking" | "up-to-date" | "available" | "manual-only" | "error";
	readonly busy: "check" | "dismiss" | null;
	readonly currentVersion: string;
	readonly support: UpdateSupport | null;
	readonly availableUpdate: AvailableUpdate | null;
	readonly failure: UpdateFailure | null;
	readonly lastCheckedAt: number | null;
	readonly canCheck: boolean;
	readonly canRetry: boolean;
	readonly canDownload: boolean;
	readonly canInstall: boolean;
}

/** The native resource is owned privately by one controller, never by a component. */
export interface NativeUpdateResource extends Omit<AvailableUpdate, "body" | "date"> {
	readonly body?: string | null;
	readonly date?: string | null;
	close(): Promise<void>;
}

export interface UpdaterCheckOptions {
	readonly target: UpdaterTarget;
	readonly timeout: number;
	readonly allowDowngrades: false;
}

export interface UpdaterDependencies {
	readonly currentVersion: string;
	readonly detectSupport: () => Promise<unknown>;
	readonly check: (options: UpdaterCheckOptions) => Promise<NativeUpdateResource | null>;
	readonly now?: () => number;
	readonly reportError?: (details: {
		phase: UpdateFailurePhase;
		error: Error;
	}) => void | Promise<void>;
}

export type UpdateActionResult = "completed" | "failed" | "busy" | "not-available";
