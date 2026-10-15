import { readFileSync } from "node:fs";
import { cleanup, render, waitFor } from "@testing-library/svelte";
import postcss from "postcss";
import { createRawSnippet } from "svelte";
import { compile } from "svelte/compiler";
import { writable } from "svelte/store";
import { toast } from "svelte-sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Layout from "./+layout.svelte";

vi.hoisted(() => {
	vi.stubGlobal("localStorage", {
		getItem: vi.fn(() => null),
		setItem: vi.fn(),
		removeItem: vi.fn(),
	});
});
vi.mock("$utils/updating/session/runtime", () => ({
	initializeApplicationSession: vi.fn(async () => {}),
	runtimeMode: writable(null),
	languageReady: writable(true),
}));
vi.mock("$api/config/update/update", () => ({ updateConfig: vi.fn() }));
beforeEach(() => {
	vi.stubGlobal("localStorage", {
		getItem: vi.fn(() => null),
		setItem: vi.fn(),
		removeItem: vi.fn(),
	});
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function mountLayout() {
	render(Layout, {
		children: createRawSnippet(() => ({ render: () => "<div>Route content</div>" })),
	});
}

const theme = readFileSync("src/routes/layout.css", "utf8");

// jsdom cannot resolve custom properties: verify the actual Sonner DOM's variable
// bindings against the owned theme. Browser evidence covers computed paint/layout.
function resolveThemeColor(value: string): string {
	const token = /^var\((--color-[\w-]+)\)$/.exec(value.trim())?.[1];
	expect(token, `Toast color must use an app theme token: ${value}`).toBeTruthy();
	if (!token) return "";
	const semanticName = token.replace("--color-", "");
	const color =
		theme.match(new RegExp(`${token}:\\s*(#[\\da-f]{6});`, "i"))?.[1] ??
		theme.match(new RegExp(`--theme-${semanticName}:\\s*(#[\\da-f]{6});`, "i"))?.[1];
	expect(color, `Missing opaque theme token: ${token}`).toBeTruthy();
	return color ?? "";
}

describe("app toast styling (real generated wrapper and svelte-sonner)", () => {
	it("binds every toast background to the opaque app surface", async () => {
		mountLayout();
		toast.info("Update available", { duration: Number.POSITIVE_INFINITY, closeButton: true });
		await waitFor(() => expect(document.querySelector("[data-sonner-toast]")).toBeTruthy());
		const toaster = document.querySelector<HTMLOListElement>("[data-sonner-toaster]");
		expect(toaster).toBeTruthy();
		expect(document.querySelector("[data-sonner-toast]")?.getAttribute("data-type")).toBe(
			"info",
		);
		for (const type of ["normal", "info", "success", "warning", "error"]) {
			expect(resolveThemeColor(toaster?.style.getPropertyValue(`--${type}-bg`) ?? "")).toBe(
				"#001029",
			);
		}
	});

	it("uses app action colors on the real Sonner action button", async () => {
		mountLayout();
		toast.info("Update available", {
			duration: Number.POSITIVE_INFINITY,
			action: { label: "View update on About", onClick: vi.fn() },
		});
		await waitFor(() => expect(document.querySelector("[data-button]")).toBeTruthy());
		const toaster = document.querySelector<HTMLElement>("[data-sonner-toaster]");
		const action = document.querySelector<HTMLElement>("[data-button]");
		expect(resolveThemeColor(toaster?.style.getPropertyValue("--action-bg") ?? "")).toBe(
			"#1e65ff",
		);
		expect(resolveThemeColor(toaster?.style.getPropertyValue("--action-text") ?? "")).toBe(
			"#f5f5f5",
		);
		const declarations: Record<string, string> = {};
		postcss.parse(theme).walkRules((rule) => {
			if (!rule.selector.includes("[data-sonner-") || rule.selector.includes(":hover"))
				return;
			if (action?.matches(rule.selector)) {
				rule.walkDecls((declaration) => {
					declarations[declaration.prop] = declaration.value;
				});
			}
		});
		expect(declarations.background).toBe("var(--action-bg)");
		expect(declarations.color).toBe("var(--action-text)");
	});

	it("insets the real close button and reserves space for wrapping content", async () => {
		const vendorCSS = compile(
			readFileSync("node_modules/svelte-sonner/dist/Toaster.svelte", "utf8"),
			{ filename: "Toaster.svelte", css: "external" },
		).css?.code;
		const appRules: string[] = [];
		postcss.parse(theme).walkRules((rule) => {
			if (rule.selector.includes("[data-sonner-")) appRules.push(rule.toString());
		});
		const sheet = document.createElement("style");
		sheet.textContent = `${vendorCSS}\n${appRules.join("\n")}`;
		document.head.append(sheet);
		try {
			mountLayout();
			toast.info("Update available with a long translated notification title", {
				duration: Number.POSITIVE_INFINITY,
				closeButton: true,
				action: { label: "View update on About", onClick: vi.fn() },
			});
			await waitFor(() => expect(document.querySelector("[data-close-button]")).toBeTruthy());
			const close = document.querySelector<HTMLElement>("[data-close-button]");
			const notification = document.querySelector<HTMLElement>("[data-sonner-toast]");
			const content = document.querySelector<HTMLElement>("[data-content]");
			if (!close || !notification || !content) throw new Error("Missing real Sonner DOM");
			const closeStyle = getComputedStyle(close);
			expect(closeStyle.top).toBe("8px");
			expect(closeStyle.right).toBe("8px");
			expect(closeStyle.left).toBe("auto");
			expect(closeStyle.bottom).toBe("auto");
			expect(closeStyle.transform).toBe("none");
			expect(getComputedStyle(notification).paddingRight).toBe("44px");
			expect(getComputedStyle(notification).flexWrap).toBe("wrap");
			expect(getComputedStyle(content).minWidth).toBe("0");
		} finally {
			sheet.remove();
		}
	});
});
