
<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiRequest } from '../../lib/api';

  let email = $state('admin@ruangku.local');
  let password = $state('');
  let loading = $state(false);
  let errorMessage = $state('');

  async function handleLogin(event: SubmitEvent) {
    event.preventDefault();
    errorMessage = '';
    loading = true;

    try {
      const result = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      const { token, user } = result.data ?? {};

      if (!token || user?.role !== 'ADMIN') {
        throw new Error('Akun ini bukan administrator RuangKu.');
      }

      sessionStorage.setItem('ruangku_admin_token', token);
      sessionStorage.setItem('ruangku_admin_user', JSON.stringify(user));

      await goto('/');
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : 'Login gagal.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Login Admin — RuangKu</title>
  <meta name="description" content="Login administrator RuangKu" />
</svelte:head>

<main class="login-page">
  <section class="login-card">
    <a href="/" class="brand">
      <span class="brand-icon">R.</span>
      <span>ruangku<span class="gold">.</span></span>
    </a>

    <p class="eyebrow">CAMPUS SPACE MANAGEMENT</p>
    <h1>Selamat datang<br />kembali.</h1>
    <p class="description">
      Masuk ke akun administrator untuk mengelola pemesanan ruang kampus.
    </p>

    <form onsubmit={handleLogin}>
      <label for="email">Email administrator</label>
      <input
        id="email"
        type="email"
        bind:value={email}
        placeholder="admin@ruangku.local"
        autocomplete="username"
        required
      />

      <label for="password">Password</label>
      <input
        id="password"
        type="password"
        bind:value={password}
        placeholder="Masukkan password"
        autocomplete="current-password"
        required
      />

      {#if errorMessage}
        <p class="error-message">{errorMessage}</p>
      {/if}

      <button type="submit" disabled={loading}>
        {loading ? 'Memproses...' : 'Masuk ke Dashboard →'}
      </button>
    </form>

    <p class="security-note">✦ Akses khusus administrator RuangKu</p>
  </section>

  <aside class="visual-panel">
    <div class="visual-content">
      <span class="pill">YOUR CAMPUS, ORGANIZED</span>
      <h2>Ruang yang tepat.<br />Untuk ide yang hebat.</h2>
      <p>
        Satu platform untuk mengelola ruang, menyederhanakan pemesanan,
        dan mendukung produktivitas kampus.
      </p>
      <div class="building-art">
        <div class="building-roof"></div>
        <div class="building-body">
          {#each Array(9) as _}
            <span></span>
          {/each}
        </div>
        <div class="building-base"></div>
      </div>
    </div>
    <span class="copyright">© 2026 RUANGKU · CAMPUS SPACE MANAGEMENT</span>
  </aside>
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(body) {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    color: #192b42;
    background: #fff;
  }
  .login-page { display: grid; grid-template-columns: 1fr 1fr; min-height: 100vh; }
  .login-card { width: min(390px, calc(100% - 48px)); margin: auto; padding: 55px 0; }
  .brand { display: flex; align-items: center; gap: 10px; color: #192b42; font-size: 25px; font-weight: 800; letter-spacing: -1px; }
  .brand-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: #e8ca91; font-size: 21px; }
  .gold { color: #bc9657; }
  .eyebrow { margin: 15px 0 45px; color: #9a7a45; font-size: 9px; font-weight: 750; letter-spacing: 1.8px; }
  h1 { margin: 0; font-size: 38px; line-height: 1.17; letter-spacing: -1.5px; }
  .description { color: #7f8997; font-size: 12px; line-height: 1.9; margin: 14px 0 30px; }
  form { display: grid; gap: 10px; }
  label { margin-top: 8px; color: #344256; font-size: 11px; font-weight: 700; }
  input { width: 100%; height: 45px; padding: 0 13px; border: 1px solid #e2e5e9; border-radius: 8px; outline: none; color: #24354b; background: #fff; font: inherit; font-size: 12px; }
  input:focus { border-color: #c3a265; box-shadow: 0 0 0 3px #c3a26520; }
  button { height: 46px; margin-top: 13px; border: 0; border-radius: 8px; background: #192b42; color: #fff; font-weight: 700; cursor: pointer; }
  button:hover { background: #263e5c; }
  button:disabled { opacity: .65; cursor: wait; }
  .error-message { margin: 3px 0; color: #b64c4c; font-size: 11px; }
  .security-note { margin-top: 23px; text-align: center; color: #9199a3; font-size: 10px; }
  .visual-panel { position: relative; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 45px; overflow: hidden; background: #192b42; color: #fff; }
  .visual-content { width: min(420px, 100%); }
  .pill { display: inline-block; padding: 8px 11px; border: 1px solid #45546a; border-radius: 20px; color: #e5c88f; font-size: 9px; letter-spacing: 1.3px; }
  h2 { margin: 25px 0 13px; font-size: clamp(29px, 3.3vw, 43px); line-height: 1.2; letter-spacing: -1.2px; }
  .visual-content > p { max-width: 350px; color: #b7c1cf; font-size: 12px; line-height: 1.9; }
  .building-art { position: relative; height: 230px; margin-top: 28px; display: flex; flex-direction: column; align-items: center; justify-content: end; }
  .building-roof { width: 220px; height: 13px; border-radius: 4px 4px 0 0; background: #d9b876; }
  .building-body { display: grid; grid-template-columns: repeat(3, 1fr); gap: 13px; width: 205px; padding: 20px 25px; background: #263d58; border: 1px solid #43536a; }
  .building-body span { height: 28px; border-radius: 2px; background: #e8d7b4; }
  .building-base { width: 245px; height: 9px; background: #d9b876; }
  .copyright { position: absolute; bottom: 25px; left: 45px; color: #9ba9ba; font-size: 8px; letter-spacing: 1.1px; }
  @media (max-width: 760px) {
    .login-page { grid-template-columns: 1fr; }
    .login-card { padding: 45px 0; }
    .visual-panel { min-height: 380px; padding: 35px 25px 60px; }
    .building-art { height: 180px; }
    .copyright { left: 25px; bottom: 20px; }
  }
</style>
