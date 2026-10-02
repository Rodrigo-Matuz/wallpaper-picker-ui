import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import DevProfile from "./devProfile.svelte";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("Contributor profile", () => {
	it("keeps configured identity and accessible links visible while fetching", () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		);
		render(DevProfile, {
			name: "Matuz",
			githubUrl: "https://github.com/Rodrigo-Matuz",
			links: [],
		});
		expect(screen.getByRole("heading", { name: "Matuz" })).toBeTruthy();
		expect(screen.getByText("@Rodrigo-Matuz")).toBeTruthy();
	});

	it.each([
		"offline",
		"rate-limit",
		"malformed",
	])("keeps the profile useful when GitHub is %s", async (failure) => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				failure === "offline"
					? Promise.reject(new TypeError("Network unavailable"))
					: Promise.resolve({
							ok: failure !== "rate-limit",
							json: async () => ({ message: "Unavailable" }),
						}),
			),
		);
		render(DevProfile, {
			name: "Matuz",
			githubUrl: "https://github.com/Rodrigo-Matuz",
			links: [{ id: "github", url: "https://github.com/Rodrigo-Matuz", icon: "github" }],
		});
		await waitFor(() =>
			expect(
				screen.getByText("GitHub profile unavailable. Links remain available."),
			).toBeTruthy(),
		);
		expect(screen.getByRole("heading", { name: "Matuz" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "GitHub" }).getAttribute("rel")).toContain(
			"noopener",
		);
		expect(screen.queryByText("Loading profile information...")).toBeNull();
	});

	it("cancels the profile request when the component is removed", async () => {
		const fetchMock = vi.fn<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>(
			() => new Promise(() => {}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { unmount } = render(DevProfile, {
			name: "Matuz",
			githubUrl: "https://github.com/Rodrigo-Matuz",
		});
		await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		const signal = fetchMock.mock.calls[0]?.[1]?.signal;
		await unmount();
		expect(signal?.aborted).toBe(true);
	});
});
