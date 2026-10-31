<script lang="ts">
  import { onMount } from 'svelte';
  import StatCard from '../../lib/components/StatCard.svelte';
  import BarChart from '../../lib/components/BarChart.svelte';
  import ErrorState from '../../lib/components/ErrorState.svelte';
  import EmptyState from '../../lib/components/EmptyState.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import BookingDetailModal from '../../lib/components/BookingDetailModal.svelte';
  import { apiRequest, qs } from '../../lib/api';
  import { app, handleApiError, refreshBadges } from '../../lib/stores/app.svelte';
  import { addDays, fmtDate, fmtRange, fmtRelative, initials, monthEnd, monthStart, startOfWeek, todayKey, fmtTime } from '../../lib/utils';

  type Preset = 'week' | 'month' | '30d' | 'custom';

  let preset = $state<Preset>('month');
  let from = $state(monthStart(todayKey()));
  let to = $state(monthEnd(todayKey()));
  let status = $state('');

  let data = $state<any>(null);
  let pending = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let detailId = $state<number | null>(null);

  function applyPreset(p: Preset) {
    preset = p;
    const today = todayKey();
    if (p === 'week') { from = startOfWeek(today); to = addDays(from, 6); }
    else if (p === 'month') { from = monthStart(today); to = monthEnd(today); }
    else if (p === '30d') { from = addDays(today, -29); to = today; }
    if (p !== 'custom') load();
  }

  async function load() {
    if (from && to && to < from) {
      error = 'Tanggal akhir harus sama atau setelah tanggal awal.';
      return;
    }
    loading = true;
    error = '';
    try {
      const [dash, pend] = await Promise.all([
        apiRequest(`/admin/dashboard${qs({ from, to, status })}`),
        apiRequest(`/admin/bookings${qs({ status: 'PENDING', pageSize: 5 })}`)
      ]);
      data = dash.data;
      pending = pend.data;
    } catch (e) {
      error = handleApiError(e, 'Gagal memuat dashboard', true);
    } finally {
      loading = false;
    }
  }

  function changed() {
    load();
    refreshBadges();
  }

  const verbs: Record<string, string> = { CREATED: 'mengajukan', APPROVED: 'menyetujui', REJECTED: 'menolak', CANCELLED: 'membatalkan' };
  const firstName = $derived((app.user?.name ?? 'Admin').split(' ')[0]);
  const hasChartData = $derived(data?.chart.points.some((p: any) => p.total > 0));

  onMount(load);
</script>

<svelte:head><title>Dashboard — RuangKu Admin</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <div class="kicker">Administrator workspace</div>
      <h1 class="page-title">Selamat datang kembali, {firstName}.</h1>
      <p class="page-desc">Pantau aktivitas peminjaman ruang kampus secara real-time dari database RuangKu.</p>
    </div>
    <button class="btn btn-ghost" onclick={load} disabled={loading}>
      {#if loading}<span class="spinner"></span>{:else}<Icon name="refresh" size={15} />{/if} Muat ulang
    </button>
  </div>

  <section class="card filters">
    <div class="chips" role="group" aria-label="Rentang cepat">
      {#each [['week', 'Minggu ini'], ['month', 'Bulan ini'], ['30d', '30 hari terakhir']] as [key, label]}
        <button class="chip" class:on={preset === key} onclick={() => applyPreset(key as Preset)}>{label}</button>
      {/each}
    </div>
    <div class="fields">
      <div class="field"><label for="f-from">Dari</label><input id="f-from" type="date" class="input" bind:value={from} onchange={() => { preset = 'custom'; load(); }} /></div>
      <div class="field"><label for="f-to">Sampai</label><input id="f-to" type="date" class="input" bind:value={to} onchange={() => { preset = 'custom'; load(); }} /></div>
      <div class="field">
        <label for="f-status">Status</label>
        <select id="f-status" class="select" bind:value={status} onchange={load}>
          <option value="">Semua status</option>
          <option value="PENDING">Menunggu</option><option value="APPROVED">Disetujui</option>
          <option value="REJECTED">Ditolak</option><option value="CANCELLED">Dibatalkan</option><option value="COMPLETED">Selesai</option>
        </select>
      </div>
    </div>
  </section>

  {#if error && !data}
    <div class="card"><ErrorState message={error} onretry={load} /></div>
  {:else}
    {#if error}<div class="card inline-err" role="alert">{error}</div>{/if}

    <div class="stats">
      <StatCard loading={loading && !data} label="Total Ruangan" value={data?.rooms.total ?? 0} note="{data?.rooms.active ?? 0} aktif · {data?.rooms.inactive ?? 0} nonaktif" icon="rooms" tone="navy" />
      <StatCard loading={loading && !data} label="Ruangan Tersedia" value={data?.rooms.available ?? 0} note="{data?.rooms.inUseNow ?? 0} sedang dipakai sekarang" icon="check" tone="ok" />
      <StatCard loading={loading && !data} label="Tidak Tersedia" value={data?.rooms.unavailable ?? 0} note="Nonaktif / ditutup sementara" icon="x" tone="mute" />
      <StatCard loading={loading && !data} label="Total Peminjaman" value={data?.bookings.total ?? 0} note="{fmtDate(from)} – {fmtDate(to)}" icon="bookings" tone="gold" />
      <StatCard loading={loading && !data} label="Menunggu Persetujuan" value={data?.bookings.pending ?? 0} note="Perlu ditinjau admin" icon="clock" tone="warn" />
      <StatCard loading={loading && !data} label="Disetujui" value={data?.bookings.approved ?? 0} note="{data?.bookings.completed ?? 0} selesai" icon="check" tone="ok" />
      <StatCard loading={loading && !data} label="Ditolak" value={data?.bookings.rejected ?? 0} note="{data?.bookings.cancelled ?? 0} dibatalkan" icon="x" tone="bad" />
      <StatCard loading={loading && !data} label="Mahasiswa Aktif" value={data?.students.active ?? 0} note="dari {data?.students.total ?? 0} akun terdaftar" icon="students" tone="navy" />
    </div>

    <div class="two">
      <section class="card">
        <div class="card-head">
          <div><h2 class="card-title">Grafik aktivitas peminjaman</h2><p class="card-sub">Jumlah peminjaman per {data?.chart.granularity === 'month' ? 'bulan' : 'hari'} berdasarkan tanggal mulai</p></div>
        </div>
        {#if loading && !data}
          <div class="skel-chart skeleton"></div>
        {:else if data && hasChartData}
          <BarChart points={data.chart.points} granularity={data.chart.granularity} />
        {:else}
          <EmptyState icon="bookings" title="Belum ada peminjaman" message="Tidak ada data peminjaman pada rentang dan status yang dipilih." />
        {/if}
      </section>

      <section class="card">
        <div class="card-head">
          <div><h2 class="card-title">Menunggu persetujuan</h2><p class="card-sub">Pengajuan terbaru yang perlu diproses</p></div>
          <a class="btn btn-ghost btn-sm" href="/bookings">Semua</a>
        </div>
        <div class="list">
          {#if loading && !data}
            {#each Array(3) as _}<div class="skeleton li-skel"></div>{/each}
          {:else if pending.length === 0}
            <EmptyState icon="check" title="Semua sudah diproses" message="Tidak ada pengajuan yang menunggu persetujuan." />
          {:else}
            {#each pending as b (b.id)}
              <button class="li" onclick={() => (detailId = b.id)}>
                <span class="avatar">{initials(b.student.name)}</span>
                <span class="grow">
                  <span class="cell-main truncate">{b.title}</span>
                  <span class="cell-sub truncate">{b.student.name} · {b.room.name}</span>
                  <span class="cell-sub">{fmtRange(b.startTime, b.endTime)}</span>
                </span>
                <Icon name="chevR" size={16} />
              </button>
            {/each}
          {/if}
        </div>
      </section>
    </div>

    <div class="two even">
      <section class="card">
        <div class="card-head"><div><h2 class="card-title">Aktivitas terbaru</h2><p class="card-sub">Perubahan status peminjaman terakhir</p></div></div>
        <div class="list">
          {#if loading && !data}
            {#each Array(4) as _}<div class="skeleton li-skel"></div>{/each}
          {:else if !data || data.recentActivity.length === 0}
            <EmptyState icon="inbox" title="Belum ada aktivitas" message="Aktivitas akan muncul saat ada pengajuan atau keputusan baru." />
          {:else}
            {#each data.recentActivity as log (log.id)}
              <button class="li" onclick={() => (detailId = log.booking.id)}>
                <span class="pip {log.action.toLowerCase()}"></span>
                <span class="grow">
                  <span class="act"><b>{log.user.name}</b> {verbs[log.action] ?? log.action.toLowerCase()} “{log.booking.title}”</span>
                  <span class="cell-sub">{log.booking.room.name} · {fmtRelative(log.createdAt)}</span>
                </span>
              </button>
            {/each}
          {/if}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2 class="card-title">Jadwal mendatang</h2><p class="card-sub">Peminjaman disetujui yang akan datang</p></div><a class="btn btn-ghost btn-sm" href="/schedule">Kalender</a></div>
        <div class="list">
          {#if loading && !data}
            {#each Array(4) as _}<div class="skeleton li-skel"></div>{/each}
          {:else if !data || data.upcoming.length === 0}
            <EmptyState icon="schedule" title="Belum ada jadwal mendatang" message="Peminjaman yang disetujui akan tampil di sini." />
          {:else}
            {#each data.upcoming as u (u.id)}
              <button class="li" onclick={() => (detailId = u.id)}>
                <span class="date-tile"><b>{fmtDate(u.startTime).split(' ')[0]}</b><small>{fmtDate(u.startTime).split(' ')[1]}</small></span>
                <span class="grow">
                  <span class="cell-main truncate">{u.title}</span>
                  <span class="cell-sub truncate">{u.room.name} · {u.student.name}</span>
                  <span class="cell-sub">{fmtTime(u.startTime)}–{fmtTime(u.endTime)} WIB</span>
                </span>
              </button>
            {/each}
          {/if}
        </div>
      </section>
    </div>
  {/if}
</div>

<BookingDetailModal bookingId={detailId} onclose={() => (detailId = null)} onchanged={changed} />

<style>
  .filters { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 16px 18px; }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .chip { height: 38px; padding: 0 15px; border-radius: 99px; border: 1px solid var(--line); background: #fff; font-size: 12.5px; font-weight: 600; color: var(--ink-2); transition: all .18s var(--ease); }
  .chip:hover { border-color: var(--gold-soft); background: var(--gold-tint); }
  .chip.on { background: var(--navy); border-color: var(--navy); color: #fff; }
  .fields { display: flex; gap: 12px; flex-wrap: wrap; } .fields .field { min-width: 150px; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
  .two { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  .two.even { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .list { padding: 10px 10px 12px; display: grid; gap: 2px; }
  .li { display: flex; align-items: center; gap: 13px; width: 100%; padding: 11px 12px; text-align: left; background: transparent; border: 0; border-radius: 12px; color: var(--ink-3); transition: background .15s; }
  .li:hover { background: #faf8f2; }
  .li .grow { display: grid; gap: 1px; }
  .act { font-size: 13px; font-weight: 400; color: var(--ink-2); line-height: 1.4; } .act b { color: var(--navy); font-weight: 600; }
  .pip { width: 10px; height: 10px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 0 4px var(--gold-tint); flex-shrink: 0; margin: 0 8px; }
  .pip.approved { background: var(--ok); box-shadow: 0 0 0 4px var(--ok-bg); } .pip.rejected { background: var(--bad); box-shadow: 0 0 0 4px var(--bad-bg); } .pip.cancelled { background: var(--mute); box-shadow: 0 0 0 4px var(--mute-bg); }
  .date-tile { display: grid; place-items: center; width: 46px; height: 50px; border-radius: 12px; background: var(--navy); color: #fff; flex-shrink: 0; line-height: 1.1; }
  .date-tile b { font-size: 18px; } .date-tile small { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--gold-soft); }
  .li-skel { height: 56px; margin: 4px 6px; border-radius: 12px; }
  .skel-chart { height: 280px; margin: 18px 22px 22px; border-radius: 12px; }
  .inline-err { padding: 12px 16px; color: var(--bad); background: var(--bad-bg); border-color: #efd1d1; font-size: 13px; }
  @media (max-width: 1180px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .two, .two.even { grid-template-columns: 1fr; } }
  @media (max-width: 560px) { .stats { gap: 10px; } .fields { width: 100%; } .fields .field { flex: 1; min-width: 120px; } }
</style>
