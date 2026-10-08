export function assertHostedLinux(
	env: Record<string, string | undefined>,
	platform: string,
	uid: number | undefined,
): void {
	const expected = {
		GITHUB_ACTIONS: "true",
		RUNNER_ENVIRONMENT: "github-hosted",
		RUNNER_OS: "Linux",
		WALLPAPER_PICKER_NATIVE_ACCEPTANCE: "1",
	};
	if (platform !== "linux" || uid === undefined || uid === 0) {
		throw new Error("Native acceptance requires Linux and a nonroot runner user");
	}
	for (const [key, value] of Object.entries(expected)) {
		if (env[key] !== value) throw new Error(`Native acceptance guard refused: ${key}`);
	}
	if (
		!env.RUNNER_TEMP ||
		!env.RUNNER_TEMP.startsWith("/") ||
		env.RUNNER_TEMP.includes("\0") ||
		env.RUNNER_TEMP.split("/")
			.slice(1)
			.some((part) => ["", ".", ".."].includes(part))
	) {
		throw new Error("Native acceptance requires absolute RUNNER_TEMP");
	}
}
