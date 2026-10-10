import type { ReadGitHub } from "./audit";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export function createGitHubReader(
	fetcher: Fetch = fetch,
	environment: { GITHUB_TOKEN?: string } = { GITHUB_TOKEN: process.env.GITHUB_TOKEN },
): ReadGitHub {
	return async (path, limit, asset = false) => {
		if (
			!/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases(?:\/assets\/[1-9]\d*|\/[1-9]\d*\/assets)?(?:\?per_page=100&page=[1-9]\d*)?$/.test(
				path,
			) ||
			/\/(?:\.{1,2})\//.test(path) ||
			!Number.isSafeInteger(limit) ||
			limit <= 0 ||
			limit > 1_048_576
		) {
			throw new Error("Invalid GitHub read request");
		}
		if (!environment.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is required");
		const signal = AbortSignal.timeout(25_000);
		let response = await fetcher(`https://api.github.com${path}`, {
			method: "GET",
			redirect: "manual",
			signal,
			headers: {
				Authorization: `Bearer ${environment.GITHUB_TOKEN}`,
				Accept: asset ? "application/octet-stream" : "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});
		if (response.status === 302) {
			const location = new URL(
				response.headers.get("location") ?? "",
				"https://api.github.com",
			);
			if (
				!asset ||
				location.protocol !== "https:" ||
				location.hostname !== "release-assets.githubusercontent.com" ||
				location.port ||
				location.username ||
				location.password
			) {
				throw new Error("Untrusted asset redirect");
			}
			response = await fetcher(location.href, {
				method: "GET",
				redirect: "manual",
				signal,
			});
		}
		if (response.status !== 200) throw new Error(`GitHub read failed: HTTP ${response.status}`);
		if (!response.body) throw new Error("Missing response body");
		const reader = response.body.getReader();
		const chunks: Uint8Array[] = [];
		let size = 0;
		try {
			while (true) {
				const chunk = await reader.read();
				if (chunk.done) break;
				size += chunk.value.byteLength;
				if (size > limit) throw new Error("Response exceeded byte bound");
				chunks.push(chunk.value);
			}
		} catch (error) {
			await reader.cancel().catch(() => {});
			throw error;
		} finally {
			reader.releaseLock();
		}
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
			Buffer.concat(chunks),
		);
	};
}
