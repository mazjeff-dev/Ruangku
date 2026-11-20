<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../../lib/components/Icon.svelte';
  import StatusBadge from '../../../lib/components/StatusBadge.svelte';
  import EmptyState from '../../../lib/components/EmptyState.svelte';
  import ErrorState from '../../../lib/components/ErrorState.svelte';
  import { apiRequest, assetUrl } from '../../../lib/api';
  import { app, handleApiError, refreshBadges } from '../../../lib/stores/app.svelte';
  import { fmtDate, fmtTime } from '../../../lib/utils';

  let bookings = $state<any[]>([]);
  let rooms = $state<any[]>([]);
  let summary = $state<Record<string, number>>({});
  let unread = $state(0);
  let quota = $state<any>(null);
  let quotaError = $state('');
  let loading = $state(true);
  let error = $state('');

  async function load() {
    loading = true;
    error = '';
    try {
      const [bookingResult, roomResult, notificationResult, quotaResult] = await Promise.all([
        apiRequest('/bookings?page=1&pageSize=5'),
        apiRequest('/rooms?sort=popular&pageSize=4'),
        apiRequest('/notifications/unread-count'),
        apiRequest('/bookings/quota').catch((e) => {
          quotaError = handleApiError(e, 'Gagal memuat kuota peminjaman', true);
          return null;
        })
      ]);
      bookings = bookingResult.data;
      summary = bookingResult.summary;
      rooms = roomResult.data;
      unread = notificationResult.data.count;
      quota = quotaResult?.data ?? null;
      if (quotaResult) quotaError = '';
      refreshBadges();
    } catch (e) {
      error = handleApiError(e, 'Gagal memuat dashboard mahasiswa', true);
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

<svelte:head><title>Dashboard Mahasiswa — RuangKu</title></svelte:head>

<div class="page">
  <section class="welcome card">
    <div class="welcome-copy">
      <div class="kicker">RuangKu Mahasiswa</div>
      <h1>Halo, {app.user?.name?.split(' ')[0] ?? 'Mahasiswa'}.</h1>
      <p>Temukan ruang yang tepat dan pantau peminjaman kampusmu.</p>
    </div>
    <a class="btn btn-gold welcome-action" href="/student/rooms"><Icon name="search" size={16} /> Cari ruangan</a>
  </section>

  {#if error}<section class="card"><ErrorState message={error} onretry={load} /></section>{/if}

  <section class="stats">
    <a class="stat card" href="/student/bookings"><span class="stat-icon"><Icon name="bookings" /></span><span><small>Total peminjaman</small><b>{loading ? '—' : summary.total ?? 0}</b></span></a>
    <a class="stat card" href="/student/bookings?status=PENDING"><span class="stat-icon wait"><Icon name="clock" /></span><span><small>Menunggu keputusan</small><b>{loading ? '—' : summary.PENDING ?? 0}</b></span></a>
    <a class="stat card" href="/student/bookings?status=APPROVED"><span class="stat-icon ok"><Icon name="check" /></span><span><small>Disetujui</small><b>{loading ? '—' : summary.APPROVED ?? 0}</b></span></a>
    <a class="stat card" href="/notifications"><span class="stat-icon note"><Icon name="bell" /></span><span><small>Notifikasi baru</small><b>{loading ? '—' : unread}</b></span></a>
  </section>
  <section class="card quota" aria-live="polite">
    <Icon name="bookings" size={20} />
    <div><b>Kuota peminjaman</b><p>{loading ? 'Memuat kuota…' : quota ? `${quota.activeBookings} dari ${quota.maxActiveBookings} peminjaman aktif · ${quota.activeQueueEntries} dari ${quota.maxQueueEntries} antrean aktif` : quotaError || 'Kuota belum dapat dimuat.'}</p></div>
  </section>

  <section class="card section">
    <div class="section-head"><div><h2 class="card-title">Peminjaman terbaru</h2><p class="card-sub">Status dan jadwal pengajuanmu.</p></div><a class="btn btn-ghost btn-sm" href="/student/bookings">Lihat semua</a></div>
    {#if loading}<div class="loading">Memuat peminjaman…</div>
    {:else if bookings.length === 0}<div class="empty-bookings"><EmptyState icon="bookings" title="Belum ada peminjaman" message="Cari ruangan dan ajukan jadwal yang kamu butuhkan."><a class="btn btn-primary" href="/student/rooms">Jelajahi ruangan</a></EmptyState></div>
    {:else}
      <div class="booking-list">
        {#each bookings as booking (booking.id)}
          <a class="booking" href="/student/bookings">
            <span class="room-mark"><Icon name="rooms" size={18} /></span>
            <span class="grow"><b>{booking.title}</b><small>{booking.room.name} · {fmtDate(booking.startTime)} · {fmtTime(booking.startTime)}–{fmtTime(booking.endTime)} WIB</small></span>
            <StatusBadge status={booking.status} />
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <section class="section">
    <div class="section-head"><div><h2 class="card-title">Ruangan populer</h2><p class="card-sub">Ruang kampus yang bisa kamu pesan.</p></div><a class="btn btn-ghost btn-sm" href="/student/rooms">Katalog lengkap</a></div>
    {#if loading}<div class="loading">Memuat katalog…</div>
    {:else if rooms.length === 0}<section class="card"><EmptyState icon="rooms" title="Belum ada ruangan tersedia" message="Silakan periksa kembali nanti." /></section>
    {:else}
      <div class="rooms">
        {#each rooms as room (room.id)}
          <article class="card room">
            {#if room.imageUrl}<img src={assetUrl(room.imageUrl) ?? ''} alt="Foto {room.name}" loading="lazy" />{:else}<div class="room-placeholder"><Icon name="rooms" size={26} /></div>{/if}
            <div class="room-body"><div class="row-between"><h3>{room.name}</h3><span class="badge gold">{room.capacity} orang</span></div><p>{room.location}</p><a href="/student/rooms" class="room-link">Lihat detail dan jadwal <Icon name="chevR" size={14} /></a></div>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .welcome { display:flex; align-items:center; justify-content:space-between; gap:28px; padding:32px 36px; background:linear-gradient(115deg,#fff 52%,#f7f0e2); }
  .welcome-copy { display:grid; gap:12px; }
  .welcome h1 { margin:0; font:700 clamp(36px,3.2vw,42px)/1.12 var(--font); letter-spacing:-1.3px; color:var(--navy); }
  .welcome p { color:var(--ink-2); font-size:15px; line-height:1.6; }
  .welcome-action { flex:none; }
  .stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
  .quota { display:flex; align-items:center; gap:14px; padding:16px 20px; color:var(--gold-deep); }
  .quota b { color:var(--navy); font-size:13px; } .quota p { margin:4px 0 0; color:var(--ink-2); font-size:12px; }
  .stat { display:flex; align-items:center; gap:13px; padding:17px; }
  .stat-icon,.room-mark { display:grid; place-items:center; width:42px; height:42px; flex:none; border-radius:13px; background:var(--gold-tint); color:var(--gold-deep); }
  .stat-icon.wait { background:var(--warn-bg); color:var(--warn); } .stat-icon.ok { background:var(--ok-bg); color:var(--ok); } .stat-icon.note { background:#e6edf8; color:#3a5a8c; }
  .stat small,.stat b { display:block; } .stat small { color:var(--ink-3); font-size:11px; } .stat b { margin-top:2px; color:var(--navy); font-size:22px; }
  .section { display:grid; gap:18px; }
  .section.card { padding:24px; }
  .section-head { display:flex; justify-content:space-between; align-items:center; gap:18px; }
  .section-head .card-title { font-size:22px; font-weight:700; letter-spacing:-.45px; color:var(--navy); }
  .section-head .card-sub { margin-top:6px; color:var(--ink-2); font-size:14px; line-height:1.5; }
  .empty-bookings { display:grid; place-items:center; min-height:280px; padding:20px; border:1px dashed var(--line); border-radius:14px; background:linear-gradient(135deg,#fff 40%,#fcfaf5); }
  .empty-bookings :global(.state) { width:min(100%,480px); gap:14px; padding:24px; }
  .empty-bookings :global(.state-icon) { width:64px; height:64px; border-radius:20px; }
  .empty-bookings :global(.state h3) { font-family:var(--font); font-size:18px; font-weight:700; letter-spacing:-.2px; color:var(--navy); }
  .empty-bookings :global(.state p) { max-width:380px; color:var(--ink-2); font-size:14px; line-height:1.65; }
  .booking-list { overflow:hidden; border:1px solid var(--line); border-radius:14px; background:#fff; }
  .booking { display:flex; align-items:center; gap:13px; padding:13px 16px; border-bottom:1px solid var(--line-2); } .booking:last-child { border-bottom:0; }
  .booking:hover { background:#fcfbf8; } .booking b,.booking small { display:block; } .booking b { color:var(--navy); font-size:13px; } .booking small { margin-top:3px; color:var(--ink-3); font-size:11.5px; }
  .rooms { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
  .room { overflow:hidden; } .room img,.room-placeholder { width:100%; height:130px; object-fit:cover; } .room-placeholder { display:grid; place-items:center; color:var(--gold-deep); background:linear-gradient(135deg,#f7f0e2,#e9e1d1); }
  .room-body { padding:16px; } .room-body h3 { font-size:16px; font-weight:700; color:var(--navy); } .room-body p { margin-top:6px; color:var(--ink-2); font-size:13px; }
  .room-link { display:inline-flex; align-items:center; gap:5px; margin-top:12px; color:var(--gold-deep); font-size:11.5px; font-weight:700; }
  .loading { display:grid; place-items:center; min-height:180px; padding:24px; color:var(--ink-3); text-align:center; font-size:14px; }
  .booking-list { width:100%; }
  @media(max-width:1050px) { .stats { grid-template-columns:repeat(2,minmax(0,1fr)); } .rooms { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media(max-width:700px) {
    .welcome { align-items:flex-start; flex-direction:column; gap:20px; padding:26px 24px; }
    .welcome-copy { gap:10px; }
    .welcome h1 { font-size:34px; }
    .welcome p { font-size:14px; }
    .section.card { padding:20px; gap:16px; }
    .section-head { align-items:flex-start; }
    .section-head .card-title { font-size:20px; }
    .section-head .card-sub { font-size:13px; }
    .empty-bookings { min-height:250px; padding:12px; }
  }
  @media(max-width:480px) {
    .welcome { padding:22px 18px; }
    .welcome h1 { font-size:32px; }
    .section.card { padding:16px; }
    .section-head { gap:10px; }
    .section-head :global(.btn) { height:32px; padding:0 10px; font-size:11px; }
    .empty-bookings { min-height:230px; padding:8px; }
    .empty-bookings :global(.state) { padding:18px 8px; }
    .stats { gap:9px; }
    .stat { padding:12px; gap:9px; }
    .stat-icon { width:36px; height:36px; }
    .rooms { grid-template-columns:1fr; }
    .booking { flex-wrap:wrap; }
  }
</style>
