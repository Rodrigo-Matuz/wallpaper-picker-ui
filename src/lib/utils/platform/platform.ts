/** Returns true for Windows user agents without touching browser globals during SSR. */
export function isWindowsPlatform(userAgent?: string): boolean {
	const value = userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
	return /Windows (?:NT|Phone)/i.test(value);
}
