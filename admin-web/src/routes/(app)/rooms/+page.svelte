<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from '../../../lib/components/Modal.svelte';
  import EmptyState from '../../../lib/components/EmptyState.svelte';
  import ErrorState from '../../../lib/components/ErrorState.svelte';
  import Icon from '../../../lib/components/Icon.svelte';
  import { apiRequest, ApiError, assetUrl, qs } from '../../../lib/api';
  import { handleApiError } from '../../../lib/stores/app.svelte';
  import { confirmDialog } from '../../../lib/stores/confirm.svelte';
  import { toastSuccess, toastError } from '../../../lib/stores/toast.svelte';
  import { debounce } from '../../../lib/utils';

  type FormState = { name: string; code: string; location: string; capacity: string; facilities: string; description: string; isActive: boolean; isAvailable: boolean };
  const blank = (): FormState => ({ name: '', code: '', location: '', capacity: '', facilities: '', description: '', isActive: true, isAvailable: true });

  let rooms = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let q = $state('');
  let showInactive = $state('');

  let formOpen = $state(false);
  let editing = $state<any>(null);
  let form = $state<FormState>(blank());
  let fieldErrors = $state<Record<string, string>>({});
  let saving = $state(false);
  let photoFile = $state<File | null>(null);
  let photoPreview = $state<string | null>(null);
  let removePhoto = $state(false);

  async function load() {
    loading = true;
    error = '';
    try {
      rooms = (await apiRequest(`/admin/rooms${qs({ q: q.trim(), isActive: showInactive })}`)).data;
    } catch (e) {
      error = handleApiError(e, 'Gagal memuat ruangan', true);
    } finally {
      loading = false;
    }
  }
  const search = debounce(load);

  function openCreate() {
    editing = null; form = blank(); fieldErrors = {}; photoFile = null; photoPreview = null; removePhoto = false; formOpen = true;
  }
  function openEdit(room: any) {
    editing = room;
    form = { name: room.name, code: room.code, location: room.location, capacity: String(room.capacity), facilities: room.facilities ?? '', description: room.description ?? '', isActive: room.isActive, isAvailable: room.isAvailable };
    fieldErrors = {}; photoFile = null; photoPreview = assetUrl(room.imageUrl); removePhoto = false; formOpen = true;
  }

  function pickPhoto(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toastError('Format foto harus JPG, PNG, atau WebP.'); return; }
    if (file.size > 3 * 1024 * 1024) { toastError('Ukuran foto maksimal 3 MB.'); return; }
    photoFile = file; removePhoto = false;
    photoPreview = URL.createObjectURL(file);
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = 'Nama minimal 2 karakter';
    if (form.code.trim().length < 2) errs.code = 'Kode minimal 2 karakter';
    if (form.location.trim().length < 2) errs.location = 'Lokasi wajib diisi';
    const cap = Number(form.capacity);
    if (!Number.isInteger(cap) || cap < 1) errs.capacity = 'Kapasitas harus bilangan bulat ≥ 1';
    fieldErrors = errs;
    return Object.keys(errs).length === 0;
  }

  async function save() {
    if (!validate()) return;
    saving = true;
    const body = {
      name: form.name.trim(), code: form.code.trim(), location: form.location.trim(), capacity: Number(form.capacity),
      facilities: form.facilities.trim(), description: form.description.trim(), isActive: form.isActive, isAvailable: form.isAvailable
    };
    try {
      const r = editing
        ? await apiRequest(`/admin/rooms/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await apiRequest('/admin/rooms', { method: 'POST', body: JSON.stringify(body) });
      const id = r.data.id;
      let photoFailed = '';
      if (photoFile) {
        try {
          const fd = new FormData(); fd.append('photo', photoFile);
          await apiRequest(`/admin/rooms/${id}/photo`, { method: 'POST', body: fd });
        } catch (e) { photoFailed = e instanceof Error ? e.message : 'Upload foto gagal'; }
      } else if (removePhoto && editing?.imageUrl) {
        await apiRequest(`/admin/rooms/${id}/photo`, { method: 'DELETE' });
      }
      toastSuccess(editing ? 'Ruangan berhasil diperbarui' : 'Ruangan berhasil ditambahkan');
      if (photoFailed) toastError(`Ruangan tersimpan, tetapi foto gagal diunggah: ${photoFailed}`);
      formOpen = false;
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.errors) fieldErrors = e.errors;
      handleApiError(e);
    } finally {
      saving = false;
    }
  }

  async function toggleActive(room: any) {
    const next = !room.isActive;
    const ok = await confirmDialog({
      title: next ? 'Aktifkan ruangan?' : 'Nonaktifkan ruangan?',
      message: next ? `"${room.name}" akan kembali bisa dipinjam.` : `"${room.name}" tidak akan tampil dan tidak bisa dipinjam mahasiswa.`,
      confirmLabel: next ? 'Aktifkan' : 'Nonaktifkan', tone: next ? 'default' : 'danger'
    });
    if (!ok) return;
    try {
      await apiRequest(`/admin/rooms/${room.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: next }) });
      toastSuccess(next ? 'Ruangan diaktifkan' : 'Ruangan dinonaktifkan');
      load();
    } catch (e) { handleApiError(e); }
  }

  async function remove(room: any) {
    const ok = await confirmDialog({ title: 'Hapus ruangan?', message: `"${room.name}" akan dihapus permanen. Ruangan yang sudah punya riwayat peminjaman tidak bisa dihapus (nonaktifkan saja).`, confirmLabel: 'Hapus', tone: 'danger' });
    if (!ok) return;
    try {
      await apiRequest(`/admin/rooms/${room.id}`, { method: 'DELETE' });
      toastSuccess('Ruangan dihapus');
      load();
    } catch (e) { handleApiError(e); }
  }

  const chips = (f: string | null) => (f ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  onMount(load);
</script>

<svelte:head><title>Ruangan — RuangKu Admin</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <div class="kicker">Pengelolaan</div>
      <h1 class="page-title">Manajemen ruangan</h1>
      <p class="page-desc">Kelola data ruangan, foto, fasilitas, serta status ketersediaan.</p>
    </div>
    <button class="btn btn-primary" onclick={openCreate}><Icon name="plus" size={16} /> Tambah ruangan</button>
  </div>

  <div class="toolbar">
    <input class="input input-search grow" placeholder="Cari nama, kode, atau lokasi…" bind:value={q} oninput={search} aria-label="Cari ruangan" />
    <select class="select sel" bind:value={showInactive} onchange={load} aria-label="Filter status">
      <option value="">Semua ruangan</option><option value="true">Hanya aktif</option><option value="false">Hanya nonaktif</option>
    </select>
  </div>

  {#if loading && rooms.length === 0}
    <div class="grid">{#each Array(6) as _}<div class="card sk"><div class="skeleton ph"></div><div class="skeleton l1"></div><div class="skeleton l2"></div></div>{/each}</div>
  {:else if error}
    <div class="card"><ErrorState message={error} onretry={load} /></div>
  {:else if rooms.length === 0}
    <div class="card"><EmptyState icon="rooms" title="Belum ada ruangan" message="Tambahkan ruangan pertama agar mahasiswa bisa mengajukan peminjaman.">
      <button class="btn btn-primary btn-sm" onclick={openCreate}><Icon name="plus" size={14} /> Tambah ruangan</button></EmptyState></div>
  {:else}
    <div class="grid">
      {#each rooms as r (r.id)}
        <article class="card room" class:off={!r.isActive}>
          <div class="photo">
            {#if r.imageUrl}<img src={assetUrl(r.imageUrl)} alt="Foto {r.name}" loading="lazy" />{:else}<div class="noimg"><Icon name="image" size={30} /><span>{r.code}</span></div>{/if}
            <div class="tags">
              {#if !r.isActive}<span class="badge neutral">Nonaktif</span>
              {:else if r.inUseNow}<span class="badge pending"><i></i>Sedang dipakai</span>
              {:else if r.isAvailable}<span class="badge approved"><i></i>Tersedia</span>
              {:else}<span class="badge rejected"><i></i>Tidak tersedia</span>{/if}
            </div>
          </div>
          <div class="info">
            <div class="row-between"><h3>{r.name}</h3><span class="code">{r.code}</span></div>
            <div class="meta"><span><Icon name="pin" size={14} /> {r.location}</span><span><Icon name="users" size={14} /> {r.capacity} orang</span></div>
            {#if chips(r.facilities).length}
              <div class="chips">{#each chips(r.facilities).slice(0, 4) as f}<span>{f}</span>{/each}{#if chips(r.facilities).length > 4}<span>+{chips(r.facilities).length - 4}</span>{/if}</div>
            {/if}
            <div class="foot">
              <span class="muted tiny">{r.totalBookings} peminjaman</span>
              <div class="acts">
                <button class="btn btn-ghost btn-sm" onclick={() => openEdit(r)}><Icon name="edit" size={14} /> Edit</button>
                <button class="btn btn-ghost btn-sm" onclick={() => toggleActive(r)}>{r.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button>
                <button class="btn btn-danger btn-sm btn-icon" onclick={() => remove(r)} aria-label="Hapus {r.name}"><Icon name="trash" size={14} /></button>
              </div>
            </div>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<Modal open={formOpen} title={editing ? 'Edit ruangan' : 'Tambah ruangan'} subtitle="Data ini ditampilkan ke mahasiswa saat memilih ruangan." size="lg" onclose={() => (formOpen = false)}>
  <div class="form">
    <div class="field"><label for="r-name">Nama ruangan *</label><input id="r-name" class="input {fieldErrors.name ? 'invalid' : ''}" bind:value={form.name} maxlength="100" placeholder="Contoh: Ruang Diskusi A" />{#if fieldErrors.name}<span class="err-text">{fieldErrors.name}</span>{/if}</div>
    <div class="field"><label for="r-code">Kode *</label><input id="r-code" class="input {fieldErrors.code ? 'invalid' : ''}" bind:value={form.code} maxlength="30" placeholder="RD-A1" style="text-transform: uppercase" />{#if fieldErrors.code}<span class="err-text">{fieldErrors.code}</span>{/if}</div>
    <div class="field"><label for="r-loc">Lokasi *</label><input id="r-loc" class="input {fieldErrors.location ? 'invalid' : ''}" bind:value={form.location} maxlength="150" placeholder="Gedung Rektorat, Lt. 2" />{#if fieldErrors.location}<span class="err-text">{fieldErrors.location}</span>{/if}</div>
    <div class="field"><label for="r-cap">Kapasitas *</label><input id="r-cap" type="number" min="1" class="input {fieldErrors.capacity ? 'invalid' : ''}" bind:value={form.capacity} placeholder="20" />{#if fieldErrors.capacity}<span class="err-text">{fieldErrors.capacity}</span>{/if}</div>
    <div class="field full"><label for="r-fac">Fasilitas</label><input id="r-fac" class="input" bind:value={form.facilities} maxlength="1000" placeholder="Pisahkan dengan koma: Proyektor, AC, Whiteboard" /></div>
    <div class="field full"><label for="r-desc">Deskripsi</label><textarea id="r-desc" class="textarea" bind:value={form.description} maxlength="2000" placeholder="Keterangan singkat tentang ruangan"></textarea></div>

    <div class="field full">
      <span class="label">Foto ruangan</span>
      <div class="photo-edit">
        <div class="pv">{#if photoPreview && !removePhoto}<img src={photoPreview} alt="Pratinjau foto" />{:else}<Icon name="image" size={28} />{/if}</div>
        <div class="pbtn">
          <label class="btn btn-ghost btn-sm"><Icon name="upload" size={14} /> Pilih foto<input type="file" accept="image/jpeg,image/png,image/webp" onchange={pickPhoto} hidden /></label>
          {#if photoPreview && !removePhoto}<button type="button" class="btn btn-danger btn-sm" onclick={() => { removePhoto = true; photoFile = null; }}>Hapus foto</button>{/if}
          <span class="hint">JPG, PNG, atau WebP · maks. 3 MB</span>
        </div>
      </div>
    </div>

    <div class="full switches">
      <label class="switch"><input type="checkbox" bind:checked={form.isActive} /> Ruangan aktif (tampil ke mahasiswa)</label>
      <label class="switch"><input type="checkbox" bind:checked={form.isAvailable} /> Tersedia untuk dipinjam</label>
    </div>
  </div>
  {#snippet footer()}
    <button class="btn btn-ghost" onclick={() => (formOpen = false)} disabled={saving}>Batal</button>
    <button class="btn btn-primary" onclick={save} disabled={saving}>{#if saving}<span class="spinner"></span>{/if} {editing ? 'Simpan perubahan' : 'Tambah ruangan'}</button>
  {/snippet}
</Modal>

<style>
  .sel { max-width: 200px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 18px; }
  .room { overflow: hidden; transition: transform .25s var(--ease), box-shadow .25s var(--ease); display: flex; flex-direction: column; }
  .room:hover { transform: translateY(-3px); box-shadow: var(--shadow); }
  .room.off { opacity: .72; }
  .photo { position: relative; height: 168px; background: linear-gradient(135deg, var(--navy-2), var(--navy-3)); }
  .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .noimg { height: 100%; display: grid; place-content: center; justify-items: center; gap: 6px; color: var(--gold-soft); font-size: 20px; }
  .tags { position: absolute; top: 12px; left: 12px; }
  .info { display: grid; gap: 11px; padding: 16px 18px 16px; flex: 1; }
  h3 { font-size: 18px; color: var(--navy); }
  .code { font-size: 11px; font-weight: 700; letter-spacing: .06em; padding: 3px 8px; border-radius: 7px; background: var(--gold-tint); color: var(--gold-deep); }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: var(--ink-3); } .meta span { display: inline-flex; align-items: center; gap: 5px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; } .chips span { padding: 3px 9px; border-radius: 99px; background: #f3f1ea; font-size: 11.5px; color: var(--ink-2); }
  .foot { margin-top: auto; padding-top: 12px; border-top: 1px solid var(--line-2); display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .acts { display: flex; gap: 6px; } .tiny { font-size: 12px; }
  .sk { padding: 0 0 18px; } .ph { height: 168px; border-radius: 0; } .l1, .l2 { height: 14px; margin: 14px 18px 0; } .l2 { width: 55%; }
  .form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .full { grid-column: 1 / -1; }
  .switches { display: flex; gap: 24px; flex-wrap: wrap; padding-top: 4px; }
  .photo-edit { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  .pv { width: 120px; height: 84px; border-radius: 12px; border: 1px dashed var(--gold-soft); background: #fbf8f0; display: grid; place-items: center; overflow: hidden; color: var(--gold); }
  .pv img { width: 100%; height: 100%; object-fit: cover; }
  .pbtn { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .pbtn label { cursor: pointer; }
  @media (max-width: 640px) { .form { grid-template-columns: 1fr; } .sel { max-width: none; width: 100%; } }
</style>
