<script lang="ts">
  import { onMount } from 'svelte';
  import EmptyState from '../../../../lib/components/EmptyState.svelte';
  import ErrorState from '../../../../lib/components/ErrorState.svelte';
  import Skeleton from '../../../../lib/components/Skeleton.svelte';
  import { apiRequest } from '../../../../lib/api';
  import { handleApiError } from '../../../../lib/stores/app.svelte';

  let rooms = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');

  async function load() {
    loading = true;
    error = '';
    try { rooms = (await apiRequest('/lecturer/rooms')).data; }
    catch (e) { error = handleApiError(e, 'Gagal memuat ruangan tugas', true); }
    finally { loading = false; }
  }
  onMount(load);
</script>

<svelte:head><title>Ruangan Tugas — RuangKu</title></svelte:head>

<div class="page">
  <div class="page-head"><div><div class="kicker">RuangKu Dosen</div><h1 class="page-title">Ruangan tugas</h1><p class="page-desc">Daftar ruangan yang menjadi kewenangan peninjauan Anda.</p></div></div>
  <section class="card">
    {#if loading}<Skeleton rows={5} height={30} />
    {:else if error}<ErrorState message={error} onretry={load} />
    {:else if rooms.length === 0}<EmptyState icon="rooms" title="Belum ada ruangan yang ditugaskan" message="Hubungi administrator untuk mengatur penugasan ruangan." />
    {:else}
      <div class="table-wrap"><table class="table stack">
        <thead><tr><th>Ruangan</th><th>Kode</th><th>Lokasi</th><th>Kapasitas</th><th>Status</th></tr></thead>
        <tbody>{#each rooms as assignment (assignment.room.id)}
          <tr><td data-label="Ruangan" class="cell-main">{assignment.room.name}</td><td data-label="Kode">{assignment.room.code}</td><td data-label="Lokasi">{assignment.room.location}</td><td data-label="Kapasitas">{assignment.room.capacity} orang</td><td data-label="Status">{assignment.room.isActive ? 'Aktif' : 'Nonaktif'}</td></tr>
        {/each}</tbody>
      </table></div>
    {/if}
  </section>
</div>
