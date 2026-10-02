<script lang="ts">
export let larger: boolean = false;
</script>

<div
    class="{larger ? 'my-8' : 'my-4'} h-px w-full bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
></div>
