<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Icon from '../../../../lib/components/Icon.svelte';
  import StatusBadge from '../../../../lib/components/StatusBadge.svelte';
  import EmptyState from '../../../../lib/components/EmptyState.svelte';
  import ErrorState from '../../../../lib/components/ErrorState.svelte';
  import Pagination from '../../../../lib/components/Pagination.svelte';
  import BookingDetailModal from '../../../../lib/components/BookingDetailModal.svelte';
  import { apiRequest, downloadFile, qs } from '../../../../lib/api';
  import { handleApiError, refreshBadges } from '../../../../lib/stores/app.svelte';
  import { confirmDialog } from '../../../../lib/stores/confirm.svelte';
  import { fmtDate, fmtTime } from '../../../../lib/utils';

  const statuses = [
    ['', 'Semua status'],
    ['PENDING', 'Menunggu'],
    ['APPROVED', 'Disetujui'],
    ['REJECTED', 'Ditolak'],
    ['CANCELLED', 'Dibatalkan'],
    ['COMPLETED', 'Selesai']
  ];
  let items = $state<any[]>([]);
  let summary = $state<Record<string, number>>({});
  let status = $state(page.url.searchParams.get('status') ?? '');
  let pageNumber = $state(1);
  let total = $state(0);
  let totalPages = $state(1);
  let loading = $state(true);
  let error = $state('');
  let detailId = $state<number | null>(null);
  let view = $state<'bookings' | 'queue'>('bookings');
  let queueItems = $state<any[]>([]);
  let queueLoading = $state(false);
  let queueError = $state('');

  async function load() {
    loading = true;
    error = '';
    try {
      const result = await apiRequest(`/bookings${qs({ status, page: pageNumber, pageSize: 20 })}`);
      items = result.data;
      summary = result.summary;
      total = result.total;
      totalPages = result.totalPages;
    } catch (e) {
      error = handleApiError(e, 'Gagal memuat peminjaman', true);
    } finally {
      loading = false;
    }
  }

  function onChanged() {
    load();
    refreshBadges();
  }

  async function loadQueue() {
    queueLoading = true;
    queueError = '';
    try { queueItems = (await apiRequest('/bookings/waitlist')).data; }
    catch (e) { queueError = handleApiError(e, 'Gagal memuat antrean', true); }
    finally { queueLoading = false; }
  }

  async function cancelQueueEntry(entry: any) {
    if (!await confirmDialog({
      title: 'Keluar dari antrean?',
      message: `Antrean ${entry.room.name} untuk "${entry.title}" akan dibatalkan.`,
      confirmLabel: 'Batalkan antrean',
      tone: 'danger'
    })) return;
    try {
      await apiRequest(`/bookings/waitlist/${entry.id}`, { method: 'DELETE' });
      await loadQueue();
      refreshBadges();
    } catch (e) { queueError = handleApiError(e, 'Gagal membatalkan antrean', true); }
  }

  onMount(load);

  let exportingHistory = $state(false);
  async function exportHistory() {
    exportingHistory = true;
    try { await downloadFile('/bookings/my/export', 'riwayat-peminjaman.csv'); }
    catch (e) { handleApiError(e, 'Gagal mengunduh riwayat', true); }
    finally { exportingHistory = false; }
  }
</script>

<svelte:head><title>Peminjaman Saya — RuangKu</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div><div class="kicker">Aktivitas akun</div><h1 class="page-title">Peminjaman saya</h1><p class="page-desc">Pantau status pengajuan dan batalkan peminjaman yang belum dimulai.</p></div>
    <div class="head-actions">
      <button class="btn btn-ghost" onclick={exportHistory} disabled={exportingHistory}>{#if exportingHistory}<span class="spinner"></span>{:else}<Icon name="download" size={16} />{/if} Unduh riwayat (CSV)</button>
      <a class="btn btn-primary" href="/student/rooms"><Icon name="plus" size={16} /> Booking ruangan</a>
    </div>
  </div>

  <section class="summary">
    {#each [['PENDING','Menunggu'],['APPROVED','Disetujui'],['REJECTED','Ditolak']] as [key,label]}
      <button class="summary-card card" class:selected={status === key} onclick={() => { status = status === key ? '' : key; pageNumber = 1; load(); }}>
        <span>{label}</span><b>{summary[key] ?? 0}</b>
      </button>
    {/each}
  </section>

  <section class="card">
    <div class="view-tabs" role="tablist" aria-label="Peminjaman dan antrean">
      <button class:active={view === 'bookings'} role="tab" aria-selected={view === 'bookings'} onclick={() => { view = 'bookings'; }}>Peminjaman</button>
      <button class:active={view === 'queue'} role="tab" aria-selected={view === 'queue'} onclick={() => { view = 'queue'; loadQueue(); }}>Antrean saya</button>
    </div>
    {#if view === 'bookings'}
    <div class="toolbar"><div class="kicker">Riwayat pemesanan</div><select class="select filter" bind:value={status} onchange={() => { pageNumber = 1; load(); }} aria-label="Filter status">
      {#each statuses as [key,label]}<option value={key}>{label}</option>{/each}
    </select></div>
    {#if loading}<div class="loading">Memuat peminjaman…</div>
    {:else if error}<ErrorState message={error} onretry={load} />
    {:else if items.length === 0}<EmptyState icon="bookings" title="Belum ada peminjaman" message="Booking yang kamu ajukan akan tampil di sini."><a class="btn btn-primary btn-sm" href="/student/rooms">Cari ruangan</a></EmptyState>
    {:else}
      <div class="list">
        {#each items as item (item.id)}
          <button class="booking" onclick={() => (detailId = item.id)}>
            <span class="icon"><Icon name="rooms" size={19} /></span>
            <span class="info"><b>{item.title}</b><small>{item.room.name} · {item.room.location}</small><small>{fmtDate(item.startTime)} · {fmtTime(item.startTime)}–{fmtTime(item.endTime)} WIB · {item.attendees ?? '—'} peserta</small></span>
            <span class="end"><StatusBadge status={item.status} /><Icon name="chevR" size={16} /></span>
          </button>
        {/each}
      </div>
      <Pagination page={pageNumber} {totalPages} {total} pageSize={20} onchange={(next) => { pageNumber = next; load(); }} />
    {/if}
    {:else}
      {#if queueLoading}<div class="loading">Memuat antrean…</div>
      {:else if queueError}<ErrorState message={queueError} onretry={loadQueue} />
      {:else if queueItems.length === 0}<EmptyState icon="bookings" title="Belum ada antrean" message="Jika jadwal ruangan penuh, antrean yang Anda ikuti akan tampil di sini." />
      {:else}
        <div class="list">
          {#each queueItems as item (item.id)}
            <article class="booking queue-item">
              <span class="icon"><Icon name="rooms" size={19} /></span>
              <span class="info"><b>{item.title}</b><small>{item.room.name} · {item.room.location}</small><small>{fmtDate(item.startTime)} · {fmtTime(item.startTime)}–{fmtTime(item.endTime)} WIB · {item.attendees ?? '—'} peserta</small></span>
              <span class="queue-state">{item.status === 'WAITING' ? `Antrean #${item.position ?? '—'}` : item.status === 'PROMOTED' ? 'Sudah diajukan' : 'Dibatalkan'}</span>
              {#if item.status === 'WAITING'}<button class="btn btn-ghost btn-sm" onclick={() => cancelQueueEntry(item)}>Keluar</button>{/if}
            </article>
          {/each}
        </div>
      {/if}
    {/if}
  </section>
</div>

<BookingDetailModal bookingId={detailId} onclose={() => (detailId = null)} onchanged={onChanged} />

<style>
  .head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
  .summary-card { display:flex; align-items:center; justify-content:space-between; padding:15px 18px; text-align:left; color:var(--ink-2); }
  .summary-card b { color:var(--navy); font-size:20px; } .summary-card.selected { border-color:var(--gold); background:var(--gold-tint); }
  .toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 18px; border-bottom:1px solid var(--line-2); }
  .filter { width:min(220px,55%); }
  .list { display:grid; }
  .booking { display:flex; align-items:center; gap:13px; width:100%; padding:16px 18px; border:0; border-bottom:1px solid var(--line-2); background:#fff; text-align:left; }
  .booking:hover { background:#fcfbf8; } .icon { display:grid; place-items:center; width:42px; height:42px; flex:none; border-radius:13px; color:var(--gold-deep); background:var(--gold-tint); }
  .info { display:grid; gap:3px; flex:1; min-width:0; } .info b { color:var(--navy); font-size:13px; } .info small { color:var(--ink-3); font-size:11.5px; }
  .end { display:flex; align-items:center; gap:12px; color:var(--ink-3); }
  .loading { padding:24px; text-align:center; color:var(--ink-3); }
  .view-tabs { display:flex; gap:8px; padding:14px 18px 0; }
  .view-tabs button { border:1px solid var(--line-2); border-radius:8px; padding:8px 14px; color:var(--ink-2); background:#fff; font:inherit; cursor:pointer; }
  .view-tabs button.active { border-color:var(--gold); color:var(--navy); background:var(--gold-tint); font-weight:700; }
  .queue-item { flex-wrap:wrap; }
  .queue-state { color:var(--gold-deep); font-size:12px; font-weight:700; }
  @media(max-width:620px) { .summary { gap:7px; } .summary-card { align-items:flex-start; flex-direction:column; padding:11px; font-size:11px; } .booking { align-items:flex-start; } .end { align-items:flex-end; flex-direction:column; gap:5px; } }
</style>
