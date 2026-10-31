<script lang="ts">
  import Icon from './Icon.svelte';
  type Props = { page: number; totalPages: number; total: number; pageSize: number; onchange: (p: number) => void };
  let { page, totalPages, total, pageSize, onchange }: Props = $props();
  const from = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1);
  const to = $derived(Math.min(total, page * pageSize));
</script>

<div class="pager">
  <span class="info">Menampilkan {from}–{to} dari {total}</span>
  <div class="row">
    <button class="btn btn-ghost btn-sm btn-icon" disabled={page <= 1} onclick={() => onchange(page - 1)} aria-label="Halaman sebelumnya"><Icon name="chevL" size={16} /></button>
    <span class="cur">Hal. {page} / {totalPages}</span>
    <button class="btn btn-ghost btn-sm btn-icon" disabled={page >= totalPages} onclick={() => onchange(page + 1)} aria-label="Halaman berikutnya"><Icon name="chevR" size={16} /></button>
  </div>
</div>

<style>
  .pager { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 14px 18px; border-top: 1px solid var(--line-2); }
  .info { font-size: 12px; color: var(--ink-3); } .cur { font-size: 12px; font-weight: 600; color: var(--ink-2); min-width: 78px; text-align: center; }
</style>
