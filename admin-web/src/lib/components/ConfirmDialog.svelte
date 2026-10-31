<script lang="ts">
  import Modal from './Modal.svelte';
  import { confirmState, settleConfirm } from '../stores/confirm.svelte';
</script>

<Modal open={confirmState.open} title={confirmState.options.title} size="sm" onclose={() => settleConfirm(false)}>
  <p class="msg">{confirmState.options.message}</p>
  {#snippet footer()}
    <button class="btn btn-ghost" onclick={() => settleConfirm(false)}>Batal</button>
    <button
      class="btn {confirmState.options.tone === 'danger' ? 'btn-danger-solid' : 'btn-primary'}"
      onclick={() => settleConfirm(true)}
    >
      {confirmState.options.confirmLabel ?? 'Ya, lanjutkan'}
    </button>
  {/snippet}
</Modal>

<style>
  .msg { color: var(--ink-2); font-size: 14px; line-height: 1.6; }
</style>
