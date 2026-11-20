<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from '../../../lib/components/Modal.svelte';
  import Skeleton from '../../../lib/components/Skeleton.svelte';
  import EmptyState from '../../../lib/components/EmptyState.svelte';
  import ErrorState from '../../../lib/components/ErrorState.svelte';
  import { apiRequest, qs } from '../../../lib/api';
  import { handleApiError } from '../../../lib/stores/app.svelte';
  import { confirmDialog } from '../../../lib/stores/confirm.svelte';
  import { toastSuccess } from '../../../lib/stores/toast.svelte';
  import { initials, fmtDate } from '../../../lib/utils';
  import PasswordInput from '../../../lib/components/PasswordInput.svelte';

  let lecturers = $state<any[]>([]);
  let rooms = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let query = $state('');
  let name = $state('');
  let email = $state('');
  let password = $state('');
  let creating = $state(false);
  let target = $state<any>(null);
  let selectedRoomIds = $state<number[]>([]);
  let savingRooms = $state(false);
  let updatingId = $state<number | null>(null);

  async function load() {
    loading = true;
    error = '';
    try {
      const [lecturerResult, roomResult] = await Promise.all([
        apiRequest(`/admin/lecturers${qs({ q: query.trim(), pageSize: 100 })}`),
        apiRequest('/admin/rooms')
      ]);
      lecturers = lecturerResult.data;
      rooms = roomResult.data;
    } catch (e) { error = handleApiError(e, 'Gagal memuat data dosen', true); }
    finally { loading = false; }
  }

  async function createLecturer(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    if (name.trim().length < 2) { error = 'Nama minimal 2 karakter.'; return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { error = 'Format email tidak valid.'; return; }
    if (password.length < 8) { error = 'Password minimal 8 karakter.'; return; }
    creating = true;
    try {
      const result = await apiRequest('/admin/lecturers', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password })
      });
      toastSuccess(result.message);
      name = email = password = '';
      await load();
    } catch (e) { error = handleApiError(e, 'Gagal membuat akun dosen'); }
    finally { creating = false; }
  }

  async function toggleStatus(lecturer: any) {
    const active = !lecturer.isActive;
    const ok = await confirmDialog({
      title: active ? 'Aktifkan akun dosen?' : 'Nonaktifkan akun dosen?',
      message: active ? `${lecturer.name} dapat masuk kembali.` : `${lecturer.name} tidak dapat masuk atau meninjau pengajuan.`,
      confirmLabel: active ? 'Aktifkan' : 'Nonaktifkan',
      tone: active ? 'default' : 'danger'
    });
    if (!ok) return;
    updatingId = lecturer.id;
    try {
      const result = await apiRequest(`/admin/lecturers/${lecturer.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: active })
      });
      toastSuccess(result.message);
      await load();
    } catch (e) { handleApiError(e); }
    finally { updatingId = null; }
  }

  function openAssignments(lecturer: any) {
    target = lecturer;
    selectedRoomIds = lecturer.lecturerRooms.map((assignment: any) => assignment.room.id);
  }

  function toggleRoom(roomId: number) {
    selectedRoomIds = selectedRoomIds.includes(roomId)
      ? selectedRoomIds.filter((id) => id !== roomId)
      : [...selectedRoomIds, roomId];
  }

  async function saveAssignments() {
    if (!target) return;
    savingRooms = true;
    try {
      const result = await apiRequest(`/admin/lecturers/${target.id}/rooms`, {
        method: 'PUT',
        body: JSON.stringify({ roomIds: selectedRoomIds })
      });
      toastSuccess(result.message);
      target = null;
      await load();
    } catch (e) { handleApiError(e); }
    finally { savingRooms = false; }
  }

  onMount(load);
</script>

<svelte:head><title>Manajemen Dosen — RuangKu</title></svelte:head>

<div class="page">
  <div class="page-head"><div><div class="kicker">Pengelolaan</div><h1 class="page-title">Manajemen dosen</h1><p class="page-desc">Buat akun dosen dan tetapkan kewenangan peninjauan per ruangan.</p></div></div>

  <section class="card create-card">
    <div class="card-head"><div><h2 class="card-title">Tambah akun dosen</h2><p class="card-sub">Password awal ditetapkan administrator dan dapat diganti oleh dosen.</p></div></div>
    <form class="create-form" onsubmit={createLecturer}>
      <label>Nama<input class="input" bind:value={name} maxlength="100" required /></label>
      <label>Email<input class="input" type="email" bind:value={email} maxlength="150" required /></label>
      <label>Password awal<PasswordInput id="lecturer-password" inputClass="input" bind:value={password} minlength={8} maxlength={72} required autocomplete="new-password" /></label>
      <button class="btn btn-primary" type="submit" disabled={creating}>{#if creating}<span class="spinner"></span>{/if} Buat akun</button>
    </form>
  </section>

  {#if error}<div class="inline-error" role="alert">{error}</div>{/if}
  <section class="card">
    <div class="filters">
      <input class="input input-search" placeholder="Cari nama atau email dosen…" bind:value={query} oninput={load} aria-label="Cari dosen" />
    </div>
    {#if loading}<Skeleton rows={6} height={28} />
    {:else if error && lecturers.length === 0}<ErrorState message={error} onretry={load} />
    {:else if lecturers.length === 0}<EmptyState icon="students" title="Belum ada dosen" message="Buat akun dosen menggunakan formulir di atas." />
    {:else}
      <div class="table-wrap"><table class="table stack">
        <thead><tr><th>Dosen</th><th>Ruangan tugas</th><th>Ditinjau</th><th>Terdaftar</th><th>Status</th><th></th></tr></thead>
        <tbody>{#each lecturers as lecturer (lecturer.id)}
          <tr>
            <td data-label="Dosen"><div class="row"><span class="avatar">{initials(lecturer.name)}</span><div><div class="cell-main">{lecturer.name}</div><div class="cell-sub">{lecturer.email}</div></div></div></td>
            <td data-label="Ruangan tugas">{lecturer.lecturerRooms.length} ruangan</td>
            <td data-label="Ditinjau">{lecturer.reviewedBookings}</td>
            <td data-label="Terdaftar">{fmtDate(lecturer.createdAt)}</td>
            <td data-label="Status"><span class="badge {lecturer.isActive ? 'approved' : 'neutral'}"><i></i>{lecturer.isActive ? 'Aktif' : 'Nonaktif'}</span></td>
            <td class="no-label"><div class="actions"><button class="btn btn-ghost btn-sm" onclick={() => openAssignments(lecturer)}>Atur ruangan</button><button class="btn btn-ghost btn-sm" onclick={() => toggleStatus(lecturer)} disabled={updatingId === lecturer.id}>{lecturer.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button></div></td>
          </tr>
        {/each}</tbody>
      </table></div>
    {/if}
  </section>
</div>

<Modal open={target !== null} title="Penugasan ruangan" subtitle={target?.name} onclose={() => (target = null)}>
  <p class="assign-help">Dosen dapat meninjau pengajuan untuk ruangan yang dipilih. Administrator tetap dapat menyetujui semua ruangan.</p>
  <div class="room-list">
    {#each rooms as room (room.id)}
      <label class="room-option">
        <input type="checkbox" checked={selectedRoomIds.includes(room.id)} onchange={() => toggleRoom(room.id)} />
        <span><b>{room.name}</b><small>{room.code} · {room.location}{room.isActive ? '' : ' · Nonaktif'}</small></span>
      </label>
    {/each}
  </div>
  {#snippet footer()}
    <button class="btn btn-ghost" onclick={() => (target = null)} disabled={savingRooms}>Batal</button>
    <button class="btn btn-primary" onclick={saveAssignments} disabled={savingRooms}>{#if savingRooms}<span class="spinner"></span>{/if} Simpan penugasan</button>
  {/snippet}
</Modal>

<style>
  .create-card { margin-bottom:16px; }
  .create-form { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)) auto; gap:12px; align-items:end; padding:16px 18px; }
  .create-form label { display:grid; gap:6px; color:var(--ink-2); font-size:12px; font-weight:600; }
  .filters { padding:14px 18px; border-bottom:1px solid var(--line-2); }
  .input-search { width:min(440px,100%); }
  .inline-error { padding:12px 16px; color:var(--bad); background:var(--bad-bg); border-radius:12px; margin-bottom:12px; font-size:13px; }
  .actions { display:flex; gap:4px; }
  .assign-help { color:var(--ink-2); font-size:13px; line-height:1.55; }
  .room-list { display:grid; max-height:50vh; overflow:auto; border:1px solid var(--line); border-radius:12px; }
  .room-option { display:flex; align-items:center; gap:12px; padding:12px; border-bottom:1px solid var(--line-2); cursor:pointer; }
  .room-option:last-child { border-bottom:0; }
  .room-option span { display:grid; gap:3px; }
  .room-option b { color:var(--navy); font-size:13px; }
  .room-option small { color:var(--ink-2); font-size:11px; }
  @media(max-width:900px) { .create-form { grid-template-columns:1fr 1fr; } }
  @media(max-width:560px) { .create-form { grid-template-columns:1fr; } }
</style>
