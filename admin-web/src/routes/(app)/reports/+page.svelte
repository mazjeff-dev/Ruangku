<script lang="ts">
  import { onMount } from 'svelte';
  import StatCard from '../../../lib/components/StatCard.svelte';
  import ErrorState from '../../../lib/components/ErrorState.svelte';
  import EmptyState from '../../../lib/components/EmptyState.svelte';
  import Icon from '../../../lib/components/Icon.svelte';
  import { apiRequest, downloadFile, qs } from '../../../lib/api';
  import { app, handleApiError } from '../../../lib/stores/app.svelte';
  import { toastSuccess } from '../../../lib/stores/toast.svelte';
  import { addDays, fmtDate, monthEnd, monthStart, startOfWeek, todayKey } from '../../../lib/utils';

  type Preset = 'week' | 'month' | '30d' | '90d' | 'custom';
  let preset = $state<Preset>('month');
  let from = $state(monthStart(todayKey()));
  let to = $state(monthEnd(todayKey()));
  let data = $state<any>(null);
  let loading = $state(true);
  let error = $state('');
  let exporting = $state(false);
  const reportBase = $derived(app.user?.role === 'DOSEN' ? '/lecturer' : '/admin');

  function applyPreset(p: Preset) {
    preset = p;
    const today = todayKey();
    if (p === 'week') { from = startOfWeek(today); to = addDays(from, 6); }
    else if (p === 'month') { from = monthStart(today); to = monthEnd(today); }
    else if (p === '30d') { from = addDays(today, -29); to = today; }
    else if (p === '90d') { from = addDays(today, -89); to = today; }
    if (p !== 'custom') load();
  }

  async function load() {
    if (to < from) { error = 'Tanggal akhir harus sama atau setelah tanggal awal.'; return; }
    loading = true; error = '';
    try { data = (await apiRequest(`${reportBase}/reports${qs({ from, to })}`)).data; }
    catch (e) { error = handleApiError(e, 'Gagal memuat laporan', true); }
    finally { loading = false; }
  }

  async function exportCsv() {
    exporting = true;
    try { await downloadFile(`${reportBase}/reports/export${qs({ from, to })}`, 'laporan-ruangku.csv'); toastSuccess('Laporan CSV berhasil diunduh'); }
    catch (e) { handleApiError(e); }
    finally { exporting = false; }
  }

  const maxRoom = $derived(Math.max(1, ...(data?.topRooms ?? []).map((r: any) => r.bookings)));
  const maxDay = $derived(Math.max(1, ...(data?.daily ?? []).map((d: any) => d.bookings)));
  const totalCat = $derived(Math.max(1, (data?.byCategory ?? []).reduce((t: number, c: any) => t + c.bookings, 0)));
  onMount(load);
</script>

<svelte:head><title>Laporan — RuangKu Admin</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div><div class="kicker">Pengelolaan</div><h1 class="page-title">Laporan peminjaman</h1><p class="page-desc">{app.user?.role === 'DOSEN' ? 'Statistik penggunaan ruangan yang ditugaskan kepada Anda.' : 'Statistik penggunaan seluruh ruangan dan aktivitas mahasiswa per periode.'}</p></div>
    <button class="btn btn-gold" onclick={exportCsv} disabled={exporting || loading}>{#if exporting}<span class="spinner"></span>{:else}<Icon name="download" size={16} />{/if} Ekspor CSV</button>
  </div>

  <section class="card filters">
    <div class="chips" role="group" aria-label="Periode">
      {#each [['week', 'Minggu ini'], ['month', 'Bulan ini'], ['30d', '30 hari'], ['90d', '90 hari']] as [k, l]}
        <button class="chip" class:on={preset === k} onclick={() => applyPreset(k as Preset)}>{l}</button>
      {/each}
    </div>
    <div class="fields">
      <div class="field"><label for="r-from">Dari</label><input id="r-from" type="date" class="input" bind:value={from} onchange={() => { preset = 'custom'; load(); }} /></div>
      <div class="field"><label for="r-to">Sampai</label><input id="r-to" type="date" class="input" bind:value={to} onchange={() => { preset = 'custom'; load(); }} /></div>
    </div>
  </section>

  {#if error && !data}
    <div class="card"><ErrorState message={error} onretry={load} /></div>
  {:else}
    <div class="stats">
      <StatCard loading={loading && !data} label="Total Peminjaman" value={data?.totals.bookings ?? 0} note="{fmtDate(from)} – {fmtDate(to)}" icon="bookings" tone="gold" />
      <StatCard loading={loading && !data} label="Tingkat Persetujuan" value={data?.totals.approvalRate == null ? '—' : `${data.totals.approvalRate}%`} note="{(data?.totals.approved ?? 0) + (data?.totals.completed ?? 0)} disetujui · {data?.totals.rejected ?? 0} ditolak" icon="check" tone="ok" />
      <StatCard loading={loading && !data} label="Jam Terpakai" value={data?.totals.totalHours ?? 0} note="Peminjaman disetujui/selesai" icon="clock" tone="navy" />
      <StatCard loading={loading && !data} label="Mahasiswa Aktif" value={data?.totals.activeStudents ?? 0} note="{data?.totals.pending ?? 0} menunggu · {data?.totals.cancelled ?? 0} dibatalkan" icon="students" tone="warn" />
      <StatCard loading={loading && !data} label="Jumlah Peserta" value={data?.totals.attendees ?? 0} note="Akumulasi dari pemesanan yang tercatat" icon="students" tone="gold" />
    </div>

    {#if !loading && data && data.totals.bookings === 0}
      <div class="card"><EmptyState icon="reports" title="Tidak ada data" message="Belum ada peminjaman pada periode ini. Coba pilih rentang lain." /></div>
    {:else if data}
      <div class="two">
        <section class="card">
          <div class="card-head"><div><h2 class="card-title">Ruangan paling sering digunakan</h2><p class="card-sub">Berdasarkan jumlah pengajuan pada periode</p></div></div>
          <ul class="bars">
            {#each data.topRooms as r (r.id)}
              <li><div class="row-between"><span class="cell-main truncate">{r.name}</span><span class="muted">{r.bookings}× · {r.attendees} peserta · {r.hours} jam</span></div>
                <div class="track"><i style="width:{(r.bookings / maxRoom) * 100}%"></i></div></li>
            {/each}
          </ul>
        </section>
        <section class="card">
          <div class="card-head"><div><h2 class="card-title">Berdasarkan kategori</h2><p class="card-sub">Sebaran peminjaman per jenis ruangan</p></div></div>
          <ul class="bars">
            {#each data.byCategory as c (c.name)}
              <li><div class="row-between"><span class="cell-main">{c.name}</span><span class="muted">{c.bookings} ({Math.round((c.bookings / totalCat) * 100)}%)</span></div>
                <div class="track alt"><i style="width:{(c.bookings / totalCat) * 100}%"></i></div></li>
            {/each}
          </ul>
        </section>
      </div>

      <section class="card">
        <div class="card-head"><div><h2 class="card-title">Tren harian</h2><p class="card-sub">Jumlah peminjaman menurut tanggal mulai</p></div></div>
        <div class="spark" style="--n:{data.daily.length}">
          {#each data.daily as d (d.date)}<div class="sp" title="{fmtDate(d.date)}: {d.bookings}"><i style="height:{(d.bookings / maxDay) * 100}%"></i></div>{/each}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2 class="card-title">Aktivitas mahasiswa</h2><p class="card-sub">10 mahasiswa dengan pengajuan terbanyak</p></div></div>
        <div class="table-wrap">
          <table class="table stack">
            <thead><tr><th>Mahasiswa</th><th>NIM</th><th>Pengajuan</th><th>Peserta</th><th>Disetujui/selesai</th><th>Jam terpakai</th></tr></thead>
            <tbody>
              {#each data.topStudents as s (s.id)}
                <tr><td data-label="Mahasiswa" class="cell-main">{s.name}</td><td data-label="NIM">{s.nim ?? '—'}</td><td data-label="Pengajuan">{s.bookings}</td><td data-label="Peserta">{s.attendees}</td><td data-label="Disetujui/selesai">{s.approved}</td><td data-label="Jam terpakai">{s.hours}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  .filters { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 16px 18px; }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .chip { height: 38px; padding: 0 15px; border-radius: 99px; border: 1px solid var(--line); background: #fff; font-size: 12.5px; font-weight: 600; color: var(--ink-2); transition: all .18s var(--ease); }
  .chip:hover { border-color: var(--gold-soft); background: var(--gold-tint); } .chip.on { background: var(--navy); border-color: var(--navy); color: #fff; }
  .fields { display: flex; gap: 12px; flex-wrap: wrap; }
  .stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; }
  .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
  .bars { list-style: none; margin: 0; padding: 14px 22px 22px; display: grid; gap: 14px; }
  .bars li { display: grid; gap: 7px; font-size: 13px; }
  .track { height: 8px; border-radius: 8px; background: #efece3; overflow: hidden; } .track i { display: block; height: 100%; border-radius: 8px; background: linear-gradient(90deg, var(--gold), var(--gold-deep)); animation: grow .6s var(--ease) both; transform-origin: left; }
  .track.alt i { background: linear-gradient(90deg, var(--navy-3), var(--navy)); }
  .spark { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 4px; align-items: end; height: 140px; padding: 16px 22px 22px; }
  .sp { height: 100%; display: flex; align-items: end; } .sp i { display: block; width: 100%; min-height: 3px; border-radius: 4px 4px 1px 1px; background: var(--navy-3); }
  @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @media (max-width: 1100px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .two { grid-template-columns: 1fr; } }
</style>
