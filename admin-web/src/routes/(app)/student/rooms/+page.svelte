<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from '../../../../lib/components/Modal.svelte';
  import Icon from '../../../../lib/components/Icon.svelte';
  import StatusBadge from '../../../../lib/components/StatusBadge.svelte';
  import EmptyState from '../../../../lib/components/EmptyState.svelte';
  import ErrorState from '../../../../lib/components/ErrorState.svelte';
  import { apiRequest, assetUrl, qs } from '../../../../lib/api';
  import { handleApiError, refreshBadges } from '../../../../lib/stores/app.svelte';
  import { toastSuccess } from '../../../../lib/stores/toast.svelte';
  import { addDays, dateKey, fmtDate, fmtTime, todayKey, debounce } from '../../../../lib/utils';

  type BookingRules = { minMinutes: number; maxHours: number; maxDaysAhead: number; maxActiveBookings: number; maxQueueEntries: number };
  const wibInput = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
  };
  const fromWibInput = (value: string) => new Date(`${value}:00+07:00`);
  const initialStart = () => {
    const date = new Date();
    date.setUTCMinutes(0, 0, 0);
    date.setUTCHours(date.getUTCHours() + 1);
    return date;
  };

  let rooms = $state<any[]>([]);
  let categories = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let q = $state('');
  let category = $state('');
  let minCapacity = $state('');
  let checkAvailability = $state(false);
  let availabilityStart = $state('');
  let availabilityEnd = $state('');
  let availabilityMessage = $state('');
  let rules = $state<BookingRules>({ minMinutes: 30, maxHours: 8, maxDaysAhead: 90, maxActiveBookings: 3, maxQueueEntries: 3 });

  let scheduleRoom = $state<any>(null);
  let scheduleLoading = $state(false);
  let scheduleError = $state('');
  let schedule = $state<any[]>([]);
  let scheduleClosures = $state<any[]>([]);
  let scheduleHours = $state<any>(null);

  let bookingRoom = $state<any>(null);
  let booking = $state({ title: '', purpose: '', attendees: '', startTime: '', endTime: '' });
  let bookingQueueOnly = $state(false);
  let bookingErrors = $state<Record<string, string>>({});
  let savingBooking = $state(false);
  let bookingSchedule = $state<any>(null);

  async function loadRooms() {
    if (checkAvailability && (!availabilityStart || !availabilityEnd)) {
      availabilityMessage = 'Isi waktu mulai dan selesai sebelum memeriksa ketersediaan.';
      return;
    }
    if (checkAvailability && fromWibInput(availabilityEnd) <= fromWibInput(availabilityStart)) {
      availabilityMessage = 'Waktu selesai harus setelah waktu mulai.';
      return;
    }
    availabilityMessage = '';
    loading = true;
    error = '';
    try {
      const filters = {
        q: q.trim(),
        category,
        minCapacity: minCapacity ? Number(minCapacity) : '',
        pageSize: 100,
        start: checkAvailability ? fromWibInput(availabilityStart).toISOString() : '',
        end: checkAvailability ? fromWibInput(availabilityEnd).toISOString() : ''
      };
      const endpoint = `/rooms${qs(filters)}`;
      rooms = (await apiRequest(endpoint)).data;
    } catch (e) {
      error = handleApiError(e, 'Gagal memuat katalog ruangan', true);
    } finally {
      loading = false;
    }
  }

  const search = debounce(loadRooms);

  function toggleAvailability() {
    availabilityMessage = checkAvailability
      ? 'Isi waktu mulai dan selesai sebelum memeriksa ketersediaan.'
      : '';
    if (!checkAvailability) void loadRooms();
  }

  function openBooking(room: any, queueOnly = false) {
    const start = queueOnly && checkAvailability ? fromWibInput(availabilityStart) : initialStart();
    const end = queueOnly && checkAvailability
      ? fromWibInput(availabilityEnd)
      : new Date(start.getTime() + 60 * 60_000);
    bookingRoom = room;
    bookingQueueOnly = queueOnly;
    booking = { title: '', purpose: '', attendees: '', startTime: wibInput(start), endTime: wibInput(end) };
    bookingErrors = {};
    loadBookingSchedule();
  }

  async function loadBookingSchedule() {
    if (!bookingRoom || !booking.startTime) return;
    try {
      const date = booking.startTime.slice(0, 10);
      bookingSchedule = (await apiRequest(`/rooms/${bookingRoom.id}/schedule${qs({ from: date, to: date })}`)).data;
    } catch (e) {
      bookingSchedule = null;
      handleApiError(e, 'Gagal memuat jam operasional ruangan', true);
    }
  }

  function hoursForBooking() {
    if (!bookingSchedule) return null;
    const day = new Date(`${booking.startTime.slice(0, 10)}T00:00:00+07:00`).getUTCDay();
    const overrides = bookingSchedule.operatingHours?.overrides ?? [];
    return overrides.find((hour: any) => hour.dayOfWeek === day) ?? bookingSchedule.operatingHours?.default ?? null;
  }

  function validateBooking() {
    const errors: Record<string, string> = {};
    const start = fromWibInput(booking.startTime);
    const end = fromWibInput(booking.endTime);
    if (booking.title.trim().length < 3) errors.title = 'Judul minimal 3 karakter.';
    if (booking.purpose.trim().length < 3) errors.purpose = 'Tujuan peminjaman minimal 3 karakter.';
    const attendees = Number(booking.attendees);
    if (!Number.isInteger(attendees) || attendees < 1) errors.attendees = 'Jumlah peserta minimal 1 orang.';
    else if (attendees > bookingRoom?.capacity) errors.attendees = `Jumlah peserta melebihi kapasitas ruangan (maks. ${bookingRoom.capacity}).`;
    if (!booking.startTime || Number.isNaN(start.getTime()) || start <= new Date()) errors.startTime = 'Waktu mulai harus di masa depan.';
    if (!booking.endTime || Number.isNaN(end.getTime()) || end <= start) errors.endTime = 'Waktu selesai harus setelah waktu mulai.';
    const duration = (end.getTime() - start.getTime()) / 60000;
    if (!errors.endTime && duration < rules.minMinutes) errors.endTime = `Durasi minimum ${rules.minMinutes} menit.`;
    if (!errors.endTime && duration > rules.maxHours * 60) errors.endTime = `Durasi maksimum ${rules.maxHours} jam.`;
    if (!errors.startTime && start.getTime() > Date.now() + rules.maxDaysAhead * 86_400_000) {
      errors.startTime = `Pemesanan maksimal ${rules.maxDaysAhead} hari ke depan.`;
    }
    if (!errors.startTime && !errors.endTime && booking.startTime.slice(0, 10) !== booking.endTime.slice(0, 10)) {
      errors.endTime = 'Peminjaman yang melintasi tengah malam atau beberapa hari tidak diperbolehkan.';
    }
    if (bookingSchedule && !errors.endTime) {
      const date = booking.startTime.slice(0, 10);
      const closure = (bookingSchedule.closures ?? []).find((item: any) => item.startDate.slice(0, 10) <= date && item.endDate.slice(0, 10) >= date);
      if (closure) errors.startTime = `Ruangan ditutup: ${closure.reason}`;
      const hours = hoursForBooking();
      const day = new Date(`${date}T00:00:00+07:00`).getUTCDay();
      if (!closure && (hours?.isClosed || (hours?.operatingDays && !hours.operatingDays.includes(day)))) errors.startTime = 'Ruangan tutup pada hari yang dipilih.';
      if (!closure && hours?.openTime && hours?.closeTime) {
        const startMinute = start.getUTCHours() * 60 + start.getUTCMinutes() + 7 * 60;
        const endMinute = end.getUTCHours() * 60 + end.getUTCMinutes() + 7 * 60;
        const minuteOfDay = (value: number) => ((value % 1440) + 1440) % 1440;
        const open = Number(hours.openTime.slice(0, 2)) * 60 + Number(hours.openTime.slice(3));
        const close = Number(hours.closeTime.slice(0, 2)) * 60 + Number(hours.closeTime.slice(3));
        if (minuteOfDay(startMinute) < open || minuteOfDay(endMinute) > close) errors.startTime = `Jam operasional ruangan ${hours.openTime}–${hours.closeTime} WIB.`;
      }
    }
    bookingErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function submitBooking() {
    if (!validateBooking() || !bookingRoom) return;
    savingBooking = true;
    try {
      const result = await apiRequest(bookingQueueOnly ? '/bookings/waitlist' : '/bookings', {
        method: 'POST',
        body: JSON.stringify({
          roomId: bookingRoom.id,
          title: booking.title.trim(),
          purpose: booking.purpose.trim(),
          attendees: Number(booking.attendees),
          startTime: fromWibInput(booking.startTime).toISOString(),
          endTime: fromWibInput(booking.endTime).toISOString()
        })
      });
      toastSuccess(result.message);
      bookingRoom = null;
      bookingQueueOnly = false;
      refreshBadges();
      await loadRooms();
    } catch (e) {
      handleApiError(e);
    } finally {
      savingBooking = false;
    }
  }

  async function openSchedule(room: any) {
    scheduleRoom = room;
    schedule = [];
    scheduleError = '';
    scheduleLoading = true;
    try {
      const result = await apiRequest(`/rooms/${room.id}/schedule${qs({ from: todayKey(), to: addDays(todayKey(), 6) })}`);
      schedule = result.data.bookings;
      scheduleClosures = result.data.closures ?? [];
      scheduleHours = result.data.operatingHours;
    } catch (e) {
      scheduleError = handleApiError(e, 'Gagal memuat jadwal ruangan', true);
    } finally {
      scheduleLoading = false;
    }
  }

  onMount(async () => {
    try {
      const [categoryResult, ruleResult] = await Promise.all([
        apiRequest('/rooms/categories'),
        apiRequest('/bookings/rules')
      ]);
      categories = categoryResult.data;
      rules = ruleResult.data;
    } catch (e) {
      handleApiError(e, 'Gagal memuat konfigurasi katalog', true);
    }
    await loadRooms();
  });
</script>

<svelte:head><title>Katalog Ruangan — RuangKu</title></svelte:head>

<div class="page">
  <div class="page-head"><div><div class="kicker">Jelajahi kampus</div><h1 class="page-title">Katalog ruangan</h1><p class="page-desc">Cari ruangan berdasarkan nama, gedung, kategori, dan kapasitas. Periksa jadwal sebelum mengajukan.</p></div></div>

  <section class="card filters">
    <div class="search-row">
      <input class="input input-search" bind:value={q} oninput={search} placeholder="Cari nama, kode, atau gedung…" aria-label="Cari ruangan" />
      <select class="select" bind:value={category} onchange={loadRooms} aria-label="Kategori ruangan">
        <option value="">Semua kategori</option>{#each categories as item}<option value={item.name}>{item.name} ({item.total})</option>{/each}
      </select>
      <input class="input capacity" type="number" min="1" bind:value={minCapacity} oninput={search} placeholder="Kapasitas min." aria-label="Kapasitas minimum" />
    </div>
    <div class="availability">
      <label class="switch"><input type="checkbox" bind:checked={checkAvailability} onchange={toggleAvailability} /> Periksa status ketersediaan pada waktu tertentu</label>
      {#if checkAvailability}
        <div class="time-filters">
          <label class="field"><span>Mulai</span><input class="input" type="datetime-local" bind:value={availabilityStart} oninput={() => availabilityMessage = ''} /></label>
          <label class="field"><span>Selesai</span><input class="input" type="datetime-local" bind:value={availabilityEnd} oninput={() => availabilityMessage = ''} /></label>
          <button class="btn btn-primary" onclick={loadRooms} disabled={!availabilityStart || !availabilityEnd}><Icon name="search" size={15} /> Periksa</button>
        </div>
        {#if availabilityMessage}<p class="availability-message" role="status">{availabilityMessage}</p>{/if}
      {/if}
    </div>
  </section>

  {#if error}<section class="card"><ErrorState message={error} onretry={loadRooms} /></section>
  {:else if loading && rooms.length === 0}<div class="loading">Memuat katalog ruangan…</div>
  {:else if rooms.length === 0}<section class="card"><EmptyState icon="rooms" title="Ruangan tidak ditemukan" message="Ubah kata pencarian atau filter kapasitas dan jadwal." /></section>
  {:else}
    <div class="result-count">{rooms.length} ruangan ditemukan</div>
    <div class="grid">
      {#each rooms as room (room.id)}
        <article class="card room">
          <div class="photo">
            {#if room.imageUrl}<img src={assetUrl(room.imageUrl) ?? ''} alt="Foto {room.name}" loading="lazy" />{:else}<div class="placeholder"><Icon name="rooms" size={30} /><span>{room.code}</span></div>{/if}
            <span class="badge {room.availability?.status === 'OCCUPIED' || room.inUseNow ? 'pending' : 'approved'}"><i></i>{room.availability?.message ?? (room.inUseNow ? 'Sedang digunakan' : 'Tersedia sekarang')}</span>
          </div>
          <div class="body">
            <div class="row-between"><h2>{room.name}</h2><span class="capacity-badge">{room.capacity} orang</span></div>
            <p class="location"><Icon name="pin" size={14} /> {room.location} · {room.code}</p>
            {#if room.category}<span class="category">{room.category}</span>{/if}
            {#if room.description}<p class="description">{room.description}</p>{/if}
            {#if room.facilities}<p class="facilities"><b>Fasilitas:</b> {room.facilities}</p>{/if}
            <p class="queue-info">
              Antrean {room.waitlistCount ?? 0} orang
              {#if room.myWaitlistPosition} · Posisi Anda #{room.myWaitlistPosition}{/if}
            </p>
            <div class="actions">
              <button class="btn btn-ghost btn-sm" onclick={() => openSchedule(room)}><Icon name="schedule" size={14} /> Lihat jadwal</button>
              {#if room.availability?.status === 'OCCUPIED'}
                <button class="btn btn-primary btn-sm" onclick={() => openBooking(room, true)}><Icon name="schedule" size={14} /> Gabung antrean</button>
              {:else}
                <button class="btn btn-primary btn-sm" onclick={() => openBooking(room)}><Icon name="plus" size={14} /> Ajukan booking</button>
              {/if}
            </div>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<Modal open={scheduleRoom !== null} title={scheduleRoom?.name ?? 'Jadwal ruangan'} subtitle={scheduleRoom ? `${scheduleRoom.location} · 7 hari ke depan` : undefined} size="md" onclose={() => (scheduleRoom = null)}>
  {#if scheduleRoom}
    <p class="availability-detail">
      {scheduleRoom.availability?.message ?? 'Status ketersediaan belum tersedia'} · Antrean {scheduleRoom.waitlistCount ?? 0} orang
      {#if scheduleRoom.myWaitlistPosition} · Posisi Anda #{scheduleRoom.myWaitlistPosition}{/if}
    </p>
  {/if}
  {#if scheduleLoading}<div class="loading">Memuat jadwal…</div>
  {:else if scheduleError}<ErrorState message={scheduleError} onretry={() => scheduleRoom && openSchedule(scheduleRoom)} />
  {:else}
    {#if scheduleHours}<p class="hint">Jam operasional: {Array.isArray(scheduleHours) ? 'berlaku sesuai hari' : `${scheduleHours.openTime}–${scheduleHours.closeTime} WIB`}.</p>{/if}
    {#each scheduleClosures as closure (closure.id)}<p class="closure-hint">{closure.startDate.slice(0, 10)} – {closure.endDate.slice(0, 10)} · {closure.reason}</p>{/each}
    {#if schedule.length === 0}<EmptyState icon="schedule" title="Belum ada jadwal terpakai" message="Tidak ada booking pending atau disetujui dalam 7 hari ke depan." />
    {:else}
    <div class="schedule-list">
      {#each schedule as slot (slot.id)}
        <div class="schedule-row"><span><b>{fmtDate(slot.startTime)}</b><small>{fmtTime(slot.startTime)}–{fmtTime(slot.endTime)} WIB</small></span><StatusBadge status={slot.status} /></div>
      {/each}
    </div>
    {/if}
  {/if}
  {#if scheduleRoom?.availability?.status === 'OCCUPIED'}
    <button class="btn btn-primary" onclick={() => { const room = scheduleRoom; scheduleRoom = null; openBooking(room, true); }}>
      <Icon name="schedule" size={15} /> Gabung antrean untuk waktu terpilih
    </button>
  {/if}
</Modal>

<Modal open={bookingRoom !== null} title={bookingQueueOnly ? 'Gabung antrean' : 'Ajukan peminjaman'} subtitle={bookingRoom ? `${bookingRoom.name} · ${bookingRoom.location}` : undefined} onclose={() => (bookingRoom = null)}>
  <form class="booking-form" onsubmit={(event) => { event.preventDefault(); submitBooking(); }}>
    <label class="field"><span>Nama kegiatan</span><input class="input {bookingErrors.title ? 'invalid' : ''}" bind:value={booking.title} maxlength="150" required />{#if bookingErrors.title}<small class="err-text">{bookingErrors.title}</small>{/if}</label>
    <label class="field"><span>Jumlah peserta</span><input class="input {bookingErrors.attendees ? 'invalid' : ''}" type="number" bind:value={booking.attendees} min="1" max={bookingRoom?.capacity ?? undefined} required /><small class="hint">Kapasitas ruangan maksimal {bookingRoom?.capacity ?? '—'} orang.</small>{#if bookingErrors.attendees}<small class="err-text">{bookingErrors.attendees}</small>{/if}</label>
    <label class="field"><span>Tujuan peminjaman</span><textarea class="textarea {bookingErrors.purpose ? 'invalid' : ''}" bind:value={booking.purpose} maxlength="2000" required></textarea>{#if bookingErrors.purpose}<small class="err-text">{bookingErrors.purpose}</small>{/if}</label>
    <div class="time-filters">
      <label class="field"><span>Waktu mulai</span><input class="input {bookingErrors.startTime ? 'invalid' : ''}" type="datetime-local" bind:value={booking.startTime} onchange={loadBookingSchedule} required />{#if bookingErrors.startTime}<small class="err-text">{bookingErrors.startTime}</small>{/if}</label>
      <label class="field"><span>Waktu selesai</span><input class="input {bookingErrors.endTime ? 'invalid' : ''}" type="datetime-local" bind:value={booking.endTime} required />{#if bookingErrors.endTime}<small class="err-text">{bookingErrors.endTime}</small>{/if}</label>
    </div>
    {#if bookingSchedule}<p class="hint">{#if (bookingSchedule.closures ?? []).length}Penutupan pada tanggal terpilih: {bookingSchedule.closures[0].reason}{:else if hoursForBooking()?.isClosed || (hoursForBooking()?.operatingDays && !hoursForBooking().operatingDays.includes(new Date(`${booking.startTime.slice(0, 10)}T00:00:00+07:00`).getUTCDay()))}Ruangan tutup pada tanggal terpilih.{:else if hoursForBooking()?.openTime}Jam operasional: {hoursForBooking().openTime}–{hoursForBooking().closeTime} WIB.{:else}Jam operasional tidak dibatasi.{/if}</p>{/if}
    <p class="hint">Durasi {rules.minMinutes} menit–{rules.maxHours} jam. Pengajuan paling jauh {rules.maxDaysAhead} hari sebelumnya dan akan menunggu persetujuan.</p>
  </form>
  {#snippet footer()}
    <button class="btn btn-ghost" onclick={() => (bookingRoom = null)} disabled={savingBooking}>Kembali</button>
    <button class="btn btn-primary" onclick={submitBooking} disabled={savingBooking}>{#if savingBooking}<span class="spinner"></span>{/if} {bookingQueueOnly ? 'Gabung antrean' : 'Kirim pengajuan'}</button>
  {/snippet}
</Modal>

<style>
  .filters { padding:18px; display:grid; gap:16px; }
  .search-row { display:grid; grid-template-columns:minmax(220px,1fr) minmax(160px,.55fr) 150px; gap:10px; }
  .availability { display:grid; gap:14px; padding-top:14px; border-top:1px solid var(--line-2); }
  .availability-message { margin: -4px 0 0; color: var(--ink-3); font-size: 12px; }
  .availability-detail { margin: 0 0 12px; color: var(--ink-2); font-size: 12px; }
  .time-filters { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)) auto; align-items:end; gap:12px; }
  .field { display:grid; gap:6px; } .field>span { font-size:12px; font-weight:600; color:var(--ink-2); }
  .result-count { color:var(--ink-3); font-size:12px; }
  .grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; }
  .room { overflow:hidden; } .photo { position:relative; height:170px; background:#f1eee6; } .photo>img { width:100%; height:100%; object-fit:cover; }
  .photo>.badge { position:absolute; top:12px; left:12px; }
  .placeholder { display:grid; place-items:center; align-content:center; gap:8px; height:100%; color:var(--gold-deep); background:linear-gradient(135deg,#f7f0e2,#e9e1d1); font-size:12px; font-weight:700; }
  .body { padding:16px; } .body h2 { font:600 19px var(--font); color:var(--navy); }
  .capacity-badge { padding:4px 8px; border-radius:99px; background:var(--gold-tint); color:var(--gold-deep); font-size:10px; font-weight:700; white-space:nowrap; }
  .location { display:flex; align-items:center; gap:5px; margin-top:7px; color:var(--ink-3); font-size:11.5px; }
  .category { display:inline-block; margin-top:10px; padding:3px 8px; border-radius:99px; background:#f1f3f6; color:var(--ink-2); font-size:10px; }
  .description { margin-top:10px; color:var(--ink-2); font-size:12px; line-height:1.55; }
  .facilities { margin-top:9px; color:var(--ink-3); font-size:11px; }
  .queue-info { margin-top:9px; color:var(--ink-3); font-size:11.5px; }
  .actions { display:flex; justify-content:space-between; gap:8px; margin-top:16px; padding-top:13px; border-top:1px solid var(--line-2); }
  .schedule-list { display:grid; gap:9px; } .schedule-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px; border:1px solid var(--line); border-radius:12px; }
  .closure-hint { padding:10px 12px; border-radius:10px; background:#fff3f1; color:#b42318; font-size:12px; }
  .schedule-row b,.schedule-row small { display:block; } .schedule-row b { color:var(--navy); font-size:12px; } .schedule-row small { margin-top:3px; color:var(--ink-3); font-size:11px; }
  .booking-form { display:grid; gap:15px; } .hint { margin-top:2px; color:var(--ink-3); font-size:11.5px; }
  .loading { padding:24px; text-align:center; color:var(--ink-3); }
  @media(max-width:1050px) { .grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media(max-width:700px) { .search-row,.time-filters { grid-template-columns:1fr; } .grid { grid-template-columns:1fr; } .actions .btn { flex:1; padding-inline:8px; } }
</style>
