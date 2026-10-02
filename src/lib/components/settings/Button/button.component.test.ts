import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsButton from "./button.svelte";

afterEach(cleanup);

describe("SettingsButton", () => {
	it("runs the supplied settings action when its button is pressed", async () => {
		const onClick = vi.fn();
		render(SettingsButton, {
			name: "Clear Thumbnails",
			shortDescription: "Remove cached previews",
			hintDescription: "Thumbnails will be regenerated",
			buttonName: "CLEAR",
			buttonOnClick: onClick,
		});
		expect(screen.getByText("Remove cached previews")).toBeTruthy();
		await fireEvent.click(screen.getByRole("button", { name: "CLEAR" }));
		expect(onClick).toHaveBeenCalledTimes(1);
	});
});
