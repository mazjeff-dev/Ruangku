<script lang="ts">
  import { onMount } from 'svelte';
  import ErrorState from '../../../../lib/components/ErrorState.svelte';
  import EmptyState from '../../../../lib/components/EmptyState.svelte';
  import { apiRequest } from '../../../../lib/api';
  import { handleApiError } from '../../../../lib/stores/app.svelte';
  import { fmtDateTime } from '../../../../lib/utils';

  let data = $state<any>(null);
  let loading = $state(true);
  let error = $state('');

  async function load() {
    loading = true;
    error = '';
    try { data = (await apiRequest('/bookings/violations')).data; }
    catch (e) { error = handleApiError(e, 'Gagal memuat riwayat poin', true); }
    finally { loading = false; }
  }

  onMount(load);
</script>

<svelte:head><title>Poin &amp; Sanksi Saya — RuangKu</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div><div class="kicker">Transparansi peminjaman</div><h1 class="page-title">Poin &amp; Sanksi Saya</h1><p class="page-desc">Lihat riwayat pelanggaran, aturan poin, dan status penangguhan akun Anda.</p></div>
    <button class="btn btn-ghost" onclick={load} disabled={loading}>Muat ulang</button>
  </div>
  {#if error}<section class="card"><ErrorState message={error} onretry={load} /></section>
  {:else if loading && !data}<div class="card loading">Memuat riwayat poin…</div>
  {:else if data}
    <section class="card overview">
      <div><small>Poin aktif</small><b>{data.totalPoints} / {data.rules.suspendThreshold}</b></div>
      <div><small>Status booking</small><b>{data.blockedUntil ? `Ditangguhkan sampai ${fmtDateTime(data.blockedUntil)} WIB` : 'Tidak ditangguhkan'}</b></div>
    </section>
    <section class="card policy">
      <h2 class="card-title">Aturan yang berlaku</h2>
      <p>No-show: {data.rules.noShowPoints} poin · Terlambat check-out: {data.rules.overstayPoints} poin · Pembatalan dalam {data.rules.lateCancelWindowMinutes} menit sebelum mulai: {data.rules.lateCancelPoints} poin.</p>
      <p>Check-in dibuka 10 menit sebelum waktu mulai sampai {data.rules.gracePeriodMinutes} menit setelahnya. Penangguhan berlaku {data.rules.suspendDays} hari setelah ambang poin tercapai.</p>
    </section>
    <section class="card history">
      <h2 class="card-title">Riwayat poin</h2>
      {#if data.points.length === 0}<EmptyState icon="check" title="Belum ada poin pelanggaran" message="Jika ada pelanggaran, alasan dan detail booking akan tercantum di halaman ini." />
      {:else}
        {#each data.points as point (point.id)}
          <article class="point">
            <div class="row"><b>{point.type.replaceAll('_', ' ')}</b><span class="badge {point.waivedAt ? 'approved' : 'warn'}">{point.waivedAt ? 'Dibatalkan' : `+${point.points} poin`}</span></div>
            <p>{point.reason}</p>
            {#if point.booking}<small>Booking “{point.booking.title}” · {point.booking.room.name} · {fmtDateTime(point.booking.startTime)} WIB</small>{/if}
            <small>Dicatat {fmtDateTime(point.createdAt)}{point.waivedNote ? ` · Catatan: ${point.waivedNote}` : ''}</small>
          </article>
        {/each}
      {/if}
    </section>
  {/if}
</div>

<style>
  .overview { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; padding:22px; }
  .overview small,.overview b { display:block; } .overview small { color:var(--ink-3); font-size:12px; } .overview b { margin-top:5px; color:var(--navy); font-size:18px; }
  .policy,.history { padding:22px; } .policy p { margin:8px 0 0; color:var(--ink-2); font-size:13px; line-height:1.55; }
  .history { display:grid; gap:0; } .point { padding:16px 0; border-top:1px solid var(--line-2); } .row { display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--navy); }
  .point p { margin:8px 0; color:var(--ink-2); font-size:13px; line-height:1.55; } .point small { display:block; margin-top:4px; color:var(--ink-3); font-size:11px; }
  @media(max-width:700px) { .overview { grid-template-columns:1fr; } }
</style>
