<script lang="ts">
  import Modal from './Modal.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import Skeleton from './Skeleton.svelte';
  import ErrorState from './ErrorState.svelte';
  import Icon from './Icon.svelte';
  import { apiRequest } from '../api';
  import { handleApiError } from '../stores/app.svelte';
  import { confirmDialog } from '../stores/confirm.svelte';
  import { toastSuccess } from '../stores/toast.svelte';
  import { fmtDate, fmtTime, fmtDateTime, ACTION_LABEL, initials } from '../utils';

  type Props = { bookingId: number | null; onclose: () => void; onchanged?: () => void };
  let { bookingId, onclose, onchanged }: Props = $props();

  let booking = $state<any>(null);
  let loading = $state(false);
  let loadError = $state('');
  let working = $state(false);
  let note = $state('');
  let noteError = $state('');
  let cancelMode = $state(false);

  const canCancel = $derived(
    booking && (booking.status === 'PENDING' || booking.status === 'APPROVED') && new Date(booking.endTime) > new Date()
  );

  async function load() {
    if (!bookingId) return;
    loading = true;
    loadError = '';
    try {
      booking = (await apiRequest(`/admin/bookings/${bookingId}`)).data;
    } catch (e) {
      loadError = handleApiError(e, 'Gagal memuat detail', true);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (bookingId) {
      booking = null;
      note = '';
      noteError = '';
      cancelMode = false;
      load();
    }
  });

  async function review(status: 'APPROVED' | 'REJECTED') {
    noteError = '';
    if (status === 'REJECTED' && note.trim().length < 3) {
      noteError = 'Alasan penolakan wajib diisi (minimal 3 karakter).';
      return;
    }
    const ok = await confirmDialog({
      title: status === 'APPROVED' ? 'Setujui peminjaman?' : 'Tolak peminjaman?',
      message:
        status === 'APPROVED'
          ? `Peminjaman "${booking.title}" akan disetujui dan mahasiswa akan diberi notifikasi.`
          : `Peminjaman "${booking.title}" akan ditolak dengan alasan yang Anda tulis.`,
      confirmLabel: status === 'APPROVED' ? 'Ya, setujui' : 'Ya, tolak',
      tone: status === 'REJECTED' ? 'danger' : 'default'
    });
    if (!ok) return;
    working = true;
    try {
      const r = await apiRequest(`/admin/bookings/${booking.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status, adminNote: note.trim() || undefined })
      });
      toastSuccess(r.message);
      note = '';
      await load();
      onchanged?.();
    } catch (e) {
      handleApiError(e);
    } finally {
      working = false;
    }
  }

  async function cancel() {
    noteError = '';
    if (note.trim().length < 3) {
      noteError = 'Alasan pembatalan wajib diisi (minimal 3 karakter).';
      return;
    }
    const ok = await confirmDialog({
      title: 'Batalkan peminjaman?',
      message: 'Jadwal akan dilepas dan mahasiswa menerima notifikasi pembatalan beserta alasannya.',
      confirmLabel: 'Ya, batalkan',
      tone: 'danger'
    });
    if (!ok) return;
    working = true;
    try {
      const r = await apiRequest(`/admin/bookings/${booking.id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: note.trim() })
      });
      toastSuccess(r.message);
      note = '';
      cancelMode = false;
      await load();
      onchanged?.();
    } catch (e) {
      handleApiError(e);
    } finally {
      working = false;
    }
  }
</script>

<Modal open={bookingId !== null} title={booking?.title ?? 'Detail peminjaman'} subtitle={booking ? `Pengajuan #${booking.id}` : undefined} size="lg" {onclose}>
  {#if loading && !booking}
    <Skeleton rows={7} />
  {:else if loadError}
    <ErrorState message={loadError} onretry={load} />
  {:else if booking}
    <div class="top">
      <StatusBadge status={booking.status} />
      <span class="muted small">Diajukan {fmtDateTime(booking.createdAt)}</span>
    </div>

    <div class="grid">
      <section class="box">
        <h4>Mahasiswa</h4>
        <div class="row">
          <div class="avatar">{initials(booking.student.name)}</div>
          <div class="grow">
            <div class="cell-main">{booking.student.name}</div>
            <div class="cell-sub">{booking.student.nim ?? '—'} · {booking.student.email}</div>
          </div>
        </div>
      </section>
      <section class="box">
        <h4>Ruangan</h4>
        <div class="cell-main">{booking.room.name} <span class="muted code">{booking.room.code}</span></div>
        <div class="cell-sub row small"><Icon name="pin" size={13} /> {booking.room.location} · Kapasitas {booking.room.capacity}</div>
      </section>
      <section class="box">
        <h4>Jadwal</h4>
        <div class="cell-main">{fmtDate(booking.startTime)}</div>
        <div class="cell-sub">{fmtTime(booking.startTime)} – {fmtTime(booking.endTime)} WIB</div>
      </section>
      <section class="box">
        <h4>Diproses oleh</h4>
        {#if booking.reviewer}
          <div class="cell-main">{booking.reviewer.name}</div>
          <div class="cell-sub">{booking.reviewedAt ? fmtDateTime(booking.reviewedAt) : ''}</div>
        {:else}
          <div class="muted">Belum diproses</div>
        {/if}
      </section>
    </div>

    <section class="box wide">
      <h4>Alasan peminjaman</h4>
      <p class="purpose">{booking.purpose}</p>
      {#if booking.adminNote}
        <div class="adminnote"><b>Catatan admin:</b> {booking.adminNote}</div>
      {/if}
    </section>

    <section class="box wide">
      <h4>Riwayat status</h4>
      <ol class="timeline">
        {#each booking.logs as log (log.id)}
          <li>
            <span class="dot {log.action.toLowerCase()}"></span>
            <div>
              <div class="cell-main">{ACTION_LABEL[log.action] ?? log.action}</div>
              <div class="cell-sub">{log.user.name} · {fmtDateTime(log.createdAt)}</div>
              {#if log.note}<div class="lognote">{log.note}</div>{/if}
            </div>
          </li>
        {/each}
      </ol>
    </section>

    {#if booking.status === 'PENDING' || cancelMode}
      <section class="actions">
        <div class="field">
          <label for="bk-note">{cancelMode ? 'Alasan pembatalan' : 'Catatan admin / alasan penolakan'}</label>
          <textarea id="bk-note" class="textarea {noteError ? 'invalid' : ''}" bind:value={note} maxlength="2000"
            placeholder={cancelMode ? 'Contoh: Ruangan digunakan untuk acara fakultas' : 'Wajib diisi bila menolak, opsional bila menyetujui'}></textarea>
          {#if noteError}<span class="err-text">{noteError}</span>{/if}
        </div>
        <div class="btns">
          {#if cancelMode}
            <button class="btn btn-ghost" onclick={() => { cancelMode = false; noteError = ''; }} disabled={working}>Kembali</button>
            <button class="btn btn-danger-solid" onclick={cancel} disabled={working}>{#if working}<span class="spinner"></span>{/if} Batalkan peminjaman</button>
          {:else}
            <button class="btn btn-danger" onclick={() => review('REJECTED')} disabled={working}><Icon name="x" size={15} /> Tolak</button>
            <button class="btn btn-ok" onclick={() => review('APPROVED')} disabled={working}><Icon name="check" size={15} /> Setujui</button>
          {/if}
        </div>
      </section>
    {/if}
  {/if}

  {#snippet footer()}
    {#if booking && canCancel && !cancelMode}
      <button class="btn btn-danger" onclick={() => { cancelMode = true; note = ''; noteError = ''; }}>Batalkan peminjaman</button>
    {/if}
    <button class="btn btn-ghost" onclick={onclose}>Tutup</button>
  {/snippet}
</Modal>

<style>
  .top { display: flex; align-items: center; gap: 12px; margin: 4px 0 16px; flex-wrap: wrap; }
  .small { font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .box { padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px; background: #fdfcf9; }
  .box.wide { margin-bottom: 12px; }
  h4 { margin-bottom: 10px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
  .code { font-weight: 500; font-size: 12px; margin-left: 4px; }
  .purpose { color: var(--ink-2); white-space: pre-wrap; line-height: 1.6; }
  .adminnote { margin-top: 12px; padding: 10px 12px; background: var(--gold-tint); border-radius: 10px; font-size: 13px; color: var(--gold-deep); }
  .timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
  .timeline li { position: relative; display: flex; gap: 14px; }
  .timeline li:not(:last-child)::after { content: ''; position: absolute; left: 5px; top: 16px; bottom: -14px; width: 2px; background: var(--line); }
  .dot { width: 12px; height: 12px; margin-top: 4px; border-radius: 50%; background: var(--gold); flex-shrink: 0; box-shadow: 0 0 0 3px var(--gold-tint); }
  .dot.approved { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-bg); } .dot.rejected { background: var(--bad); box-shadow: 0 0 0 3px var(--bad-bg); } .dot.cancelled { background: var(--mute); box-shadow: 0 0 0 3px var(--mute-bg); }
  .lognote { margin-top: 4px; font-size: 12.5px; color: var(--ink-2); }
  .actions { display: grid; gap: 12px; padding: 16px; border: 1px dashed var(--gold-soft); border-radius: 14px; background: #fffdf8; }
  .btns { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
</style>
