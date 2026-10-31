<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  type Props = {
    open: boolean;
    title: string;
    subtitle?: string;
    size?: 'sm' | 'md' | 'lg';
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
  };
  let { open, title, subtitle, size = 'md', onclose, children, footer }: Props = $props();

  let dialog = $state<HTMLDivElement>();

  function onkey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') onclose();
    if (e.key === 'Tab' && dialog) {
      // jebakan fokus sederhana
      const f = dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  $effect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    queueMicrotask(() => dialog?.focus());
    return () => {
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  });
</script>

<svelte:window onkeydown={onkey} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
    <div class="dialog {size}" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" bind:this={dialog}>
      <header>
        <div class="grow">
          <h2>{title}</h2>
          {#if subtitle}<p>{subtitle}</p>{/if}
        </div>
        <button class="btn btn-ghost btn-sm btn-icon" onclick={onclose} aria-label="Tutup"><Icon name="close" size={16} /></button>
      </header>
      <div class="body">{@render children()}</div>
      {#if footer}<footer>{@render footer()}</footer>{/if}
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 20px; background: rgba(16, 24, 40, 0.55); backdrop-filter: blur(3px); animation: fade .2s var(--ease); }
  .dialog { width: 100%; max-height: calc(100dvh - 40px); display: flex; flex-direction: column; background: var(--white); border-radius: 20px; box-shadow: var(--shadow-lg); animation: pop .28s var(--ease); outline: none; }
  .sm { max-width: 440px; } .md { max-width: 640px; } .lg { max-width: 860px; }
  header { display: flex; align-items: flex-start; gap: 12px; padding: 22px 24px 14px; }
  h2 { font-size: 21px; font-weight: 600; letter-spacing: -.3px; color: var(--navy); }
  header p { margin-top: 3px; font-size: 12.5px; color: var(--ink-3); }
  .body { padding: 6px 24px 22px; overflow-y: auto; }
  footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--line-2); background: #fcfbf8; border-radius: 0 0 20px 20px; }
  @media (max-width: 560px) {
    .backdrop { padding: 0; align-items: end; }
    .dialog { max-height: 94dvh; border-radius: 20px 20px 0 0; }
    footer { border-radius: 0; }
    footer :global(.btn) { flex: 1; }
  }
</style>
