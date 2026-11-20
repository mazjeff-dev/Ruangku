<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../../lib/components/Icon.svelte';
  import PasswordInput from '../../../lib/components/PasswordInput.svelte';
  import { apiRequest, ApiError } from '../../../lib/api';
  import { app, handleApiError, logout, saveSessionUser } from '../../../lib/stores/app.svelte';
  import { confirmDialog } from '../../../lib/stores/confirm.svelte';
  import { toastSuccess } from '../../../lib/stores/toast.svelte';
  import { fmtDateTime, initials } from '../../../lib/utils';

  let name = $state(app.user?.name ?? '');
  let email = $state(app.user?.email ?? '');
  let emailNotifications = $state(app.user?.emailNotifications ?? true);
  let profileErrors = $state<Record<string, string>>({});
  let savingProfile = $state(false);

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let showPw = $state(false);
  let pwErrors = $state<Record<string, string>>({});
  let savingPw = $state(false);

  let info = $state<any>(null);

  type BookingRules = { minMinutes: number; maxHours: number; maxDaysAhead: number; maxActiveBookings: number; maxQueueEntries: number };
  let bookingRules = $state<BookingRules>({ minMinutes: 30, maxHours: 8, maxDaysAhead: 90, maxActiveBookings: 3, maxQueueEntries: 3 });
  let rulesSource = $state<'admin' | 'environment'>('environment');
  let savingRules = $state(false);
  let rulesErrors = $state<Record<string, string>>({});
  const weekdays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  let globalHours = $state({ openTime: '07:00', closeTime: '21:00', operatingDays: [1, 2, 3, 4, 5, 6] });
  let rooms = $state<any[]>([]);
  let selectedRoomId = $state('');
  let roomHours = $state<Array<{ dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }>>([]);
  let closures = $state<any[]>([]);
  let closureForm = $state({ roomId: '', startDate: '', endDate: '', reason: '' });
  let editingClosureId = $state<number | null>(null);
  let savingSchedule = $state(false);

  async function loadOperatingSettings() {
    try {
      const [globalResult, roomResult, closureResult] = await Promise.all([
        apiRequest('/admin/settings/operating-hours'),
        apiRequest('/admin/rooms'),
        apiRequest('/admin/closures')
      ]);
      globalHours = globalResult.data;
      rooms = roomResult.data;
      closures = closureResult.data;
      if (rooms.length && !selectedRoomId) {
        selectedRoomId = String(rooms[0].id);
        await loadRoomHours();
      }
    } catch (e) { handleApiError(e, 'Gagal memuat jam operasional dan penutupan', true); }
  }

  async function loadRoomHours() {
    if (!selectedRoomId) return;
    try {
      const result = await apiRequest(`/admin/rooms/${selectedRoomId}/operating-hours`);
      const overrides = new Map<number, any>(result.data.map((hour: any) => [hour.dayOfWeek, hour]));
      roomHours = weekdays.map((_, dayOfWeek) => overrides.get(dayOfWeek) ?? ({
        dayOfWeek,
        openTime: globalHours.openTime,
        closeTime: globalHours.closeTime,
        isClosed: !globalHours.operatingDays.includes(dayOfWeek)
      }));
    } catch (e) { handleApiError(e, 'Gagal memuat jam ruangan', true); }
  }

  async function saveGlobalHours() {
    savingSchedule = true;
    try {
      const result = await apiRequest('/admin/settings/operating-hours', {
        method: 'PUT',
        body: JSON.stringify(globalHours)
      });
      globalHours = result.data;
      toastSuccess(result.message);
    } catch (e) { handleApiError(e); }
    finally { savingSchedule = false; }
  }

  async function saveRoomHours() {
    if (!selectedRoomId) return;
    savingSchedule = true;
    try {
      const result = await apiRequest(`/admin/rooms/${selectedRoomId}/operating-hours`, {
        method: 'PUT',
        body: JSON.stringify({ hours: roomHours })
      });
      roomHours = result.data;
      toastSuccess(result.message);
    } catch (e) { handleApiError(e); }
    finally { savingSchedule = false; }
  }

  async function resetRoomHours() {
    if (!selectedRoomId || !await confirmDialog({ title: 'Hapus override jam ruangan?', message: 'Ruangan akan kembali mengikuti jam operasional global.', confirmLabel: 'Gunakan jam global' })) return;
    savingSchedule = true;
    try {
      const result = await apiRequest(`/admin/rooms/${selectedRoomId}/operating-hours`, { method: 'DELETE' });
      await loadRoomHours();
      toastSuccess(result.message);
    } catch (e) { handleApiError(e); }
    finally { savingSchedule = false; }
  }

  async function saveClosure(confirmAffected = false) {
    const body = {
      roomId: closureForm.roomId ? Number(closureForm.roomId) : null,
      startDate: closureForm.startDate,
      endDate: closureForm.endDate,
      reason: closureForm.reason.trim(),
      confirmAffected
    };
    savingSchedule = true;
    try {
      const url = editingClosureId ? `/admin/closures/${editingClosureId}` : '/admin/closures';
      const result = await apiRequest(url, { method: editingClosureId ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      closures = (await apiRequest('/admin/closures')).data;
      editingClosureId = null;
      closureForm = { roomId: '', startDate: '', endDate: '', reason: '' };
      toastSuccess(result.message);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && !confirmAffected) {
        const affected = (e.details?.affectedBookings as any[] | undefined) ?? [];
        const list = affected.slice(0, 8).map((booking) => `• ${booking.title} — ${booking.room.name}`).join('\\n');
        if (affected.length && await confirmDialog({
          title: 'Batalkan peminjaman terdampak?',
          message: `${e.message}\\n\\n${list}${affected.length > 8 ? `\\n…dan ${affected.length - 8} lainnya` : ''}`,
          confirmLabel: `Batalkan ${affected.length} peminjaman`,
          tone: 'danger'
        })) await saveClosure(true);
      } else handleApiError(e);
    } finally { savingSchedule = false; }
  }

  async function removeClosure(id: number) {
    if (!await confirmDialog({ title: 'Hapus penutupan?', message: 'Jadwal penutupan ini akan dihapus.', confirmLabel: 'Hapus', tone: 'danger' })) return;
    try {
      const result = await apiRequest(`/admin/closures/${id}`, { method: 'DELETE' });
      closures = (await apiRequest('/admin/closures')).data;
      toastSuccess(result.message);
    } catch (e) { handleApiError(e); }
  }

  function editClosure(closure: any) {
    editingClosureId = closure.id;
    closureForm = {
      roomId: closure.roomId ? String(closure.roomId) : '',
      startDate: closure.startDate.slice(0, 10),
      endDate: closure.endDate.slice(0, 10),
      reason: closure.reason
    };
  }

  async function saveProfile() {
    profileErrors = {};
    if (name.trim().length < 2) profileErrors.name = 'Nama minimal 2 karakter';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) profileErrors.email = 'Format email tidak valid';
    if (Object.keys(profileErrors).length) return;
    savingProfile = true;
    try {
      const r = await apiRequest('/users/profile', { method: 'PATCH', body: JSON.stringify({ name: name.trim(), email: email.trim(), emailNotifications }) });
      saveSessionUser(r.data);
      name = r.data.name; email = r.data.email;
      toastSuccess(r.message);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) profileErrors.email = e.message;
      else handleApiError(e);
    } finally { savingProfile = false; }
  }

  async function savePassword() {
    pwErrors = {};
    if (!currentPassword) pwErrors.current = 'Password saat ini wajib diisi';
    if (newPassword.length < 8) pwErrors.next = 'Password baru minimal 8 karakter';
    else if (newPassword === currentPassword) pwErrors.next = 'Password baru harus berbeda dari yang lama';
    if (confirmPassword !== newPassword) pwErrors.confirm = 'Konfirmasi password tidak cocok';
    if (Object.keys(pwErrors).length) return;
    savingPw = true;
    try {
      const r = await apiRequest('/users/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) });
      toastSuccess(r.message);
      currentPassword = newPassword = confirmPassword = '';
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) pwErrors.current = e.message;
      else handleApiError(e);
    } finally { savingPw = false; }
  }

  async function saveBookingRules() {
    rulesErrors = {};
    if (!Number.isInteger(bookingRules.minMinutes) || bookingRules.minMinutes < 1 || bookingRules.minMinutes > 1440) rulesErrors.minMinutes = 'Masukkan 1–1440 menit';
    if (!Number.isInteger(bookingRules.maxHours) || bookingRules.maxHours < 1 || bookingRules.maxHours > 168) rulesErrors.maxHours = 'Masukkan 1–168 jam';
    if (!Number.isInteger(bookingRules.maxDaysAhead) || bookingRules.maxDaysAhead < 1 || bookingRules.maxDaysAhead > 365) rulesErrors.maxDaysAhead = 'Masukkan 1–365 hari';
    if (!Number.isInteger(bookingRules.maxActiveBookings) || bookingRules.maxActiveBookings < 1 || bookingRules.maxActiveBookings > 20) rulesErrors.maxActiveBookings = 'Masukkan 1–20 booking';
    if (!Number.isInteger(bookingRules.maxQueueEntries) || bookingRules.maxQueueEntries < 1 || bookingRules.maxQueueEntries > 20) rulesErrors.maxQueueEntries = 'Masukkan 1–20 antrean';
    if (bookingRules.minMinutes > bookingRules.maxHours * 60) rulesErrors.minMinutes = 'Durasi minimum tidak boleh melebihi maksimum';
    if (Object.keys(rulesErrors).length) return;
    savingRules = true;
    try {
      const result = await apiRequest('/admin/settings/booking-rules', {
        method: 'PUT',
        body: JSON.stringify(bookingRules)
      });
      bookingRules = {
        minMinutes: result.data.minMinutes,
        maxHours: result.data.maxHours,
        maxDaysAhead: result.data.maxDaysAhead,
        maxActiveBookings: result.data.maxActiveBookings,
        maxQueueEntries: result.data.maxQueueEntries
      };
      rulesSource = 'admin';
      toastSuccess(result.message);
    } catch (e) {
      handleApiError(e);
    } finally { savingRules = false; }
  }

  async function restoreBookingRuleDefaults() {
    if (!await confirmDialog({
      title: 'Kembalikan aturan default?',
      message: 'Nilai yang disimpan administrator akan dihapus dan aturan kembali ke default backend.',
      confirmLabel: 'Kembalikan default'
    })) return;
    savingRules = true;
    try {
      const result = await apiRequest('/admin/settings/booking-rules', { method: 'DELETE' });
      bookingRules = result.data;
      rulesSource = 'environment';
      toastSuccess(result.message);
    } catch (e) {
      handleApiError(e);
    } finally { savingRules = false; }
  }

  async function askLogout() {
    if (await confirmDialog({ title: 'Keluar dari RuangKu?', message: 'Sesi administrator Anda akan diakhiri di perangkat ini.', confirmLabel: 'Keluar' })) logout();
  }

  const strength = $derived(Math.min(4, (newPassword.length >= 8 ? 1 : 0) + (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) ? 1 : 0) + (/\d/.test(newPassword) ? 1 : 0) + (/[^A-Za-z0-9]/.test(newPassword) ? 1 : 0)));

  onMount(async () => {
    try { info = (await apiRequest('/admin/app-info')).data; } catch (e) { handleApiError(e, '', true); }
    try {
      const result = (await apiRequest('/admin/settings/booking-rules')).data;
      bookingRules = result.rules;
      rulesSource = result.source;
    } catch (e) { handleApiError(e, '', true); }
    await loadOperatingSettings();
  });
</script>

<svelte:head><title>Pengaturan — RuangKu Admin</title></svelte:head>

<div class="page">
  <div class="page-head"><div><div class="kicker">Akun</div><h1 class="page-title">Pengaturan</h1><p class="page-desc">Kelola profil administrator, keamanan akun, dan informasi aplikasi.</p></div></div>

  <section class="card card-pad rules-card">
    <div class="rules-heading"><div><h2 class="card-title">Aturan peminjaman</h2><p class="card-sub">Batas ini divalidasi server untuk pengajuan dan perpanjangan.</p></div><span class="badge gold">Sumber: {rulesSource === 'admin' ? 'Administrator' : 'Environment'}</span></div>
    <form onsubmit={(e) => { e.preventDefault(); saveBookingRules(); }} class="rules-form">
      <div class="field"><label for="rule-min">Durasi minimum (menit)</label><input id="rule-min" type="number" class="input {rulesErrors.minMinutes ? 'invalid' : ''}" bind:value={bookingRules.minMinutes} min="1" max="1440" />{#if rulesErrors.minMinutes}<span class="err-text">{rulesErrors.minMinutes}</span>{/if}</div>
      <div class="field"><label for="rule-max">Durasi maksimum (jam)</label><input id="rule-max" type="number" class="input {rulesErrors.maxHours ? 'invalid' : ''}" bind:value={bookingRules.maxHours} min="1" max="168" />{#if rulesErrors.maxHours}<span class="err-text">{rulesErrors.maxHours}</span>{/if}</div>
      <div class="field"><label for="rule-days">Maksimal hari ke depan</label><input id="rule-days" type="number" class="input {rulesErrors.maxDaysAhead ? 'invalid' : ''}" bind:value={bookingRules.maxDaysAhead} min="1" max="365" />{#if rulesErrors.maxDaysAhead}<span class="err-text">{rulesErrors.maxDaysAhead}</span>{/if}</div>
      <div class="field"><label for="rule-active">Maksimal booking aktif per pengguna</label><input id="rule-active" type="number" class="input {rulesErrors.maxActiveBookings ? 'invalid' : ''}" bind:value={bookingRules.maxActiveBookings} min="1" max="20" />{#if rulesErrors.maxActiveBookings}<span class="err-text">{rulesErrors.maxActiveBookings}</span>{/if}</div>
      <div class="field"><label for="rule-queue">Maksimal antrean aktif per pengguna</label><input id="rule-queue" type="number" class="input {rulesErrors.maxQueueEntries ? 'invalid' : ''}" bind:value={bookingRules.maxQueueEntries} min="1" max="20" />{#if rulesErrors.maxQueueEntries}<span class="err-text">{rulesErrors.maxQueueEntries}</span>{/if}</div>
      <div class="rules-action">
        <button class="btn btn-primary" type="submit" disabled={savingRules}>{#if savingRules}<span class="spinner"></span>{/if} Simpan aturan</button>
        {#if rulesSource === 'admin'}<button class="btn btn-secondary" type="button" onclick={restoreBookingRuleDefaults} disabled={savingRules}>Kembalikan default environment</button>{/if}
      </div>
    </form>
  </section>

  <section class="card card-pad rules-card">
    <div class="rules-heading"><div><h2 class="card-title">Jam operasional ruangan</h2><p class="card-sub">Zona waktu Asia/Jakarta. Ruangan tanpa override mengikuti jam global.</p></div></div>
    <div class="schedule-settings">
      <div>
        <h3>Jam global</h3>
        <div class="time-fields">
          <label class="field"><span>Jam buka</span><input class="input" type="time" bind:value={globalHours.openTime} /></label>
          <label class="field"><span>Jam tutup</span><input class="input" type="time" bind:value={globalHours.closeTime} /></label>
        </div>
        <div class="days">
          {#each weekdays as day, index}
            <label><input type="checkbox" checked={globalHours.operatingDays.includes(index)} onchange={(event) => {
              const next = new Set(globalHours.operatingDays);
              if (event.currentTarget.checked) next.add(index); else next.delete(index);
              globalHours.operatingDays = [...next].sort((a, b) => a - b);
            }} /> {day}</label>
          {/each}
        </div>
        <button class="btn btn-primary" type="button" onclick={saveGlobalHours} disabled={savingSchedule}>Simpan jam global</button>
      </div>
      <div>
        <h3>Override per ruangan</h3>
        <label class="field"><span>Ruangan</span><select class="select" bind:value={selectedRoomId} onchange={loadRoomHours}>{#each rooms as room (room.id)}<option value={room.id}>{room.name}</option>{/each}</select></label>
        {#if selectedRoomId}
          <div class="room-hours">
            {#each roomHours as hour (hour.dayOfWeek)}
              <div class="room-hour">
                <b>{weekdays[hour.dayOfWeek]}</b>
                <input class="input" type="time" bind:value={hour.openTime} disabled={hour.isClosed} aria-label="Jam buka {weekdays[hour.dayOfWeek]}" />
                <input class="input" type="time" bind:value={hour.closeTime} disabled={hour.isClosed} aria-label="Jam tutup {weekdays[hour.dayOfWeek]}" />
                <label><input type="checkbox" bind:checked={hour.isClosed} /> Tutup</label>
              </div>
            {/each}
          </div>
          <div class="rules-action">
            <button class="btn btn-primary" type="button" onclick={saveRoomHours} disabled={savingSchedule}>Simpan override</button>
            <button class="btn btn-secondary" type="button" onclick={resetRoomHours} disabled={savingSchedule}>Gunakan jam global</button>
          </div>
        {/if}
      </div>
    </div>
  </section>

  <section class="card card-pad rules-card">
    <div class="rules-heading"><div><h2 class="card-title">Penutupan terjadwal</h2><p class="card-sub">Penutupan satu ruangan atau seluruh ruangan, termasuk konfirmasi booking yang terdampak.</p></div></div>
    <form class="closure-form" onsubmit={(event) => { event.preventDefault(); saveClosure(); }}>
      <label class="field"><span>Ruangan</span><select class="select" bind:value={closureForm.roomId}><option value="">Semua ruangan</option>{#each rooms as room (room.id)}<option value={room.id}>{room.name}</option>{/each}</select></label>
      <label class="field"><span>Tanggal mulai</span><input class="input" type="date" bind:value={closureForm.startDate} required /></label>
      <label class="field"><span>Tanggal selesai</span><input class="input" type="date" bind:value={closureForm.endDate} required /></label>
      <label class="field reason"><span>Alasan penutupan</span><input class="input" bind:value={closureForm.reason} minlength="3" maxlength="500" required /></label>
      <div class="rules-action">
        <button class="btn btn-primary" type="submit" disabled={savingSchedule || !closureForm.startDate || !closureForm.endDate}>{editingClosureId ? 'Simpan perubahan' : 'Tambah penutupan'}</button>
        {#if editingClosureId}<button class="btn btn-secondary" type="button" onclick={() => { editingClosureId = null; closureForm = { roomId: '', startDate: '', endDate: '', reason: '' }; }}>Batal edit</button>{/if}
      </div>
    </form>
    {#if closures.length}
      <div class="closure-list">
        {#each closures as closure (closure.id)}
          <div class="closure-row">
            <span><b>{closure.room?.name ?? 'Semua ruangan'}</b><small>{closure.startDate.slice(0, 10)} – {closure.endDate.slice(0, 10)}</small></span>
            <span class="closure-reason">{closure.reason}</span>
            <span class="closure-actions"><button class="btn btn-secondary btn-sm" type="button" onclick={() => editClosure(closure)}>Ubah</button><button class="btn btn-danger btn-sm" type="button" onclick={() => removeClosure(closure.id)}>Hapus</button></span>
          </div>
        {/each}
      </div>
    {:else}<p class="card-sub">Belum ada penutupan terjadwal.</p>{/if}
  </section>

  <div class="cols">
    <section class="card card-pad">
      <div class="row hd"><span class="avatar big">{initials(app.user?.name ?? 'A')}</span><div><h2 class="card-title">Profil administrator</h2><p class="card-sub">Peran: Administrator</p></div></div>
      <form onsubmit={(e) => { e.preventDefault(); saveProfile(); }} class="form">
        <div class="field"><label for="s-name">Nama lengkap</label><input id="s-name" class="input {profileErrors.name ? 'invalid' : ''}" bind:value={name} maxlength="100" autocomplete="name" />{#if profileErrors.name}<span class="err-text">{profileErrors.name}</span>{/if}</div>
        <div class="field"><label for="s-email">Email</label><input id="s-email" type="email" class="input {profileErrors.email ? 'invalid' : ''}" bind:value={email} maxlength="150" autocomplete="email" />{#if profileErrors.email}<span class="err-text">{profileErrors.email}</span>{/if}</div>
        <label class="switch"><input type="checkbox" bind:checked={emailNotifications} /> Terima notifikasi melalui email</label>
        <div><button class="btn btn-primary" type="submit" disabled={savingProfile}>{#if savingProfile}<span class="spinner"></span>{/if} Simpan profil</button></div>
      </form>
    </section>

    <section class="card card-pad">
      <div class="row hd"><span class="avatar big gold"><Icon name="key" size={20} /></span><div><h2 class="card-title">Ubah password</h2><p class="card-sub">Gunakan minimal 8 karakter.</p></div></div>
      <form onsubmit={(e) => { e.preventDefault(); savePassword(); }} class="form">
        <div class="field"><label for="p-cur">Password saat ini</label><PasswordInput id="p-cur" inputClass="input {pwErrors.current ? 'invalid' : ''}" bind:value={currentPassword} bind:visible={showPw} autocomplete="current-password" invalid={!!pwErrors.current} />{#if pwErrors.current}<span class="err-text">{pwErrors.current}</span>{/if}</div>
        <div class="field"><label for="p-new">Password baru</label><PasswordInput id="p-new" inputClass="input {pwErrors.next ? 'invalid' : ''}" bind:value={newPassword} bind:visible={showPw} maxlength={72} autocomplete="new-password" invalid={!!pwErrors.next} />
          {#if newPassword}<div class="meter" aria-hidden="true">{#each [1, 2, 3, 4] as i}<i class:on={strength >= i}></i>{/each}</div>{/if}
          {#if pwErrors.next}<span class="err-text">{pwErrors.next}</span>{/if}</div>
        <div class="field"><label for="p-conf">Konfirmasi password baru</label><PasswordInput id="p-conf" inputClass="input {pwErrors.confirm ? 'invalid' : ''}" bind:value={confirmPassword} bind:visible={showPw} maxlength={72} autocomplete="new-password" invalid={!!pwErrors.confirm} />{#if pwErrors.confirm}<span class="err-text">{pwErrors.confirm}</span>{/if}</div>
        <label class="switch"><input type="checkbox" bind:checked={showPw} /> Tampilkan password</label>
        <div><button class="btn btn-primary" type="submit" disabled={savingPw}>{#if savingPw}<span class="spinner"></span>{/if} Perbarui password</button></div>
      </form>
    </section>
  </div>

  <div class="cols">
    <section class="card card-pad">
      <h2 class="card-title">Informasi aplikasi</h2>
      <dl>
        <div><dt>Aplikasi</dt><dd>{info?.name ?? 'RuangKu'} <span class="badge gold">v{info?.version ?? '—'}</span></dd></div>
        <div><dt>Tagline</dt><dd>{info?.tagline ?? 'Find Your Space. Make It Happen.'}</dd></div>
        <div><dt>Prefix API</dt><dd><code>{info?.apiPrefix ?? '/api/v1'}</code></dd></div>
        <div><dt>Zona waktu</dt><dd>{info?.timezone ?? 'Asia/Jakarta'}</dd></div>
        <div><dt>Database</dt><dd>{#if info}<span class="badge {info.database === 'terhubung' ? 'approved' : 'rejected'}"><i></i>{info.database}</span>{:else}…{/if}</dd></div>
        <div><dt>Waktu server</dt><dd>{info ? fmtDateTime(info.serverTime) + ' WIB' : '…'}</dd></div>
      </dl>
    </section>
    <section class="card card-pad out">
      <h2 class="card-title">Sesi</h2>
      <p class="card-sub">Keluar dari akun administrator di perangkat ini.</p>
      <div><button class="btn btn-danger" onclick={askLogout}><Icon name="logout" size={16} /> Keluar</button></div>
    </section>
  </div>
</div>

<style>
  .cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
  .rules-card { margin-bottom: 16px; }
  .rules-heading { display: flex; justify-content: space-between; gap: 16px; align-items: start; margin-bottom: 16px; }
  .rules-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: end; }
  .rules-action { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 10px; }
  .schedule-settings { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:28px; }
  .schedule-settings h3 { margin:0 0 12px; color:var(--navy); font-size:14px; }
  .time-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-bottom:12px; }
  .days { display:flex; flex-wrap:wrap; gap:10px 16px; margin:14px 0; color:var(--ink-2); font-size:12px; }
  .room-hours { display:grid; gap:8px; margin:14px 0; }
  .room-hour { display:grid; grid-template-columns:80px minmax(100px,1fr) minmax(100px,1fr) auto; gap:8px; align-items:center; font-size:12px; }
  .room-hour label { white-space:nowrap; }
  .closure-form { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; align-items:end; }
  .closure-form .reason { grid-column:span 2; }
  .closure-list { display:grid; margin-top:16px; }
  .closure-row { display:grid; grid-template-columns:minmax(150px,1fr) minmax(140px,2fr) auto; align-items:center; gap:14px; padding:12px 0; border-top:1px solid var(--line-2); font-size:12px; }
  .closure-row small { display:block; margin-top:4px; color:var(--ink-3); }
  .closure-reason { color:var(--ink-2); } .closure-actions { display:flex; gap:7px; }
  .hd { margin-bottom: 18px; } .big { width: 46px; height: 46px; font-size: 15px; } .gold { background: var(--gold-tint); color: var(--gold-deep); }
  .form { display: grid; gap: 16px; }
  .meter { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; } .meter i { height: 4px; border-radius: 4px; background: #e8e5db; } .meter i.on { background: var(--gold); }
  dl { margin: 14px 0 0; display: grid; } dl div { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line-2); } dl div:last-child { border: 0; }
  dt { color: var(--ink-3); font-size: 13px; } dd { margin: 0; font-weight: 600; color: var(--navy); font-size: 13px; text-align: right; } code { background: #f3f1ea; padding: 2px 7px; border-radius: 6px; }
  .out { display: grid; gap: 14px; }
  @media (max-width: 900px) { .cols,.schedule-settings { grid-template-columns: 1fr; } .rules-form,.closure-form { grid-template-columns: 1fr; } .closure-form .reason { grid-column:auto; } .room-hour { grid-template-columns:70px 1fr 1fr; } .room-hour label { grid-column:2 / -1; } .closure-row { grid-template-columns:1fr; } }
</style>
