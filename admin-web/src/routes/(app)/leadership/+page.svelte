<script lang="ts">
  import { onMount } from 'svelte';
  import StatCard from '../../../lib/components/StatCard.svelte';
  import ErrorState from '../../../lib/components/ErrorState.svelte';
  import EmptyState from '../../../lib/components/EmptyState.svelte';
  import Icon from '../../../lib/components/Icon.svelte';
  import { apiRequest, downloadFile, qs } from '../../../lib/api';
  import { handleApiError } from '../../../lib/stores/app.svelte';
  import { toastSuccess } from '../../../lib/stores/toast.svelte';
  import { monthEnd, monthStart, todayKey } from '../../../lib/utils';

  let from = $state(monthStart(todayKey()));
  let to = $state(monthEnd(todayKey()));
  let lowUsageThreshold = $state(20);
  let highOccupancyThreshold = $state(80);
  let minimumDemand = $state(3);
  let data = $state<any>(null);
  let loading = $state(true);
  let exporting = $state(false);
  let error = $state('');

  const filters = () => ({ from, to, lowUsageThreshold, highOccupancyThreshold, minimumDemand });

  async function load() {
    if (to < from) {
      error = 'Tanggal akhir harus sama atau setelah tanggal awal.';
      return;
    }
    loading = true;
    error = '';
    try {
      data = (await apiRequest(`/leadership/overview${qs(filters())}`)).data;
    } catch (e) {
      error = handleApiError(e, 'Gagal memuat dasbor pengadaan', true);
    } finally {
      loading = false;
    }
  }

  async function exportCsv() {
    exporting = true;
    try {
      await downloadFile(`/leadership/overview/export${qs(filters())}`, 'dasbor-pengadaan.csv');
      toastSuccess('Ekspor CSV berhasil diunduh');
    } catch (e) {
      handleApiError(e);
    } finally {
      exporting = false;
    }
  }

  onMount(load);
</script>

<svelte:head><title>Dasbor Pengadaan — RuangKu</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div><div class="kicker">Analisis fasilitas</div><h1 class="page-title">Dasbor pengadaan</h1><p class="page-desc">Ringkasan okupansi, tekanan permintaan, dan dasar rekomendasi pengadaan.</p></div>
    <button class="btn btn-gold" onclick={exportCsv} disabled={loading || exporting}>{#if exporting}<span class="spinner"></span>{:else}<Icon name="download" size={16} />{/if} Ekspor CSV</button>
  </div>

  <section class="card filters">
    <label class="field"><span>Dari tanggal</span><input class="input" type="date" bind:value={from} onchange={load} /></label>
    <label class="field"><span>Sampai tanggal</span><input class="input" type="date" bind:value={to} onchange={load} /></label>
    <label class="field"><span>Ambang jarang dipakai (%)</span><input class="input" type="number" min="0" max="100" bind:value={lowUsageThreshold} onchange={load} /></label>
    <label class="field"><span>Ambang okupansi tinggi (%)</span><input class="input" type="number" min="1" max="100" bind:value={highOccupancyThreshold} onchange={load} /></label>
    <label class="field"><span>Minimal permintaan bentrok</span><input class="input" type="number" min="1" bind:value={minimumDemand} onchange={load} /></label>
  </section>

  {#if error && !data}
    <section class="card"><ErrorState message={error} onretry={load} /></section>
  {:else}
    <section class="stats">
      <StatCard {loading} label="Ruangan dianalisis" value={data?.occupancy.length ?? 0} note="Ruangan aktif pada periode" icon="rooms" tone="navy" />
      <StatCard {loading} label="Ruangan jarang dipakai" value={data?.underusedRooms.length ?? 0} note="Di bawah ambang utilisasi" icon="reports" tone="warn" />
      <StatCard {loading} label="Permintaan tinggi" value={data?.frequentlyFullRooms.length ?? 0} note="Okupansi dan antrean/konflik tinggi" icon="bookings" tone="gold" />
      <StatCard {loading} label="Rasio no-show" value={`${data?.attendance.noShowRatePercent ?? 0}%`} note="{data?.attendance.noShowBookings ?? 0} booking" icon="clock" tone="warn" />
      <StatCard {loading} label="Rasio overstay" value={`${data?.attendance.overstayRatePercent ?? 0}%`} note="{data?.attendance.overstayMinutes ?? 0} menit tercatat" icon="clock" tone="gold" />
    </section>

    {#if error}<div class="inline-error" role="alert">{error}</div>{/if}
    {#if !loading && data}
      <section class="card">
        <div class="card-head"><div><h2 class="card-title">Okupansi per ruangan</h2><p class="card-sub">Jam terpakai dibanding jam operasional terjadwal pada periode.</p></div></div>
        {#if data.occupancy.length === 0}<EmptyState icon="rooms" title="Tidak ada ruangan aktif" message="Belum ada data ruangan untuk dianalisis." />
        {:else}
          <div class="table-wrap"><table class="table stack">
            <thead><tr><th>Ruangan</th><th>Okupansi</th><th>Terpakai / operasional</th><th>Peserta / kapasitas</th><th>Demand bentrok</th><th>Antrean</th><th>Waktu tunggu</th></tr></thead>
            <tbody>{#each data.occupancy as room (room.id)}
              <tr><td data-label="Ruangan"><b>{room.name}</b><small class="sub">{room.code} · kapasitas {room.capacity}</small></td>
                <td data-label="Okupansi"><div class="meter"><i style={`width:${Math.min(room.occupancyPercent, 100)}%`}></i></div>{room.occupancyPercent}%</td>
                <td data-label="Terpakai / operasional">{room.usedHours} / {room.operatingHours} jam</td>
                <td data-label="Peserta / kapasitas">{room.attendeeCapacityRatio == null ? '—' : `${Math.round(room.attendeeCapacityRatio * 100)}%`}</td>
                <td data-label="Demand bentrok">{room.demandCount}</td><td data-label="Antrean">{room.waitingCount}</td>
                <td data-label="Waktu tunggu">{room.averageQueueWaitMinutes == null ? '—' : `${room.averageQueueWaitMinutes} menit`}</td></tr>
            {/each}</tbody>
          </table></div>
        {/if}
      </section>

      <div class="two">
        <section class="card"><div class="card-head"><div><h2 class="card-title">Jam sibuk</h2><p class="card-sub">Hari dan jam mulai booking terbanyak (WIB).</p></div></div>
          {#if data.peakHours.length === 0}<p class="muted">Belum ada booking disetujui pada periode ini.</p>{:else}<ul class="plain">{#each data.peakHours.slice(0, 10) as item}<li><b>{['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][item.dayOfWeek]} {String(item.hour).padStart(2, '0')}:00</b><span>{item.bookings} booking · {item.attendees} peserta</span></li>{/each}</ul>{/if}
        </section>
        <section class="card"><div class="card-head"><div><h2 class="card-title">Pengguna terbanyak</h2><p class="card-sub">Mencakup mahasiswa dan dosen.</p></div></div>
          {#if data.topUsers.length === 0}<p class="muted">Belum ada booking pada periode ini.</p>{:else}<ul class="plain">{#each data.topUsers.slice(0, 10) as user (user.id)}<li><b>{user.name}<small class="sub">{user.role === 'DOSEN' ? 'Dosen' : 'Mahasiswa'} · {user.email}</small></b><span>{user.bookings} booking</span></li>{/each}</ul>{/if}
        </section>
      </div>

      <section class="card"><div class="card-head"><div><h2 class="card-title">Rekomendasi pengadaan</h2><p class="card-sub">Setiap rekomendasi menyertakan metrik dan ambang yang digunakan.</p></div></div>
        {#if data.recommendations.length === 0}<EmptyState icon="reports" title="Belum ada rekomendasi" message="Data periode ini belum memenuhi ambang analisis." />
        {:else}<div class="recommendations">{#each data.recommendations as item}<article><span class="tag">{item.type === 'CAPACITY' ? 'Kapasitas' : 'Pemerataan'}</span><h3>{item.title}</h3><p>{item.reason}</p><small>Jam terpakai {item.basis.usedHours ?? 0} / {item.basis.operatingHours ?? 0} · Okupansi {item.basis.occupancyPercent ?? 0}%{#if item.basis.conflictDemandCount != null} · {item.basis.conflictDemandCount} permintaan bentrok · {item.basis.waitingCount} antrean{/if}</small></article>{/each}</div>{/if}
      </section>
    {/if}
  {/if}
</div>

<style>
  .filters { display:grid; grid-template-columns:repeat(5,minmax(120px,1fr)); gap:12px; padding:16px; margin-bottom:16px; }
  .field { display:grid; gap:6px; }.field span { color:var(--ink-2); font-size:11px; font-weight:600; }
  .stats { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; margin-bottom:16px; }
  /* Isi kartu di bawah .card-head tidak punya padding bawaan; samakan dengan halaman Laporan (22px). */
  .card > .muted { margin:0; padding:14px 22px 22px; }
  .card > .plain { margin:0; padding:6px 22px 16px; }
  .card > .recommendations { padding:14px 22px 22px; }
  .two { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:16px 0; }
  .meter { display:inline-block; width:70px; height:7px; margin-right:7px; border-radius:8px; background:var(--line-2); overflow:hidden; vertical-align:middle; }
  .meter i { display:block; height:100%; background:var(--gold); }
  .sub { display:block; margin-top:4px; color:var(--ink-3); font-size:11px; font-weight:400; }
  .plain { display:grid; gap:0; list-style:none; }.plain li { display:flex; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid var(--line-2); font-size:12px; }.plain li span { white-space:nowrap; color:var(--ink-3); }
  .recommendations { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }.recommendations article { padding:14px; border:1px solid var(--line); border-radius:12px; }.recommendations h3 { margin-top:8px; font-size:14px; }.recommendations p,.recommendations small { display:block; margin-top:6px; color:var(--ink-3); font-size:11px; line-height:1.5; }.tag { color:var(--gold-deep); font-size:10px; font-weight:700; text-transform:uppercase; }
  @media(max-width:1000px){.stats{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:650px){.two,.recommendations{grid-template-columns:1fr}}
</style>
