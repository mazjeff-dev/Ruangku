<script lang="ts">
  import Icon from './Icon.svelte';
  type Props = { message: string; onretry?: () => void };
  let { message, onretry }: Props = $props();
</script>

<div class="state error" role="alert">
  <span class="state-icon"><Icon name="alert" size={24} /></span>
  <h3>Data gagal dimuat</h3>
  <p>{message}</p>
  {#if onretry}
    <button class="btn btn-ghost btn-sm" onclick={onretry}><Icon name="refresh" size={14} /> Coba lagi</button>
  {/if}
</div>
