<script lang="ts">
  import { onMount } from 'svelte';
  import StatusBadge from '../../../lib/components/StatusBadge.svelte';
  import Pagination from '../../../lib/components/Pagination.svelte';
  import Skeleton from '../../../lib/components/Skeleton.svelte';
  import EmptyState from '../../../lib/components/EmptyState.svelte';
  import ErrorState from '../../../lib/components/ErrorState.svelte';
  import BookingDetailModal from '../../../lib/components/BookingDetailModal.svelte';
  import QueueCancelModal from '../../../lib/components/QueueCancelModal.svelte';
  import Icon from '../../../lib/components/Icon.svelte';
  import { apiRequest, qs } from '../../../lib/api';
  import { handleApiError, refreshBadges } from '../../../lib/stores/app.svelte';
  import { debounce, fmtDate, fmtTime, initials } from '../../../lib/utils';

  let q = $state('');
  let status = $state('');
  let roomId = $state('');
  let from = $state('');
  let to = $state('');
  let view = $state<'bookings' | 'queue'>('bookings');
  let page = $state(1);
  const pageSize = 15;

  let rows = $state<any[]>([]);
  let rooms = $state<any[]>([]);
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
      const endpoint = view === 'queue' ? '/admin/waitlist' : '/admin/bookings';
      const r = await apiRequest(`${endpoint}${qs({ q: q.trim(), status, roomId, from, to, page, pageSize })}`);
      rows = r.data;
      total = r.total;
      totalPages = r.totalPages;
    } catch (e) {
      error = handleApiError(e, 'Gagal memuat peminjaman', true);
    } finally {
      loading = false;
    }
  }

  const search = debounce(() => { page = 1; load(); });
  function filterChanged() { page = 1; load(); }
  function reset() { q = ''; status = ''; roomId = ''; from = ''; to = ''; page = 1; load(); }
  function changed() { load(); refreshBadges(); }
  const filtered = $derived(!!(q || status || roomId || from || to));

  onMount(async () => {
    load();
    try { rooms = (await apiRequest('/admin/rooms')).data; } catch { /* filter ruangan opsional */ }
  });
</script>

<svelte:head><title>Peminjaman — RuangKu Admin</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <div class="kicker">Pengelolaan</div>
      <h1 class="page-title">Peminjaman ruangan</h1>
      <p class="page-desc">Tinjau, setujui, tolak, atau batalkan pengajuan peminjaman mahasiswa.</p>
    </div>
  </div>

  <section class="card">
    <div class="view-tabs" role="tablist" aria-label="Jenis data peminjaman">
      <button class:active={view === 'bookings'} role="tab" aria-selected={view === 'bookings'} onclick={() => { view = 'bookings'; status = ''; rows = []; filterChanged(); }}>Peminjaman</button>
      <button class:active={view === 'queue'} role="tab" aria-selected={view === 'queue'} onclick={() => { view = 'queue'; status = 'WAITING'; rows = []; filterChanged(); }}>Antrean</button>
    </div>
    <div class="filters">
      <input class="input input-search" placeholder="Cari judul, mahasiswa, NIM, atau ruangan…" bind:value={q} oninput={search} aria-label="Cari peminjaman atau antrean" />
      <select class="select" bind:value={status} onchange={filterChanged} aria-label="Filter status">
        {#if view === 'queue'}
          <option value="">Semua status antrean</option><option value="WAITING">Menunggu</option><option value="PROMOTED">Diajukan</option><option value="CANCELLED">Dibatalkan</option>
        {:else}
          <option value="">Semua status</option>
          <option value="PENDING">Menunggu</option><option value="APPROVED">Disetujui</option><option value="REJECTED">Ditolak</option>
          <option value="CANCELLED">Dibatalkan</option><option value="COMPLETED">Selesai</option><option value="NO_SHOW">Tidak hadir</option>
        {/if}
      </select>
      <select class="select" bind:value={roomId} onchange={filterChanged} aria-label="Filter ruangan">
        <option value="">Semua ruangan</option>
        {#each rooms as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
      </select>
      <input type="date" class="input" bind:value={from} onchange={filterChanged} aria-label="Dari tanggal" />
      <input type="date" class="input" bind:value={to} onchange={filterChanged} aria-label="Sampai tanggal" />
      {#if filtered}<button class="btn btn-ghost" onclick={reset}><Icon name="x" size={14} /> Reset</button>{/if}
    </div>

    {#if loading && rows.length === 0}
      <Skeleton rows={8} height={22} />
    {:else if error}
      <ErrorState message={error} onretry={load} />
    {:else if rows.length === 0}
      <EmptyState icon="bookings" title={filtered ? 'Tidak ada hasil' : view === 'queue' ? 'Belum ada antrean' : 'Belum ada peminjaman'} message={filtered ? 'Coba ubah atau reset filter pencarian.' : view === 'queue' ? 'Antrean mahasiswa untuk ruangan akan muncul di sini.' : 'Pengajuan dari mahasiswa akan muncul di sini.'} />
    {:else}
      <div class="table-wrap" class:dim={loading}>
        <table class="table stack">
          <thead><tr><th>Pemohon</th><th>Kegiatan</th><th>Ruangan</th><th>Jadwal</th>{#if view === 'queue'}<th>Posisi</th>{/if}<th>Status</th><th></th></tr></thead>
          <tbody>
            {#each rows as b (b.id)}
              {@const person = (view === 'queue' ? b.user : b.student) ?? b.user ?? b.student ?? { name: '—', email: '' }}
              <tr class:clickable={view === 'bookings'} onclick={() => { if (view === 'bookings') detailId = b.id; }}>
                <td data-label="Pemohon">
                  <div class="row"><span class="avatar">{initials(person.name)}</span>
                    <div><div class="cell-main">{person.name}</div><div class="cell-sub">{person.nim ?? person.email}</div></div></div>
                </td>
                <td data-label="Kegiatan"><div class="cell-main trunc">{b.title}</div></td>
                <td data-label="Ruangan"><div class="cell-main">{b.room.name}</div><div class="cell-sub">{b.room.code}</div></td>
                <td data-label="Jadwal"><div class="cell-main">{fmtDate(b.startTime)}</div><div class="cell-sub">{fmtTime(b.startTime)}–{fmtTime(b.endTime)} WIB · {b.attendees ?? '—'} peserta</div></td>
                {#if view === 'queue'}<td data-label="Posisi">{b.status === 'WAITING' ? `#${b.position ?? '—'}` : '—'}</td>{/if}
                <td data-label="Status">{#if view === 'bookings'}<StatusBadge status={b.status} />{:else}<span class="queue-status">{b.status === 'WAITING' ? 'Menunggu' : b.status === 'PROMOTED' ? 'Diajukan' : 'Dibatalkan'}</span>{/if}</td>
                {#if view === 'bookings'}<td class="no-label"><button class="btn btn-ghost btn-sm" onclick={(e) => { e.stopPropagation(); detailId = b.id; }}><Icon name="eye" size={14} /> Detail</button></td>
                {:else}<td class="no-label">{#if b.status === 'WAITING'}<button class="btn btn-ghost btn-sm" onclick={(e) => { e.stopPropagation(); queueCancelEntry = b; }}>Batalkan</button>{/if}</td>{/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <Pagination {page} {totalPages} {total} {pageSize} onchange={(p) => { page = p; load(); }} />
    {/if}
  </section>
</div>

<BookingDetailModal bookingId={detailId} onclose={() => (detailId = null)} onchanged={changed} />
<QueueCancelModal entry={queueCancelEntry} endpoint="/admin/waitlist" onclose={() => (queueCancelEntry = null)} onchanged={changed} />

<style>
  .view-tabs { display:flex; gap:8px; padding:14px 18px 0; }
  .view-tabs button { border:1px solid var(--line-2); border-radius:8px; padding:8px 14px; color:var(--ink-2); background:#fff; font:inherit; cursor:pointer; }
  .view-tabs button.active { border-color:var(--gold); color:var(--navy); background:var(--gold-tint); font-weight:700; }
  .queue-status { display:inline-block; border-radius:20px; padding:4px 9px; color:var(--navy); background:var(--gold-tint); font-size:11px; font-weight:700; }
  .filters { display: grid; grid-template-columns: minmax(220px, 2fr) repeat(4, minmax(130px, 1fr)) auto; gap: 10px; padding: 16px 18px; border-bottom: 1px solid var(--line-2); }
  .dim { opacity: .55; transition: opacity .2s; }
  .trunc { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 1100px) { .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } .filters :first-child { grid-column: 1 / -1; } }
  @media (max-width: 720px) { .trunc { max-width: none; white-space: normal; } }
</style>
