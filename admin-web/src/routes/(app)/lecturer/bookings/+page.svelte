<script lang="ts">
  import { onMount } from 'svelte';
  import StatusBadge from '../../../../lib/components/StatusBadge.svelte';
  import Pagination from '../../../../lib/components/Pagination.svelte';
  import Skeleton from '../../../../lib/components/Skeleton.svelte';
  import EmptyState from '../../../../lib/components/EmptyState.svelte';
  import ErrorState from '../../../../lib/components/ErrorState.svelte';
  import BookingDetailModal from '../../../../lib/components/BookingDetailModal.svelte';
  import QueueCancelModal from '../../../../lib/components/QueueCancelModal.svelte';
  import { apiRequest, qs } from '../../../../lib/api';
  import { handleApiError, refreshBadges } from '../../../../lib/stores/app.svelte';
  import { fmtDate, fmtTime } from '../../../../lib/utils';

  let status = $state('PENDING');
  let view = $state<'bookings' | 'queue'>('bookings');
  let page = $state(1);
  const pageSize = 15;
  let rows = $state<any[]>([]);
  let total = $state(0);
  let totalPages = $state(1);
  let loading = $state(true);
  let error = $state('');
  let detailId = $state<number | null>(null);
  let queueCancelEntry = $state<any>(null);

  async function load() {
    loading = true;
    error = '';
    try {
      const endpoint = view === 'queue' ? '/lecturer/waitlist' : '/lecturer/bookings';
      const result = await apiRequest(`${endpoint}${qs({ status, page, pageSize })}`);
      rows = result.data;
      total = result.total;
      totalPages = result.totalPages;
    } catch (e) { error = handleApiError(e, 'Gagal memuat peminjaman', true); }
    finally { loading = false; }
  }
  onMount(load);
</script>

<svelte:head><title>Peminjaman Ruangan Tugas — RuangKu</title></svelte:head>

<div class="page">
  <div class="page-head"><div><div class="kicker">Pengelolaan</div><h1 class="page-title">Peminjaman ruangan tugas</h1><p class="page-desc">Tinjau pengajuan hanya pada ruangan yang ditugaskan kepada Anda.</p></div></div>
  <section class="card">
    <div class="view-tabs" role="tablist" aria-label="Jenis data peminjaman">
      <button class:active={view === 'bookings'} role="tab" aria-selected={view === 'bookings'} onclick={() => { view = 'bookings'; status = 'PENDING'; page = 1; load(); }}>Peminjaman</button>
      <button class:active={view === 'queue'} role="tab" aria-selected={view === 'queue'} onclick={() => { view = 'queue'; status = 'WAITING'; page = 1; load(); }}>Antrean</button>
    </div>
    <div class="filters">
      <select class="select" bind:value={status} onchange={() => { page = 1; load(); }} aria-label="Filter status">
        {#if view === 'queue'}
          <option value="">Semua status antrean</option><option value="WAITING">Menunggu</option><option value="PROMOTED">Diajukan</option><option value="CANCELLED">Dibatalkan</option>
        {:else}
          <option value="">Semua status</option><option value="PENDING">Menunggu</option><option value="APPROVED">Disetujui</option><option value="REJECTED">Ditolak</option><option value="CANCELLED">Dibatalkan</option><option value="COMPLETED">Selesai</option><option value="NO_SHOW">Tidak hadir</option>
        {/if}
      </select>
    </div>
    {#if loading && rows.length === 0}<Skeleton rows={7} height={26} />
    {:else if error}<ErrorState message={error} onretry={load} />
    {:else if rows.length === 0}<EmptyState icon="bookings" title={view === 'queue' ? 'Belum ada antrean' : 'Tidak ada peminjaman'} message={view === 'queue' ? 'Antrean untuk ruangan tugas Anda akan muncul di sini.' : 'Peminjaman pada ruangan tugas Anda akan muncul di sini.'} />
    {:else}
      <div class="table-wrap">
        <table class="table stack">
          <thead><tr><th>Pemohon</th><th>Kegiatan</th><th>Ruangan</th><th>Jadwal</th>{#if view === 'queue'}<th>Posisi</th>{/if}<th>Status</th><th></th></tr></thead>
          <tbody>
            {#each rows as booking (booking.id)}
              {@const person = view === 'queue' ? booking.user : booking.student}
              <tr>
                <td data-label="Pemohon"><div class="cell-main">{person.name}</div><div class="cell-sub">{person.nim ?? person.email}</div></td>
                <td data-label="Kegiatan" class="cell-main">{booking.title}</td>
                <td data-label="Ruangan"><div class="cell-main">{booking.room.name}</div><div class="cell-sub">{booking.room.code}</div></td>
                <td data-label="Jadwal"><div class="cell-main">{fmtDate(booking.startTime)}</div><div class="cell-sub">{fmtTime(booking.startTime)}–{fmtTime(booking.endTime)} WIB · {booking.attendees ?? '—'} peserta</div></td>
                {#if view === 'queue'}<td data-label="Posisi">{booking.status === 'WAITING' ? `#${booking.position ?? '—'}` : '—'}</td>{/if}
                <td data-label="Status">{#if view === 'bookings'}<StatusBadge status={booking.status} />{:else}<span class="queue-status">{booking.status === 'WAITING' ? 'Menunggu' : booking.status === 'PROMOTED' ? 'Diajukan' : 'Dibatalkan'}</span>{/if}</td>
                {#if view === 'bookings'}<td class="no-label"><button class="btn btn-ghost btn-sm" onclick={() => (detailId = booking.id)}>Detail / tinjau</button></td>
                {:else}<td class="no-label">{#if booking.status === 'WAITING'}<button class="btn btn-ghost btn-sm" onclick={() => (queueCancelEntry = booking)}>Batalkan</button>{/if}</td>{/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <Pagination {page} {totalPages} {total} {pageSize} onchange={(next) => { page = next; load(); }} />
    {/if}
  </section>
</div>

<BookingDetailModal bookingId={detailId} onclose={() => (detailId = null)} onchanged={() => { load(); refreshBadges(); }} />
<QueueCancelModal entry={queueCancelEntry} endpoint="/lecturer/waitlist" onclose={() => (queueCancelEntry = null)} onchanged={() => { load(); refreshBadges(); }} />

<style>
  .view-tabs { display:flex; gap:8px; padding:14px 18px 0; }
  .view-tabs button { border:1px solid var(--line-2); border-radius:8px; padding:8px 14px; color:var(--ink-2); background:#fff; font:inherit; cursor:pointer; }
  .view-tabs button.active { border-color:var(--gold); color:var(--navy); background:var(--gold-tint); font-weight:700; }
  .queue-status { display:inline-block; border-radius:20px; padding:4px 9px; color:var(--navy); background:var(--gold-tint); font-size:11px; font-weight:700; }
  .filters { display:flex; padding:16px 18px; border-bottom:1px solid var(--line-2); }
  .select { min-width:200px; }
</style>
