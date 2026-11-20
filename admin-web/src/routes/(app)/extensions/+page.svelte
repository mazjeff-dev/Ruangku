<script lang="ts">
  import { onMount } from 'svelte';
  import StatusBadge from '../../../lib/components/StatusBadge.svelte';
  import Skeleton from '../../../lib/components/Skeleton.svelte';
  import EmptyState from '../../../lib/components/EmptyState.svelte';
  import ErrorState from '../../../lib/components/ErrorState.svelte';
  import Icon from '../../../lib/components/Icon.svelte';
  import { apiRequest, qs } from '../../../lib/api';
  import { app, handleApiError, refreshBadges } from '../../../lib/stores/app.svelte';
  import { confirmDialog } from '../../../lib/stores/confirm.svelte';
  import { toastSuccess } from '../../../lib/stores/toast.svelte';
  import { fmtDate, fmtTime } from '../../../lib/utils';

  const apiBase = $derived(app.user?.role === 'DOSEN' ? '/lecturer' : '/admin');
  let status = $state('PENDING');
  let items = $state<any[]>([]);
  let notes = $state<Record<number, string>>({});
  let loading = $state(true);
  let error = $state('');
  let workingId = $state<number | null>(null);

  async function load() {
    loading = true;
    error = '';
    try { items = (await apiRequest(`${apiBase}/extensions${qs({ status })}`)).data; }
    catch (e) { error = handleApiError(e, 'Gagal memuat permintaan perpanjangan', true); }
    finally { loading = false; }
  }

  async function review(item: any, decision: 'APPROVED' | 'REJECTED') {
    const note = (notes[item.id] ?? '').trim();
    if (decision === 'REJECTED' && note.length < 3) {
      error = 'Alasan penolakan wajib diisi minimal 3 karakter.';
      return;
    }
    const approved = decision === 'APPROVED';
    const ok = await confirmDialog({
      title: approved ? 'Setujui perpanjangan?' : 'Tolak perpanjangan?',
      message: approved
        ? `Peminjaman "${item.booking.title}" diperpanjang hingga ${fmtTime(item.requestedEndTime)} WIB.`
        : `Permintaan perpanjangan "${item.booking.title}" akan ditolak.`,
      confirmLabel: approved ? 'Ya, setujui' : 'Ya, tolak',
      tone: approved ? 'default' : 'danger'
    });
    if (!ok) return;
    workingId = item.id;
    error = '';
    try {
      const result = await apiRequest(`${apiBase}/extensions/${item.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status: decision, note: note || undefined })
      });
      toastSuccess(result.message);
      await load();
      refreshBadges();
    } catch (e) { error = handleApiError(e, 'Gagal memproses permintaan'); }
    finally { workingId = null; }
  }

  onMount(load);
</script>

<svelte:head><title>Permintaan Perpanjangan — RuangKu</title></svelte:head>

<div class="page">
  <div class="page-head"><div><div class="kicker">Pengelolaan</div><h1 class="page-title">Perpanjangan peminjaman</h1><p class="page-desc">{app.user?.role === 'DOSEN' ? 'Tinjau permintaan pada ruangan yang ditugaskan kepada Anda.' : 'Tinjau permintaan perpanjangan dari seluruh ruangan.'}</p></div></div>
  <section class="card">
    <div class="filters">
      <label for="ext-status">Status</label>
      <select id="ext-status" class="select" bind:value={status} onchange={load}>
        <option value="PENDING">Menunggu</option><option value="APPROVED">Disetujui</option><option value="REJECTED">Ditolak</option><option value="ALL">Semua</option>
      </select>
    </div>
    {#if error}<div class="inline-error" role="alert">{error}</div>{/if}
    {#if loading}<Skeleton rows={5} height={68} />
    {:else if items.length === 0}<EmptyState icon="clock" title="Tidak ada permintaan" message="Permintaan perpanjangan akan muncul di sini." />
    {:else}
      <div class="items">
        {#each items as item (item.id)}
          <article class="item">
            <div class="item-head">
              <div><h2>{item.booking.title}</h2><p>{item.requester.name} · {item.booking.room.name} ({item.booking.room.code})</p></div>
              <StatusBadge status={item.status} />
            </div>
            <div class="schedule">
              <span>Jadwal saat ini: {fmtDate(item.booking.startTime)} · {fmtTime(item.booking.startTime)}–{fmtTime(item.booking.endTime)} WIB</span>
              <span>Diminta sampai: {fmtDate(item.requestedEndTime)} · {fmtTime(item.requestedEndTime)} WIB</span>
            </div>
            {#if item.status === 'PENDING'}
              <label class="note-label" for="note-{item.id}">Catatan / alasan penolakan</label>
              <textarea id="note-{item.id}" class="textarea" bind:value={notes[item.id]} maxlength="2000" placeholder="Alasan wajib diisi jika menolak"></textarea>
              <div class="actions">
                <button class="btn btn-danger" onclick={() => review(item, 'REJECTED')} disabled={workingId === item.id}><Icon name="x" size={15} /> Tolak</button>
                <button class="btn btn-ok" onclick={() => review(item, 'APPROVED')} disabled={workingId === item.id}>{#if workingId === item.id}<span class="spinner"></span>{:else}<Icon name="check" size={15} />{/if} Setujui</button>
              </div>
            {:else if item.note}<p class="note-result">{item.note}</p>{/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .filters { display:flex; align-items:center; gap:12px; padding:16px 18px; border-bottom:1px solid var(--line-2); color:var(--ink-2); font-size:12px; }
  .select { min-width:180px; }
  .inline-error { padding:12px 18px; color:var(--bad); background:var(--bad-bg); font-size:13px; }
  .items { display:grid; }
  .item { padding:18px 20px; border-bottom:1px solid var(--line-2); }
  .item-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
  h2 { margin:0; color:var(--navy); font-size:14px; }
  p { margin:5px 0 0; color:var(--ink-2); font-size:12px; }
  .schedule { display:grid; gap:5px; margin:14px 0; color:var(--ink-2); font-size:12px; }
  .note-label { display:block; margin-bottom:6px; color:var(--ink-2); font-size:12px; font-weight:600; }
  .textarea { width:100%; min-height:68px; resize:vertical; }
  .actions { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }
  .note-result { padding:10px; border-radius:8px; background:#f7f5ef; }
</style>
