import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import Progress from "./progress.svelte";

afterEach(cleanup);

describe("Progress", () => {
	it("updates its accessible progress and indicator when value changes", async () => {
		const view = render(Progress, { value: 25, max: 50, "aria-label": "Thumbnails" });
		const progress = screen.getByRole("progressbar", { name: "Thumbnails" });
		const indicator = progress.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
		expect(progress.getAttribute("aria-valuenow")).toBe("25");
		expect(progress.getAttribute("aria-valuemax")).toBe("50");
		expect(indicator.style.transform).toBe("translateX(-50%)");

		await view.rerender({ value: 40, max: 50, "aria-label": "Thumbnails" });
		expect(progress.getAttribute("aria-valuenow")).toBe("40");
		expect(indicator.style.transform).toBe("translateX(-20%)");
	});
});
