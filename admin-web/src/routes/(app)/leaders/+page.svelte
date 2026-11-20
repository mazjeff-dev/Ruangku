<script lang="ts">
  import { onMount } from 'svelte';
  import PasswordInput from '../../../lib/components/PasswordInput.svelte';
  import ErrorState from '../../../lib/components/ErrorState.svelte';
  import EmptyState from '../../../lib/components/EmptyState.svelte';
  import Skeleton from '../../../lib/components/Skeleton.svelte';
  import { apiRequest } from '../../../lib/api';
  import { handleApiError } from '../../../lib/stores/app.svelte';
  import { toastSuccess } from '../../../lib/stores/toast.svelte';
  import { fmtDate } from '../../../lib/utils';

  let leaders = $state<any[]>([]);
  let name = $state('');
  let email = $state('');
  let password = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');

  async function load() {
    loading = true;
    error = '';
    try { leaders = (await apiRequest('/admin/leaders')).data; }
    catch (e) { error = handleApiError(e, 'Gagal memuat akun PIMPINAN', true); }
    finally { loading = false; }
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    error = '';
    try {
      const result = await apiRequest('/admin/leaders', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password })
      });
      toastSuccess(result.message);
      name = email = password = '';
      await load();
    } catch (e) { error = handleApiError(e, 'Gagal membuat akun PIMPINAN'); }
    finally { saving = false; }
  }

  onMount(load);
</script>

<svelte:head><title>Akun PIMPINAN — RuangKu</title></svelte:head>

<div class="page">
  <div class="page-head"><div><div class="kicker">Pengelolaan akun</div><h1 class="page-title">Akun PIMPINAN</h1><p class="page-desc">Akun PIMPINAN dapat melihat analisis dan dasbor pengadaan tanpa hak perubahan data.</p></div></div>
  {#if error}<div class="inline-error" role="alert">{error}</div>{/if}
  <section class="card create-card">
    <div class="card-head"><div><h2 class="card-title">Buat akun</h2><p class="card-sub">Password awal ditetapkan Admin dan dapat diganti melalui pengaturan akun.</p></div></div>
    <form class="create-form" onsubmit={create}>
      <label>Nama<input class="input" bind:value={name} minlength="2" maxlength="100" required /></label>
      <label>Email<input class="input" type="email" bind:value={email} maxlength="150" required /></label>
      <label>Password awal<PasswordInput id="leadership-password" inputClass="input" bind:value={password} minlength={8} maxlength={72} required autocomplete="new-password" /></label>
      <button class="btn btn-primary" type="submit" disabled={saving}>{#if saving}<span class="spinner"></span>{/if} Buat akun PIMPINAN</button>
    </form>
  </section>
  <section class="card">
    {#if loading}<Skeleton rows={5} height={24} />
    {:else if error}<ErrorState message={error} onretry={load} />
    {:else if leaders.length === 0}<EmptyState icon="students" title="Belum ada akun PIMPINAN" message="Gunakan formulir di atas untuk membuat akun." />
    {:else}<div class="table-wrap"><table class="table stack">
      <thead><tr><th>Nama</th><th>Email</th><th>Status</th><th>Dibuat</th></tr></thead>
      <tbody>{#each leaders as leader (leader.id)}
        <tr><td data-label="Nama">{leader.name}</td><td data-label="Email">{leader.email}</td><td data-label="Status">{leader.isActive ? 'Aktif' : 'Nonaktif'}</td><td data-label="Dibuat">{fmtDate(leader.createdAt)}</td></tr>
      {/each}</tbody>
    </table></div>{/if}
  </section>
</div>

<style>
  .create-card { margin-bottom:16px; }
  .create-form { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); align-items:end; gap:12px; padding:16px 18px; }
  .create-form label { display:grid; gap:6px; color:var(--ink-2); font-size:12px; font-weight:600; }
  @media(max-width:850px){.create-form{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
