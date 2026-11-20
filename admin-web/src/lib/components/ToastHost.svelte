<script lang="ts">
  import { toasts, dismissToast } from '../stores/toast.svelte';
  import Icon from './Icon.svelte';
  const icon = { success: 'check', error: 'alert', info: 'info' } as const;
</script>

<div class="host" aria-live="polite" role="status">
  {#each toasts.items as t (t.id)}
    <div class="toast {t.kind}">
      <span class="ic"><Icon name={icon[t.kind]} size={16} stroke={2.2} /></span>
      <span class="msg">{t.message}</span>
      <button onclick={() => dismissToast(t.id)} aria-label="Tutup notifikasi"><Icon name="close" size={14} /></button>
    </div>
  {/each}
</div>

<style>
  .host { position: fixed; right: 20px; bottom: 20px; z-index: 120; display: grid; gap: 10px; width: min(380px, calc(100vw - 40px)); pointer-events: none; }
  .toast { pointer-events: auto; display: flex; align-items: flex-start; gap: 12px; padding: 13px 14px; background: var(--navy); color: #fff; border-radius: 14px; box-shadow: var(--shadow-lg); animation: slide-in .32s var(--ease); border-left: 4px solid var(--gold); }
  .toast.success { border-left-color: #5fb985; }
  .toast.error { border-left-color: #e57373; }
  .ic { margin-top: 1px; display: grid; place-items: center; color: var(--gold); }
  .success .ic { color: #5fb985; } .error .ic { color: #e57373; }
  .msg { flex: 1; font-size: 13px; line-height: 1.5; }
  button { background: none; border: 0; color: #9aa6ba; padding: 2px; display: grid; }
  button:hover { color: #fff; }
  @media (max-width: 560px) { .host { right: 12px; left: 12px; bottom: 12px; width: auto; } }
</style>
