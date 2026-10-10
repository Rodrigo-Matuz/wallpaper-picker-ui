import type { Readable } from "svelte/store";
import type {
	UpdateActionResult,
	UpdateFailureCategory,
	UpdaterSnapshot,
} from "$types/updateTypes";

/** Public UI surface only; split native operations and disposal are never exposed as controls. */
export interface UpdaterPanelController {
	readonly state: Readable<UpdaterSnapshot>;
	checkForUpdates(): Promise<UpdateActionResult>;
	updateAndRestart(confirmation: {
		confirmed: true;
		version: string;
	}): Promise<UpdateActionResult>;
	retry(): Promise<UpdateActionResult>;
}

export const statusKeys: Partial<Record<UpdaterSnapshot["status"], string>> = {
	checking: "updater.status.checking",
	"up-to-date": "updater.status.current",
	available: "updater.status.available",
	downloading: "updater.status.downloading",
	"ready-to-install": "updater.status.ready",
	installing: "updater.status.installing",
	"installer-handoff": "updater.status.handoff",
	restarting: "updater.status.restarting",
	"restart-required": "updater.status.restart",
};

export const categoryKeys: Record<UpdateFailureCategory, string> = {
	timeout: "timeout",
	network: "network",
	"missing-feed": "feed",
	"invalid-manifest": "manifest",
	"missing-target": "target",
	"support-unavailable": "support",
	"cleanup-failed": "cleanup",
	"invalid-signature": "signature",
	"install-failed": "install",
	"restart-failed": "restart",
	unknown: "unknown",
};
