<script lang="ts">
  import { onDestroy } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { apiRequest, ApiError } from '../../lib/api';
  import BrandLogo from '../../lib/components/BrandLogo.svelte';
  import PasswordInput from '../../lib/components/PasswordInput.svelte';

  let token = $state(page.url.searchParams.get('token') ?? '');
  let password = $state('');
  let confirmation = $state('');
  let loading = $state(false);
  let error = $state('');
  let success = $state('');
  let redirectTimer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    if (redirectTimer) clearTimeout(redirectTimer);
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    success = '';
    if (!token) {
      error = 'Tautan reset tidak tersedia. Minta tautan baru dari halaman lupa password.';
      return;
    }
    if (password.length < 8) {
      error = 'Password minimal 8 karakter.';
      return;
    }
    if (password.length > 72) {
      error = 'Password maksimal 72 karakter.';
      return;
    }
    if (password !== confirmation) {
      error = 'Konfirmasi password tidak cocok.';
      return;
    }

    loading = true;
    try {
      const result = await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password })
      });
      success = result.message || 'Password berhasil diperbarui. Silakan masuk kembali.';
      redirectTimer = setTimeout(() => {
        void goto('/login', { replaceState: true });
      }, 1500);
    } catch (cause) {
      error = cause instanceof ApiError
        ? cause.message
        : 'Reset password gagal. Silakan coba kembali.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Reset password — RuangKu</title>
  <meta name="description" content="Buat password baru untuk akun RuangKu" />
</svelte:head>

<main class="auth-page">
  <section class="auth-card">
    <a href="/login" class="brand">
      <span class="brand-icon"><BrandLogo size={30} /></span>
      <span>ruangku<span class="gold">.</span></span>
    </a>
    <p class="eyebrow">PEMULIHAN AKUN</p>
    <h1>Buat password baru</h1>
    <p class="description">Gunakan password baru untuk masuk kembali ke RuangKu.</p>

    {#if !token}
      <p class="error-message" role="alert">Tautan reset tidak tersedia. Minta tautan baru dari halaman lupa password.</p>
      <a class="back-link" href="/forgot-password">Minta tautan reset</a>
    {:else}
      <form onsubmit={submit}>
        <label for="password">Password baru</label>
        <PasswordInput id="password" bind:value={password} inputClass="reset-input" autocomplete="new-password" minlength={8} maxlength={72} required />
        <label for="confirmation">Konfirmasi password baru</label>
        <PasswordInput id="confirmation" bind:value={confirmation} inputClass="reset-input" autocomplete="new-password" maxlength={72} required />
        {#if error}<p class="error-message" role="alert">{error}</p>{/if}
        {#if success}<p class="result" role="status">{success}</p>{/if}
        <button type="submit" disabled={loading || !!success}>{loading ? 'Memproses...' : 'Simpan password baru'}</button>
      </form>
    {/if}

    <a class="back-link" href="/login">← Kembali ke login</a>
  </section>
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; font-family: var(--font); color: #192b42; background: #f8f7f3; }
  .auth-page { display: grid; min-height: 100vh; place-items: center; padding: 28px; }
  .auth-card { width: min(420px, 100%); padding: 42px; border: 1px solid #eeece6; border-radius: 16px; background: #fff; box-shadow: 0 20px 60px #10182812; }
  .brand { display: inline-flex; align-items: center; gap: 10px; color: #192b42; font-size: 25px; font-weight: 800; letter-spacing: -1px; }
  .brand-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: #e8ca91; }
  .gold { color: #bc9657; }
  .eyebrow { margin: 32px 0 12px; color: #9a7a45; font-size: 9px; font-weight: 750; letter-spacing: 1.8px; }
  h1 { margin: 0; font-size: 30px; letter-spacing: -1px; }
  .description { margin: 12px 0 24px; color: #7f8997; font-size: 12px; line-height: 1.8; }
  form { display: grid; gap: 10px; }
  label { margin-top: 8px; color: #344256; font-size: 11px; font-weight: 700; }
  :global(.password-input input.reset-input) { height: 45px; padding: 0 42px 0 13px; border: 1px solid #e2e5e9; border-radius: 8px; outline: none; color: #24354b; background: #fff; font: inherit; font-size: 12px; }
  :global(.password-input input.reset-input:focus) { border-color: #c3a265; box-shadow: 0 0 0 3px #c3a26520; }
  button { height: 46px; margin-top: 12px; border: 0; border-radius: 8px; background: #192b42; color: #fff; font-weight: 700; cursor: pointer; }
  button:hover { background: #263e5c; }
  button:disabled { opacity: .65; cursor: wait; }
  .result, .error-message { margin: 8px 0 0; font-size: 12px; line-height: 1.6; }
  .result { color: #176b48; }
  .error-message { color: #b64c4c; }
  .back-link { display: block; margin-top: 24px; color: #9a7a45; font-size: 12px; font-weight: 650; text-align: center; }
  @media (max-width: 480px) { .auth-card { padding: 30px 24px; } }
</style>
