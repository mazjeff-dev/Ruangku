<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../../lib/components/Icon.svelte';
  import { apiRequest, ApiError } from '../../../lib/api';
  import { app, handleApiError, logout, saveSessionUser } from '../../../lib/stores/app.svelte';
  import { confirmDialog } from '../../../lib/stores/confirm.svelte';
  import { toastSuccess } from '../../../lib/stores/toast.svelte';
  import { fmtDateTime, initials } from '../../../lib/utils';

  let name = $state(app.user?.name ?? '');
  let email = $state(app.user?.email ?? '');
  let profileErrors = $state<Record<string, string>>({});
  let savingProfile = $state(false);

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let showPw = $state(false);
  let pwErrors = $state<Record<string, string>>({});
  let savingPw = $state(false);

  let info = $state<any>(null);

  async function saveProfile() {
    profileErrors = {};
    if (name.trim().length < 2) profileErrors.name = 'Nama minimal 2 karakter';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) profileErrors.email = 'Format email tidak valid';
    if (Object.keys(profileErrors).length) return;
    savingProfile = true;
    try {
      const r = await apiRequest('/users/profile', { method: 'PATCH', body: JSON.stringify({ name: name.trim(), email: email.trim() }) });
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

  async function askLogout() {
    if (await confirmDialog({ title: 'Keluar dari RuangKu?', message: 'Sesi administrator Anda akan diakhiri di perangkat ini.', confirmLabel: 'Keluar' })) logout();
  }

  const strength = $derived(Math.min(4, (newPassword.length >= 8 ? 1 : 0) + (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) ? 1 : 0) + (/\d/.test(newPassword) ? 1 : 0) + (/[^A-Za-z0-9]/.test(newPassword) ? 1 : 0)));

  onMount(async () => {
    try { info = (await apiRequest('/admin/app-info')).data; } catch (e) { handleApiError(e, '', true); }
  });
</script>

<svelte:head><title>Pengaturan — RuangKu Admin</title></svelte:head>

<div class="page">
  <div class="page-head"><div><div class="kicker">Akun</div><h1 class="page-title">Pengaturan</h1><p class="page-desc">Kelola profil administrator, keamanan akun, dan informasi aplikasi.</p></div></div>

  <div class="cols">
    <section class="card card-pad">
      <div class="row hd"><span class="avatar big">{initials(app.user?.name ?? 'A')}</span><div><h2 class="card-title">Profil administrator</h2><p class="card-sub">Peran: Administrator</p></div></div>
      <form onsubmit={(e) => { e.preventDefault(); saveProfile(); }} class="form">
        <div class="field"><label for="s-name">Nama lengkap</label><input id="s-name" class="input {profileErrors.name ? 'invalid' : ''}" bind:value={name} maxlength="100" autocomplete="name" />{#if profileErrors.name}<span class="err-text">{profileErrors.name}</span>{/if}</div>
        <div class="field"><label for="s-email">Email</label><input id="s-email" type="email" class="input {profileErrors.email ? 'invalid' : ''}" bind:value={email} maxlength="150" autocomplete="email" />{#if profileErrors.email}<span class="err-text">{profileErrors.email}</span>{/if}</div>
        <div><button class="btn btn-primary" type="submit" disabled={savingProfile}>{#if savingProfile}<span class="spinner"></span>{/if} Simpan profil</button></div>
      </form>
    </section>

    <section class="card card-pad">
      <div class="row hd"><span class="avatar big gold"><Icon name="key" size={20} /></span><div><h2 class="card-title">Ubah password</h2><p class="card-sub">Gunakan minimal 8 karakter.</p></div></div>
      <form onsubmit={(e) => { e.preventDefault(); savePassword(); }} class="form">
        <div class="field"><label for="p-cur">Password saat ini</label><input id="p-cur" type={showPw ? 'text' : 'password'} class="input {pwErrors.current ? 'invalid' : ''}" bind:value={currentPassword} autocomplete="current-password" />{#if pwErrors.current}<span class="err-text">{pwErrors.current}</span>{/if}</div>
        <div class="field"><label for="p-new">Password baru</label><input id="p-new" type={showPw ? 'text' : 'password'} class="input {pwErrors.next ? 'invalid' : ''}" bind:value={newPassword} maxlength="72" autocomplete="new-password" />
          {#if newPassword}<div class="meter" aria-hidden="true">{#each [1, 2, 3, 4] as i}<i class:on={strength >= i}></i>{/each}</div>{/if}
          {#if pwErrors.next}<span class="err-text">{pwErrors.next}</span>{/if}</div>
        <div class="field"><label for="p-conf">Konfirmasi password baru</label><input id="p-conf" type={showPw ? 'text' : 'password'} class="input {pwErrors.confirm ? 'invalid' : ''}" bind:value={confirmPassword} maxlength="72" autocomplete="new-password" />{#if pwErrors.confirm}<span class="err-text">{pwErrors.confirm}</span>{/if}</div>
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
  .hd { margin-bottom: 18px; } .big { width: 46px; height: 46px; font-size: 15px; } .gold { background: var(--gold-tint); color: var(--gold-deep); }
  .form { display: grid; gap: 16px; }
  .meter { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; } .meter i { height: 4px; border-radius: 4px; background: #e8e5db; } .meter i.on { background: var(--gold); }
  dl { margin: 14px 0 0; display: grid; } dl div { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line-2); } dl div:last-child { border: 0; }
  dt { color: var(--ink-3); font-size: 13px; } dd { margin: 0; font-weight: 600; color: var(--navy); font-size: 13px; text-align: right; } code { background: #f3f1ea; padding: 2px 7px; border-radius: 6px; }
  .out { display: grid; gap: 14px; }
  @media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
</style>
