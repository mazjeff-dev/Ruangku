<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from '../../../lib/components/Modal.svelte';
  import StatusBadge from '../../../lib/components/StatusBadge.svelte';
  import Pagination from '../../../lib/components/Pagination.svelte';
  import Skeleton from '../../../lib/components/Skeleton.svelte';
  import EmptyState from '../../../lib/components/EmptyState.svelte';
  import ErrorState from '../../../lib/components/ErrorState.svelte';
  import BookingDetailModal from '../../../lib/components/BookingDetailModal.svelte';
  import { apiRequest, qs } from '../../../lib/api';
  import { handleApiError } from '../../../lib/stores/app.svelte';
  import { confirmDialog } from '../../../lib/stores/confirm.svelte';
  import { toastSuccess } from '../../../lib/stores/toast.svelte';
  import { debounce, fmtDate, fmtRange, initials } from '../../../lib/utils';

  let q = $state('');
  let status = $state('');
  let page = $state(1);
  const pageSize = 15;
  let rows = $state<any[]>([]);
  let total = $state(0);
  let totalPages = $state(1);
  let loading = $state(true);
  let error = $state('');

  let detail = $state<any>(null);
  let detailOpen = $state(false);
  let detailLoading = $state(false);
  let violationData = $state<any>(null);
  let violationLoading = $state(false);
  let violationError = $state('');
  let waiveId = $state<number | null>(null);
  let waiveNote = $state('');
  let toggling = $state(false);
  let bookingId = $state<number | null>(null);

  async function load() {
    loading = true; error = '';
    try {
      const r = await apiRequest(`/admin/students${qs({ q: q.trim(), status, page, pageSize })}`);
      rows = r.data; total = r.total; totalPages = r.totalPages;
    } catch (e) { error = handleApiError(e, 'Gagal memuat mahasiswa', true); }
    finally { loading = false; }
  }
  const search = debounce(() => { page = 1; load(); });

  async function openDetail(id: number) {
    detailOpen = true; detailLoading = true; detail = null;
    violationData = null;
    violationError = '';
    try {
      detail = (await apiRequest(`/admin/students/${id}`)).data;
      violationLoading = true;
      try { violationData = (await apiRequest(`/admin/students/${id}/violations`)).data; }
      catch (e) { violationError = handleApiError(e, 'Gagal memuat poin pelanggaran', true); }
      finally { violationLoading = false; }
    }
    catch (e) { handleApiError(e); detailOpen = false; }
    finally { detailLoading = false; }
  }

  async function waivePoint(id: number) {
    if (waiveNote.trim().length < 3) return;
    try {
      const r = await apiRequest(`/admin/violations/${id}/waive`, {
        method: 'PATCH',
        body: JSON.stringify({ note: waiveNote.trim() })
      });
      toastSuccess(r.message);
      waiveId = null;
      waiveNote = '';
      if (detail) {
        violationData = (await apiRequest(`/admin/students/${detail.id}/violations`)).data;
      }
    } catch (e) { handleApiError(e); }
  }

  async function toggleStatus(s: any) {
    const next = !s.isActive;
    const ok = await confirmDialog({
      title: next ? 'Aktifkan akun?' : 'Nonaktifkan akun?',
      message: next ? `${s.name} akan dapat masuk dan mengajukan peminjaman kembali.` : `${s.name} tidak akan bisa masuk atau mengajukan peminjaman sampai diaktifkan lagi.`,
      confirmLabel: next ? 'Aktifkan' : 'Nonaktifkan', tone: next ? 'default' : 'danger'
    });
    if (!ok) return;
    toggling = true;
    try {
      const r = await apiRequest(`/admin/students/${s.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: next }) });
      toastSuccess(r.message);
      if (detail?.id === s.id) detail.isActive = next;
      load();
    } catch (e) { handleApiError(e); }
    finally { toggling = false; }
  }

  onMount(load);
</script>

<svelte:head><title>Mahasiswa — RuangKu Admin</title></svelte:head>

<div class="page">
  <div class="page-head"><div>
    <div class="kicker">Pengelolaan</div>
    <h1 class="page-title">Manajemen mahasiswa</h1>
    <p class="page-desc">Lihat akun mahasiswa, riwayat peminjaman, dan atur status akun.</p>
  </div></div>

  <section class="card">
    <div class="filters">
      <input class="input input-search" placeholder="Cari nama, email, atau NIM…" bind:value={q} oninput={search} aria-label="Cari mahasiswa" />
      <select class="select" bind:value={status} onchange={() => { page = 1; load(); }} aria-label="Filter status akun">
        <option value="">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option>
      </select>
    </div>

    {#if loading && rows.length === 0}<Skeleton rows={8} height={22} />
    {:else if error}<ErrorState message={error} onretry={load} />
    {:else if rows.length === 0}<EmptyState icon="students" title={q || status ? 'Tidak ada hasil' : 'Belum ada mahasiswa'} message={q || status ? 'Coba kata kunci atau filter lain.' : 'Mahasiswa yang mendaftar lewat aplikasi akan muncul di sini.'} />
    {:else}
      <div class="table-wrap" class:dim={loading}>
        <table class="table stack">
          <thead><tr><th>Mahasiswa</th><th>NIM</th><th>Peminjaman</th><th>Terdaftar</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {#each rows as s (s.id)}
              <tr class="clickable" onclick={() => openDetail(s.id)}>
                <td data-label="Mahasiswa"><div class="row"><span class="avatar">{initials(s.name)}</span><div><div class="cell-main">{s.name}</div><div class="cell-sub">{s.email}</div></div></div></td>
                <td data-label="NIM">{s.nim ?? '—'}</td>
                <td data-label="Peminjaman">{s.totalBookings}</td>
                <td data-label="Terdaftar">{fmtDate(s.createdAt)}</td>
                <td data-label="Status"><span class="badge {s.isActive ? 'approved' : 'neutral'}"><i></i>{s.isActive ? 'Aktif' : 'Nonaktif'}</span></td>
                <td class="no-label"><button class="btn btn-ghost btn-sm" onclick={(e) => { e.stopPropagation(); toggleStatus(s); }} disabled={toggling}>{s.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <Pagination {page} {totalPages} {total} {pageSize} onchange={(p) => { page = p; load(); }} />
    {/if}
  </section>
</div>

<Modal open={detailOpen} title={detail?.name ?? 'Detail mahasiswa'} subtitle={detail ? `${detail.nim ?? '—'} · ${detail.email}` : undefined} size="lg" onclose={() => (detailOpen = false)}>
  {#if detailLoading || !detail}
    <Skeleton rows={6} />
  {:else}
    <div class="sum">
      <div><b>{detail.stats.total}</b><span>Total</span></div>
      <div><b>{detail.stats.PENDING}</b><span>Menunggu</span></div>
      <div><b>{detail.stats.APPROVED}</b><span>Disetujui</span></div>
      <div><b>{detail.stats.REJECTED}</b><span>Ditolak</span></div>
      <div><b>{detail.stats.CANCELLED}</b><span>Dibatalkan</span></div>
    </div>
    <div class="row-between acc">
      <div><span class="badge {detail.isActive ? 'approved' : 'neutral'}"><i></i>Akun {detail.isActive ? 'aktif' : 'nonaktif'}</span><span class="muted tiny"> · terdaftar {fmtDate(detail.createdAt)}</span></div>
      <button class="btn btn-sm {detail.isActive ? 'btn-danger' : 'btn-ok'}" onclick={() => toggleStatus(detail)} disabled={toggling}>{detail.isActive ? 'Nonaktifkan akun' : 'Aktifkan akun'}</button>
    </div>
    <h4>Poin & sanksi</h4>
    {#if violationLoading}
      <Skeleton rows={3} />
    {:else if violationError}
      <ErrorState message={violationError} onretry={() => openDetail(detail.id)} />
    {:else if violationData}
      <section class="violations">
        <div class="row-between">
          <div><b>{violationData.totalPoints} poin aktif</b><div class="cell-sub">{violationData.user.bookingBlockedUntil ? `Booking diblokir sampai ${fmtDate(violationData.user.bookingBlockedUntil)}` : 'Tidak ada pemblokiran booking aktif'}</div></div>
        </div>
        {#if violationData.points.length === 0}<p class="cell-sub">Belum ada poin pelanggaran.</p>{/if}
        {#each violationData.points as point (point.id)}
          <div class="violation-row">
            <div class="grow">
              <b>{point.points} poin · {point.type}</b>
              <div class="cell-sub">{point.reason}</div>
              <div class="cell-sub">{fmtDate(point.createdAt)} · {point.booking.title} ({point.booking.room.name})</div>
              {#if point.waivedAt}<div class="cell-sub">Dibatalkan: {point.waivedNote ?? '—'}</div>{/if}
            </div>
            {#if !point.waivedAt}
              <button class="btn btn-ghost btn-sm" onclick={() => { waiveId = point.id; waiveNote = ''; }}>Batalkan poin</button>
            {/if}
          </div>
          {#if waiveId === point.id}
            <div class="waive-form">
              <label for="waive-note">Catatan pembatalan poin</label>
              <textarea id="waive-note" class="textarea" bind:value={waiveNote} maxlength="500" placeholder="Wajib diisi (minimal 3 karakter)"></textarea>
              <div class="row-between">
                <button class="btn btn-ghost btn-sm" onclick={() => { waiveId = null; waiveNote = ''; }}>Kembali</button>
                <button class="btn btn-danger-solid btn-sm" onclick={() => waivePoint(point.id)} disabled={waiveNote.trim().length < 3}>Konfirmasi pembatalan</button>
              </div>
            </div>
          {/if}
        {/each}
      </section>
    {/if}
    <h4>Riwayat peminjaman</h4>
    {#if detail.bookings.length === 0}
      <EmptyState icon="bookings" title="Belum ada peminjaman" message="Mahasiswa ini belum pernah mengajukan peminjaman." />
    {:else}
      <div class="hist">
        {#each detail.bookings as b (b.id)}
          <button class="h" onclick={() => (bookingId = b.id)}>
            <span class="grow"><span class="cell-main">{b.title}</span><span class="cell-sub">{b.room.name} · {fmtRange(b.startTime, b.endTime)}</span></span>
            <StatusBadge status={b.status} />
          </button>
        {/each}
      </div>
    {/if}
  {/if}
  {#snippet footer()}<button class="btn btn-ghost" onclick={() => (detailOpen = false)}>Tutup</button>{/snippet}
</Modal>

<BookingDetailModal {bookingId} onclose={() => (bookingId = null)} onchanged={() => detail && openDetail(detail.id)} />

<style>
  .filters { display: grid; grid-template-columns: 1fr 200px; gap: 10px; padding: 16px 18px; border-bottom: 1px solid var(--line-2); }
  .dim { opacity: .55; transition: opacity .2s; } .tiny { font-size: 12px; }
  .sum { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 4px 0 16px; }
  .sum div { padding: 12px; border-radius: 14px; background: #fdfcf9; border: 1px solid var(--line); text-align: center; }
  .sum b { display: block; font-family: var(--font); font-size: 24px; font-weight: 700; color: var(--navy); } .sum span { font-size: 11px; color: var(--ink-3); }
  .acc { margin-bottom: 18px; flex-wrap: wrap; }
  h4 { margin-bottom: 8px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
  .hist { display: grid; gap: 6px; max-height: 320px; overflow-y: auto; }
  .violations { display: grid; gap: 10px; margin-bottom: 18px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; }
  .violation-row { display: flex; align-items: flex-start; gap: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
  .violation-row .grow { flex: 1; min-width: 0; }
  .waive-form { display: grid; gap: 8px; padding: 12px; border-radius: 10px; background: #fff8f4; }
  .h { display: flex; align-items: center; gap: 12px; padding: 11px 14px; text-align: left; border: 1px solid var(--line); border-radius: 12px; background: #fff; transition: background .15s, border-color .15s; }
  .h:hover { background: #fcfbf8; border-color: var(--gold-soft); } .h .grow { display: grid; }
  @media (max-width: 640px) { .filters { grid-template-columns: 1fr; } .sum { grid-template-columns: repeat(3, 1fr); } }
</style>
