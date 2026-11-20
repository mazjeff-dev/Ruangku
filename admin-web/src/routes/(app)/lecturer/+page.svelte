<script lang="ts">
  import { onMount } from 'svelte';
  import StatCard from '../../../lib/components/StatCard.svelte';
  import StatusBadge from '../../../lib/components/StatusBadge.svelte';
  import EmptyState from '../../../lib/components/EmptyState.svelte';
  import ErrorState from '../../../lib/components/ErrorState.svelte';
  import BookingDetailModal from '../../../lib/components/BookingDetailModal.svelte';
  import { apiRequest } from '../../../lib/api';
  import { handleApiError, refreshBadges } from '../../../lib/stores/app.svelte';
  import { fmtDate, fmtTime } from '../../../lib/utils';

  let data = $state<any>(null);
  let quota = $state<any>(null);
  let quotaError = $state('');
  let loading = $state(true);
  let error = $state('');
  let detailId = $state<number | null>(null);

  async function load() {
    loading = true;
    error = '';
    try {
      const [dashboard, quotaResult] = await Promise.all([
        apiRequest('/lecturer/dashboard'),
        apiRequest('/bookings/quota').catch((e) => {
          quotaError = handleApiError(e, 'Gagal memuat kuota peminjaman', true);
          return null;
        })
      ]);
      data = dashboard.data;
      quota = quotaResult?.data ?? null;
      if (quotaResult) quotaError = '';
    }
    catch (e) { error = handleApiError(e, 'Gagal memuat dashboard dosen', true); }
    finally { loading = false; }
  }

  onMount(() => { load(); refreshBadges(); });
</script>

<svelte:head><title>Dashboard Dosen — RuangKu</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div><div class="kicker">RuangKu Dosen</div><h1 class="page-title">Dashboard</h1><p class="page-desc">Pantau peminjaman pada ruangan yang ditugaskan kepada Anda.</p></div>
  </div>
  {#if error && !data}
    <section class="card"><ErrorState message={error} onretry={load} /></section>
  {:else}
    <section class="card quota" aria-live="polite">
      <div><b>Kuota peminjaman</b><p>{loading ? 'Memuat kuota…' : quota ? `${quota.activeBookings} dari ${quota.maxActiveBookings} peminjaman aktif · ${quota.activeQueueEntries} dari ${quota.maxQueueEntries} antrean aktif` : quotaError || 'Kuota belum dapat dimuat.'}</p></div>
    </section>
    <div class="stats">
      <StatCard {loading} label="Ruangan Tugas" value={data?.rooms ?? 0} icon="rooms" tone="gold" />
      <StatCard {loading} label="Menunggu Persetujuan" value={data?.bookings.PENDING ?? 0} icon="bookings" tone="warn" />
      <StatCard {loading} label="Disetujui / Selesai" value={(data?.bookings.APPROVED ?? 0) + (data?.bookings.COMPLETED ?? 0)} icon="check" tone="ok" />
      <StatCard {loading} label="Total Peminjaman" value={Object.values(data?.bookings ?? {}).reduce((sum: number, count: any) => sum + count, 0)} icon="reports" tone="navy" />
    </div>
    <div class="cols">
      <section class="card">
        <div class="card-head"><div><h2 class="card-title">Perlu ditinjau</h2><p class="card-sub">Pengajuan mahasiswa untuk ruangan tugas Anda.</p></div><a class="btn btn-ghost btn-sm" href="/lecturer/bookings">Semua pengajuan</a></div>
        {#if loading}<div class="pad">Memuat pengajuan…</div>
        {:else if data.pending.length === 0}<EmptyState icon="check" title="Tidak ada pengajuan tertunda" message="Pengajuan baru pada ruangan tugas Anda akan tampil di sini." />
        {:else}
          <div class="rows">
            {#each data.pending as booking (booking.id)}
              <button class="row" onclick={() => (detailId = booking.id)}>
                <span class="grow"><b>{booking.title}</b><small>{booking.student.name} · {booking.room.name}</small><small>{fmtDate(booking.startTime)} · {fmtTime(booking.startTime)}–{fmtTime(booking.endTime)} WIB</small></span>
                <StatusBadge status={booking.status} />
              </button>
            {/each}
          </div>
        {/if}
      </section>
      <section class="card">
        <div class="card-head"><div><h2 class="card-title">Jadwal mendatang</h2><p class="card-sub">Peminjaman yang telah disetujui.</p></div></div>
        {#if loading}<div class="pad">Memuat jadwal…</div>
        {:else if data.upcoming.length === 0}<EmptyState icon="schedule" title="Belum ada jadwal mendatang" message="Peminjaman yang disetujui akan muncul di sini." />
        {:else}
          <div class="rows">
            {#each data.upcoming as booking (booking.id)}
              <button class="row" onclick={() => (detailId = booking.id)}>
                <span class="grow"><b>{booking.title}</b><small>{booking.room.name} · {booking.student.name}</small><small>{fmtDate(booking.startTime)} · {fmtTime(booking.startTime)}–{fmtTime(booking.endTime)} WIB</small></span>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  {/if}
</div>

<BookingDetailModal bookingId={detailId} onclose={() => (detailId = null)} onchanged={() => { load(); refreshBadges(); }} />

<style>
  .cols { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
  .quota { margin-bottom:16px; padding:16px 20px; } .quota b { color:var(--navy); font-size:13px; } .quota p { margin:4px 0 0; color:var(--ink-2); font-size:12px; }
  .rows { display:grid; }
  .row { display:flex; align-items:center; gap:12px; width:100%; padding:16px 18px; border:0; border-top:1px solid var(--line-2); background:#fff; text-align:left; }
  .row:hover { background:#fcfbf8; }
  .grow { display:grid; gap:4px; min-width:0; flex:1; }
  .grow b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--navy); font-size:13px; }
  .grow small,.pad { color:var(--ink-2); font-size:12px; }
  .pad { padding:20px; }
  @media(max-width:900px) { .cols { grid-template-columns:1fr; } }
</style>
