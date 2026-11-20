<script lang="ts">
  import Modal from './Modal.svelte';
  import { apiRequest } from '../api';
  import { handleApiError } from '../stores/app.svelte';
  import { toastSuccess } from '../stores/toast.svelte';

  let { entry, endpoint, onclose, onchanged }: {
    entry: { id: number; title: string; room: { name: string } } | null;
    endpoint: string;
    onclose: () => void;
    onchanged: () => void;
  } = $props();

  let reason = $state('');
  let error = $state('');
  let saving = $state(false);

  async function submit() {
    if (reason.trim().length < 3) {
      error = 'Alasan pembatalan minimal 3 karakter.';
      return;
    }
    saving = true;
    error = '';
    try {
      const result = await apiRequest(`${endpoint}/${entry!.id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: reason.trim() })
      });
      toastSuccess(result.message);
      reason = '';
      onclose();
      onchanged();
    } catch (e) {
      error = handleApiError(e, 'Gagal membatalkan antrean', true);
    } finally {
      saving = false;
    }
  }
</script>

<Modal open={entry !== null} title="Batalkan antrean" subtitle={entry ? `${entry.title} · ${entry.room.name}` : undefined} onclose={onclose}>
  <label class="field">
    <span>Alasan pembatalan</span>
    <textarea class="textarea" bind:value={reason} maxlength="500" required></textarea>
  </label>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#snippet footer()}
    <button class="btn btn-ghost" onclick={onclose} disabled={saving}>Kembali</button>
    <button class="btn btn-danger" onclick={submit} disabled={saving || reason.trim().length < 3}>
      {#if saving}<span class="spinner"></span>{/if} Batalkan antrean
    </button>
  {/snippet}
</Modal>

<style>
  .field { display:grid; gap:7px; }
  .field span { color:var(--ink-2); font-size:12px; font-weight:600; }
  .error { margin-top:10px; color:var(--danger); font-size:12px; }
</style>
