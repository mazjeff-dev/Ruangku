<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../../lib/components/Icon.svelte';
  import Skeleton from '../../../lib/components/Skeleton.svelte';
  import EmptyState from '../../../lib/components/EmptyState.svelte';
  import ErrorState from '../../../lib/components/ErrorState.svelte';
  import Pagination from '../../../lib/components/Pagination.svelte';
  import BookingDetailModal from '../../../lib/components/BookingDetailModal.svelte';
  import { apiRequest, qs } from '../../../lib/api';
  import { handleApiError, refreshBadges } from '../../../lib/stores/app.svelte';
  import { toastSuccess } from '../../../lib/stores/toast.svelte';
  import { fmtRelative } from '../../../lib/utils';

  let items = $state<any[]>([]);
  let unreadOnly = $state(false);
  let page = $state(1);
  const pageSize = 15;
  let total = $state(0);
  let totalPages = $state(1);
  let unread = $state(0);
  let loading = $state(true);
  let error = $state('');
  let detailId = $state<number | null>(null);

  const icons: Record<string, string> = { BOOKING_SUBMITTED: 'inbox', BOOKING_APPROVED: 'check', BOOKING_REJECTED: 'x', BOOKING_CANCELLED: 'alert', BOOKING_REMINDER: 'clock' };

  async function load() {
    loading = true; error = '';
    try {
      const r = await apiRequest(`/notifications${qs({ unread: unreadOnly ? 'true' : '', page, pageSize })}`);
      items = r.data; total = r.total; totalPages = r.totalPages; unread = r.unread;
    } catch (e) { error = handleApiError(e, 'Gagal memuat notifikasi', true); }
    finally { loading = false; }
  }

  async function open(n: any) {
    if (!n.isRead) {
      try { await apiRequest(`/notifications/${n.id}/read`, { method: 'PATCH' }); n.isRead = true; unread = Math.max(0, unread - 1); refreshBadges(); }
      catch (e) { handleApiError(e); }
    }
    if (n.bookingId) detailId = n.bookingId;
  }

  async function readAll() {
    try { await apiRequest('/notifications/read-all', { method: 'PATCH' }); toastSuccess('Semua notifikasi ditandai sudah dibaca'); await load(); refreshBadges(); }
    catch (e) { handleApiError(e); }
  }

  onMount(load);
</script>

<svelte:head><title>Notifikasi — RuangKu Admin</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div><div class="kicker">Akun</div><h1 class="page-title">Notifikasi</h1><p class="page-desc">{unread > 0 ? `${unread} notifikasi belum dibaca.` : 'Semua notifikasi sudah dibaca.'}</p></div>
    <div class="toolbar">
      <label class="switch"><input type="checkbox" bind:checked={unreadOnly} onchange={() => { page = 1; load(); }} /> Belum dibaca saja</label>
      <button class="btn btn-ghost" onclick={readAll} disabled={unread === 0}><Icon name="check" size={15} /> Tandai semua dibaca</button>
    </div>
  </div>

  <section class="card">
    {#if loading && items.length === 0}<Skeleton rows={6} height={44} />
    {:else if error}<ErrorState message={error} onretry={load} />
    {:else if items.length === 0}<EmptyState icon="bell" title="Tidak ada notifikasi" message={unreadOnly ? 'Tidak ada notifikasi yang belum dibaca.' : 'Notifikasi pengajuan dan pembatalan peminjaman akan muncul di sini.'} />
    {:else}
      <ul>
        {#each items as n (n.id)}
          <li>
            <button class="n" class:unread={!n.isRead} onclick={() => open(n)}>
              <span class="ic {n.type.replace('BOOKING_', '').toLowerCase()}"><Icon name={icons[n.type] ?? 'bell'} size={17} /></span>
              <span class="grow"><span class="t">{n.title}</span><span class="m">{n.message}</span><span class="w">{fmtRelative(n.createdAt)}</span></span>
              {#if !n.isRead}<i class="pt" aria-label="Belum dibaca"></i>{/if}
            </button>
          </li>
        {/each}
      </ul>
      <Pagination {page} {totalPages} {total} {pageSize} onchange={(p) => { page = p; load(); }} />
    {/if}
  </section>
</div>

<BookingDetailModal bookingId={detailId} onclose={() => (detailId = null)} onchanged={() => { load(); refreshBadges(); }} />

<style>
  ul { list-style: none; margin: 0; padding: 0; }
  .n { display: flex; gap: 14px; align-items: flex-start; width: 100%; padding: 16px 20px; text-align: left; border: 0; border-bottom: 1px solid var(--line-2); background: #fff; transition: background .15s; }
  .n:hover { background: #fcfbf8; } .n.unread { background: #fffaf0; }
  .ic { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0; background: var(--gold-tint); color: var(--gold-deep); }
  .ic.approved { background: var(--ok-bg); color: var(--ok); } .ic.rejected { background: var(--bad-bg); color: var(--bad); } .ic.cancelled { background: var(--mute-bg); color: var(--mute); } .ic.reminder { background: #e6edf8; color: #3a5a8c; }
  .grow { display: grid; gap: 3px; } .t { font-size: 13.5px; font-weight: 600; color: var(--navy); } .m { font-size: 13px; font-weight: 400; color: var(--ink-2); line-height: 1.5; } .w { font-size: 11.5px; font-weight: 400; color: var(--ink-3); }
  .pt { width: 9px; height: 9px; margin-top: 6px; border-radius: 50%; background: var(--gold); flex-shrink: 0; }
</style>
