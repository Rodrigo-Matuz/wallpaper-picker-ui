<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

interface BaseProps {
	variant?: "accent" | "primary" | "outline" | "ghost";
	size?: "sm" | "md" | "lg";
	onclick?: (event: MouseEvent) => void;
	disabled?: boolean;
	class?: string;
	children: Snippet;
}

type AnchorButtonProps = BaseProps &
	Pick<HTMLAnchorAttributes, "href" | "target" | "rel"> & {
		type?: never;
		ref?: HTMLAnchorElement | null;
	};

type NativeButtonProps = BaseProps &
	Pick<
		HTMLButtonAttributes,
		"form" | "formaction" | "formenctype" | "formmethod" | "formnovalidate" | "formtarget"
	> & {
		href?: never;
		type?: "button" | "submit" | "reset";
		ref?: HTMLButtonElement | null;
	};

type Props = AnchorButtonProps | NativeButtonProps;

let {
	class: className,
	variant = "accent",
	size = "md",
	ref = $bindable(null),
	href,
	type = "button",
	disabled,
	onclick,
	children,
	...restProps
}: Props = $props();

const baseStyles =
	"inline-flex items-center justify-center gap-2 font-semibold uppercase tracking-[0.14em] transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

const sizeStyles: Record<string, string> = {
	sm: "px-4 py-2 text-[10px] sm:text-xs",
	md: "px-5 py-3 text-xs",
	lg: "px-6 py-4 text-xs",
};

const variantStyles: Record<string, string> = {
	accent: "bg-accent text-white hover:bg-accent/85",
	primary: "bg-primary text-white hover:bg-primary/85",
	outline: "border border-foreground/15 text-foreground hover:border-success hover:text-success",
	ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 text-foreground",
};

const classes = $derived(
	`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`,
);
</script>

{#if href !== undefined}
    <a
        bind:this={ref}
        data-slot="button"
        class={classes}
        href={disabled ? undefined : href}
        aria-disabled={disabled}
        {onclick}
        role={disabled ? 'link' : undefined}
        tabindex={disabled ? -1 : undefined}
        {...restProps}
    >
        {@render children?.()}
    </a>
{:else}
    <button
        bind:this={ref}
        data-slot="button"
        class={classes}
        {type}
        {disabled}
        {onclick}
        {...restProps}
    >
        {@render children?.()}
    </button>
{/if}
