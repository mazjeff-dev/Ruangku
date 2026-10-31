<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../../lib/components/Icon.svelte';
  import ErrorState from '../../../lib/components/ErrorState.svelte';
  import BookingDetailModal from '../../../lib/components/BookingDetailModal.svelte';
  import { apiRequest, qs } from '../../../lib/api';
  import { handleApiError, refreshBadges } from '../../../lib/stores/app.svelte';
  import { DAYS_SHORT, MONTHS, addDays, addMonths, dateKey, dayStartMs, fmtTime, longDate, monthStart, startOfWeek, todayKey } from '../../../lib/utils';

  type View = 'day' | 'week' | 'month';
  type Ev = { id: number; title: string; status: string; startTime: string; endTime: string; room: { id: number; name: string; code: string }; student: { name: string } };

  const OPEN_H = 7, CLOSE_H = 21, PX = 56, DAY_MS = 86400000;

  let view = $state<View>('week');
  let anchor = $state(todayKey());
  let roomId = $state('');
  let events = $state<Ev[]>([]);
  let rooms = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let detailId = $state<number | null>(null);
  const today = todayKey();

  const range = $derived.by(() => {
    if (view === 'day') return { from: anchor, to: anchor };
    if (view === 'week') { const s = startOfWeek(anchor); return { from: s, to: addDays(s, 6) }; }
    const s = startOfWeek(monthStart(anchor)); return { from: s, to: addDays(s, 41) };
  });

  const title = $derived.by(() => {
    if (view === 'day') return longDate(anchor);
    if (view === 'week') { const a = range.from, b = range.to; return `${Number(a.slice(8))} ${MONTHS[Number(a.slice(5, 7)) - 1]} – ${Number(b.slice(8))} ${MONTHS[Number(b.slice(5, 7)) - 1]} ${b.slice(0, 4)}`; }
    return `${MONTHS[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`;
  });

  async function load() {
    loading = true; error = '';
    try {
      const r = await apiRequest(`/admin/schedule${qs({ from: range.from, to: range.to, roomId })}`);
      events = r.data.bookings; rooms = r.data.rooms;
    } catch (e) { error = handleApiError(e, 'Gagal memuat jadwal', true); }
    finally { loading = false; }
  }

  function setView(v: View) { view = v; load(); }
  function step(dir: number) {
    anchor = view === 'day' ? addDays(anchor, dir) : view === 'week' ? addDays(anchor, 7 * dir) : addMonths(anchor, dir);
    load();
  }
  function goToday() { anchor = todayKey(); load(); }
  function openDay(key: string) { anchor = key; view = 'day'; load(); }

  // ---- util waktu ----
  const evStart = (e: Ev) => new Date(e.startTime).getTime();
  const evEnd = (e: Ev) => new Date(e.endTime).getTime();

  function eventsOnDay(key: string, list = events) {
    const s = dayStartMs(key), e = s + DAY_MS;
    return list.filter((ev) => evStart(ev) < e && evEnd(ev) > s);
  }

  /** menit terpakai dalam jam operasional (gabungan interval per ruangan, tanpa dobel hitung) */
  function busyMinutes(key: string) {
    const s0 = dayStartMs(key) + OPEN_H * 3600000, e0 = dayStartMs(key) + CLOSE_H * 3600000;
    const byRoom = new Map<number, [number, number][]>();
    for (const ev of eventsOnDay(key)) {
      const a = Math.max(evStart(ev), s0), b = Math.min(evEnd(ev), e0);
      if (b > a) byRoom.set(ev.room.id, [...(byRoom.get(ev.room.id) ?? []), [a, b]]);
    }
    let total = 0;
    for (const list of byRoom.values()) {
      list.sort((x, y) => x[0] - y[0]);
      let [cs, ce] = list[0];
      for (const [a, b] of list.slice(1)) { if (a <= ce) ce = Math.max(ce, b); else { total += ce - cs; cs = a; ce = b; } }
      total += ce - cs;
    }
    return total / 60000;
  }
  const bookable = $derived(roomId ? 1 : Math.max(1, rooms.filter((r) => r.isAvailable).length));
  const occupancy = (key: string) => Math.min(100, Math.round((busyMinutes(key) / ((CLOSE_H - OPEN_H) * 60 * bookable)) * 100));

  // ---- grid waktu (hari / minggu) ----
  const hours = $derived.by(() => {
    let lo = OPEN_H, hi = CLOSE_H;
    for (const ev of events) {
      lo = Math.min(lo, Number(fmtTime(ev.startTime).slice(0, 2)));
      const eh = Number(fmtTime(ev.endTime).slice(0, 2)) + (fmtTime(ev.endTime).slice(3) !== '00' ? 1 : 0);
      hi = Math.max(hi, eh || 24);
    }
    return { lo: Math.max(0, lo), hi: Math.min(24, hi) };
  });
  const hourLabels = $derived(Array.from({ length: hours.hi - hours.lo }, (_, i) => hours.lo + i));

  type Col = { key: string; label: string; sub: string; today?: boolean; items: { ev: Ev; top: number; height: number; lane: number; lanes: number }[]; busy: number };

  function layout(key: string, list: Ev[]) {
    const ds = dayStartMs(key);
    const items = list.map((ev) => {
      const s = Math.max(evStart(ev), ds), e = Math.min(evEnd(ev), ds + DAY_MS);
      return { ev, s, e, top: ((s - ds) / 60000 - hours.lo * 60) * (PX / 60), height: Math.max(26, ((e - s) / 60000) * (PX / 60) - 2), lane: 0, lanes: 1 };
    }).sort((a, b) => a.s - b.s);
    // kelompokkan yang saling tumpang-tindih, beri jalur (lane) agar tidak menumpuk
    let cluster: typeof items = [], clusterEnd = 0;
    const flush = () => { const n = Math.max(0, ...cluster.map((c) => c.lane)) + 1; cluster.forEach((c) => (c.lanes = n)); cluster = []; };
    for (const it of items) {
      if (cluster.length && it.s >= clusterEnd) flush();
      const used = new Set(cluster.filter((c) => c.e > it.s).map((c) => c.lane));
      let lane = 0; while (used.has(lane)) lane++;
      it.lane = lane; cluster.push(it); clusterEnd = Math.max(clusterEnd, it.e);
    }
    flush();
    return items;
  }

  const cols = $derived.by<Col[]>(() => {
    if (view === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const key = addDays(range.from, i);
        return { key, label: DAYS_SHORT[i], sub: String(Number(key.slice(8))), today: key === today, items: layout(key, eventsOnDay(key)), busy: occupancy(key) };
      });
    }
    if (view === 'day') {
      const list = roomId ? rooms.filter((r) => String(r.id) === roomId) : rooms.filter((r) => r.isAvailable);
      return list.map((r) => {
        const evs = eventsOnDay(anchor).filter((e) => e.room.id === r.id);
        return { key: String(r.id), label: r.name, sub: r.code, items: layout(anchor, evs), busy: Math.min(100, Math.round((busyMinutes(anchor) && evs.reduce((t, e) => t + (Math.min(evEnd(e), dayStartMs(anchor) + CLOSE_H * 3600000) - Math.max(evStart(e), dayStartMs(anchor) + OPEN_H * 3600000)) / 60000, 0)) / ((CLOSE_H - OPEN_H) * 60) * 100)) };
      });
    }
    return [];
  });

  const monthDays = $derived(Array.from({ length: 42 }, (_, i) => addDays(range.from, i)));
  const nowLine = $derived.by(() => {
    const now = Date.now(); const ds = dayStartMs(today);
    return ((now - ds) / 60000 - hours.lo * 60) * (PX / 60);
  });
  const gridHeight = $derived(hourLabels.length * PX);

  function onChanged() { load(); refreshBadges(); }
  onMount(async () => { await load(); });
</script>

<svelte:head><title>Jadwal — RuangKu Admin</title></svelte:head>

<div class="page">
  <div class="page-head"><div>
    <div class="kicker">Pengelolaan</div>
    <h1 class="page-title">Jadwal ruangan</h1>
    <p class="page-desc">Lihat ketersediaan dan pemakaian ruangan per hari, minggu, atau bulan.</p>
  </div></div>

  <section class="card bar">
    <div class="nav">
      <button class="btn btn-ghost btn-icon" onclick={() => step(-1)} aria-label="Sebelumnya"><Icon name="chevL" /></button>
      <button class="btn btn-ghost" onclick={goToday}>Hari ini</button>
      <button class="btn btn-ghost btn-icon" onclick={() => step(1)} aria-label="Berikutnya"><Icon name="chevR" /></button>
      <h2>{title}</h2>
    </div>
    <div class="ctrl">
      <select class="select" bind:value={roomId} onchange={load} aria-label="Filter ruangan">
        <option value="">Semua ruangan</option>
        {#each rooms as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
      </select>
      <div class="seg" role="group" aria-label="Tampilan">
        {#each [['day', 'Hari'], ['week', 'Minggu'], ['month', 'Bulan']] as [k, l]}
          <button class:on={view === k} onclick={() => setView(k as View)}>{l}</button>
        {/each}
      </div>
    </div>
  </section>

  <div class="legend">
    <span><i class="lg free"></i>Tersedia</span><span><i class="lg appr"></i>Terpakai (disetujui)</span><span><i class="lg pend"></i>Menunggu persetujuan</span><span><i class="lg done"></i>Selesai</span>
  </div>

  <section class="card board" class:dim={loading}>
    {#if error}
      <ErrorState message={error} onretry={load} />
    {:else if view === 'month'}
      <div class="mhead">{#each DAYS_SHORT as d}<span>{d}</span>{/each}</div>
      <div class="mgrid">
        {#each monthDays as key (key)}
          {@const list = eventsOnDay(key)}
          {@const pct = occupancy(key)}
          <button class="mcell" class:out={key.slice(0, 7) !== anchor.slice(0, 7)} class:today={key === today} onclick={() => openDay(key)} aria-label="Buka {longDate(key)}">
            <span class="num">{Number(key.slice(8))}</span>
            {#each list.slice(0, 2) as ev (ev.id)}
              <span class="chip {ev.status.toLowerCase()}" title="{ev.room.name} · {ev.title}"><b>{fmtTime(ev.startTime)}</b> {ev.title}</span>
            {/each}
            {#if list.length > 2}<span class="more">+{list.length - 2} lagi</span>{/if}
            <span class="occ">
              <span class="occbar"><i style="width:{pct}%"></i></span>
              <small>{list.length === 0 ? 'Tersedia' : `${pct}% terpakai`}</small>
            </span>
          </button>
        {/each}
      </div>
    {:else}
      <div class="tg">
        <div class="tg-head" style="--n:{cols.length}">
          <span class="corner"></span>
          {#each cols as c (c.key)}
            <button class="ch" class:today={c.today} onclick={() => view === 'week' && openDay(c.key)} disabled={view === 'day'}>
              <b>{c.label}</b><small>{c.sub}</small>
              <span class="mini"><i style="width:{c.busy}%"></i></span>
            </button>
          {/each}
        </div>
        {#if cols.length === 0}
          <div class="state"><p>Tidak ada ruangan aktif untuk ditampilkan.</p></div>
        {:else}
          <div class="tg-body" style="--n:{cols.length}; height:{gridHeight}px">
            <div class="times">{#each hourLabels as h}<span style="height:{PX}px">{String(h).padStart(2, '0')}:00</span>{/each}</div>
            {#each cols as c (c.key)}
              <div class="col" class:todaycol={c.today} style="background-size: 100% {PX}px">
                {#if (view === 'day' ? anchor === today : c.today) && nowLine > 0 && nowLine < gridHeight}<span class="now" style="top:{nowLine}px"></span>{/if}
                {#each c.items as it (it.ev.id)}
                  <button class="ev {it.ev.status.toLowerCase()}" style="top:{it.top}px; height:{it.height}px; left:calc({(it.lane / it.lanes) * 100}% + 2px); width:calc({100 / it.lanes}% - 4px)" onclick={() => (detailId = it.ev.id)}
                    title="{it.ev.title} — {it.ev.student.name} ({it.ev.room.name})">
                    <b>{fmtTime(it.ev.startTime)}–{fmtTime(it.ev.endTime)}</b>
                    <span>{it.ev.title}</span>
                    {#if it.height > 62}<em>{view === 'week' ? it.ev.room.name : it.ev.student.name}</em>{/if}
                  </button>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </div>
      {#if !loading && events.length === 0}<p class="empty-note">Tidak ada peminjaman pada periode ini — semua ruangan tersedia.</p>{/if}
    {/if}
  </section>
</div>

<BookingDetailModal bookingId={detailId} onclose={() => (detailId = null)} onchanged={onChanged} />

<style>
  .bar { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; padding: 14px 16px; }
  .nav { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; } .nav h2 { margin-left: 8px; font-size: 20px; color: var(--navy); }
  .ctrl { display: flex; gap: 10px; flex-wrap: wrap; } .ctrl .select { min-width: 190px; }
  .seg { display: inline-flex; padding: 3px; background: #efece3; border-radius: 12px; }
  .seg button { height: 34px; padding: 0 16px; border: 0; border-radius: 9px; background: transparent; font-size: 13px; font-weight: 600; color: var(--ink-2); transition: all .18s var(--ease); }
  .seg button.on { background: var(--navy); color: #fff; box-shadow: var(--shadow-sm); }
  .legend { display: flex; gap: 8px 20px; flex-wrap: wrap; font-size: 12px; color: var(--ink-2); } .legend span { display: inline-flex; gap: 7px; align-items: center; }
  .lg { width: 12px; height: 12px; border-radius: 4px; } .lg.free { background: #fff; border: 1px solid var(--line); } .lg.appr { background: var(--navy-3); } .lg.pend { background: var(--gold-soft); border: 1px dashed var(--gold-deep); } .lg.done { background: #7d93b8; }
  .board { overflow: hidden; transition: opacity .2s; } .board.dim { opacity: .6; }
  .empty-note { padding: 14px 20px; text-align: center; font-size: 12.5px; color: var(--ink-3); border-top: 1px solid var(--line-2); }

  .mhead { display: grid; grid-template-columns: repeat(7, 1fr); background: #fbfaf7; border-bottom: 1px solid var(--line); }
  .mhead span { padding: 11px 12px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); }
  .mgrid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .mcell { display: flex; flex-direction: column; gap: 4px; min-height: 124px; padding: 8px; text-align: left; border: 0; border-right: 1px solid var(--line-2); border-bottom: 1px solid var(--line-2); background: #fff; transition: background .15s; overflow: hidden; }
  .mcell:nth-child(7n) { border-right: 0; } .mcell:hover { background: #fcfaf4; }
  .mcell.out { background: #faf9f6; } .mcell.out .num { color: #bcb7a8; }
  .num { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; font-size: 12.5px; font-weight: 600; color: var(--navy); }
  .mcell.today .num { background: var(--navy); color: #fff; }
  .chip { display: block; padding: 2px 7px; border-radius: 6px; font-size: 11px; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip.approved { background: var(--navy-3); color: #fff; } .chip.pending { background: var(--gold-tint); color: var(--gold-deep); border: 1px dashed var(--gold); } .chip.completed { background: #dfe7f4; color: #3a5a8c; }
  .more { font-size: 11px; font-weight: 400; color: var(--ink-3); padding-left: 4px; }
  .occ { margin-top: auto; display: grid; gap: 3px; } .occ small { font-size: 10.5px; font-weight: 400; color: var(--ink-3); }
  .occbar { height: 4px; border-radius: 4px; background: #efece3; overflow: hidden; } .occbar i { display: block; height: 100%; background: var(--gold); border-radius: 4px; transition: width .4s var(--ease); }

  .tg { overflow-x: auto; }
  .tg-head, .tg-body { display: grid; grid-template-columns: 56px repeat(var(--n), minmax(120px, 1fr)); min-width: calc(56px + var(--n) * 120px); }
  .tg-head { position: sticky; top: 0; z-index: 3; background: #fbfaf7; border-bottom: 1px solid var(--line); }
  .ch { display: grid; justify-items: center; gap: 1px; padding: 10px 6px 9px; border: 0; border-left: 1px solid var(--line-2); background: transparent; }
  .ch:not(:disabled) { cursor: pointer; } .ch:not(:disabled):hover { background: #f6f2e8; }
  .ch b { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-3); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ch small { font-size: 15px; font-weight: 700; color: var(--navy); }
  .ch.today small { display: inline-grid; place-items: center; min-width: 30px; height: 30px; border-radius: 50%; background: var(--navy); color: #fff; }
  .mini { width: 60%; height: 3px; margin-top: 5px; border-radius: 3px; background: #ebe7da; overflow: hidden; } .mini i { display: block; height: 100%; background: var(--gold); }
  .tg-body { position: relative; }
  .times span { display: block; padding: 0 8px; font-size: 11px; color: var(--ink-3); text-align: right; transform: translateY(-8px); }
  .times span:first-child { transform: none; }
  .col { position: relative; border-left: 1px solid var(--line-2); background-image: linear-gradient(to bottom, var(--line-2) 1px, transparent 1px); }
  .col.todaycol { background-color: #fffcf4; }
  .now { position: absolute; left: 0; right: 0; height: 2px; background: #d9534f; z-index: 2; } .now::before { content: ''; position: absolute; left: -4px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: #d9534f; }
  .ev { position: absolute; display: grid; align-content: start; gap: 1px; padding: 5px 8px; text-align: left; border-radius: 9px; border: 0; overflow: hidden; font-size: 11.5px; line-height: 1.3; transition: transform .15s var(--ease), box-shadow .15s; z-index: 1; }
  .ev:hover { transform: scale(1.02); box-shadow: var(--shadow); z-index: 4; }
  .ev b { font-size: 11px; opacity: .85; } .ev span { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ev em { font-style: normal; font-size: 11px; font-weight: 400; opacity: .8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ev.approved { background: var(--navy-3); color: #fff; border-left: 4px solid var(--gold); }
  .ev.pending { background: repeating-linear-gradient(135deg, #f6efe1, #f6efe1 8px, #f0e6d0 8px, #f0e6d0 16px); color: var(--gold-deep); border: 1px dashed var(--gold); }
  .ev.completed { background: #7d93b8; color: #fff; }
  @media (max-width: 720px) { .mcell { min-height: 84px; padding: 5px; } .chip, .occ small { display: none; } .more { font-size: 10px; } .ctrl .select { min-width: 0; flex: 1; } .nav h2 { width: 100%; margin: 6px 0 0; font-size: 17px; } }
</style>
