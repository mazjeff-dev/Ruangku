<script lang="ts">
	import '../lib/styles/global.css';
	import favicon from '#lib/assets/favicon.svg';
	import ToastHost from '../lib/components/ToastHost.svelte';
	import ConfirmDialog from '../lib/components/ConfirmDialog.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<ToastHost />
<ConfirmDialog />
