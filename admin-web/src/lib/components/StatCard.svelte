<script lang="ts">
  import Icon from './Icon.svelte';
  type Props = { label: string; value: number | string; note?: string; icon: string; tone?: 'navy' | 'gold' | 'ok' | 'bad' | 'warn' | 'mute'; loading?: boolean };
  let { label, value, note, icon, tone = 'navy', loading = false }: Props = $props();
</script>

<article class="stat card">
  <div class="top">
    <span class="label">{label}</span>
    <span class="ic {tone}"><Icon name={icon} size={17} /></span>
  </div>
  {#if loading}
    <div class="skeleton v"></div>
    <div class="skeleton n"></div>
  {:else}
    <div class="value">{value}</div>
    {#if note}<div class="note">{note}</div>{/if}
  {/if}
</article>

<style>
  .stat { padding: 18px 18px 16px; transition: transform .25s var(--ease), box-shadow .25s var(--ease), border-color .25s; }
  .stat:hover { transform: translateY(-2px); box-shadow: var(--shadow); border-color: var(--gold-soft); }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .label { font-size: 12px; font-weight: 600; color: var(--ink-3); }
  .ic { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 11px; }
  .navy { background: #e9ecf3; color: var(--navy-3); } .gold { background: var(--gold-tint); color: var(--gold-deep); }
  .ok { background: var(--ok-bg); color: var(--ok); } .bad { background: var(--bad-bg); color: var(--bad); }
  .warn { background: var(--warn-bg); color: var(--warn); } .mute { background: var(--mute-bg); color: var(--mute); }
  .value { margin-top: 14px; font-size: 34px; font-weight: 700; letter-spacing: -1px; color: var(--navy); line-height: 1; }
  .note { margin-top: 8px; font-size: 12px; font-weight: 400; color: var(--ink-3); }
  .v { height: 32px; width: 70px; margin-top: 14px; } .n { height: 12px; width: 120px; margin-top: 10px; }
</style>
