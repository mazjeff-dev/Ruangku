<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  type Props = { title: string; message?: string; icon?: string; children?: Snippet };
  let { title, message, icon = 'inbox', children }: Props = $props();
</script>

<div class="state">
  <span class="state-icon"><Icon name={icon} size={24} /></span>
  <h3>{title}</h3>
  {#if message}<p>{message}</p>{/if}
  {#if children}{@render children()}{/if}
</div>
