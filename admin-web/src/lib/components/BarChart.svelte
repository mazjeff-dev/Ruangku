<script lang="ts">
  type Point = { date: string; total: number; PENDING: number; APPROVED: number; REJECTED: number; CANCELLED: number; COMPLETED: number };
  type Props = { points: Point[]; granularity: 'day' | 'month' };
  let { points, granularity }: Props = $props();

  const SERIES = [
    { key: 'APPROVED', label: 'Disetujui', color: '#3f7d58' },
    { key: 'PENDING', label: 'Menunggu', color: '#c6a56b' },
    { key: 'REJECTED', label: 'Ditolak', color: '#c76a6a' },
    { key: 'CANCELLED', label: 'Dibatalkan', color: '#a3acbb' },
    { key: 'COMPLETED', label: 'Selesai', color: '#4d6fa3' }
  ] as const;

  const max = $derived(Math.max(1, ...points.map((p) => p.total)));
  const niceMax = $derived(max <= 4 ? 4 : Math.ceil(max / 4) * 4);
  const ticks = $derived([1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(niceMax * f)));
  const every = $derived(Math.max(1, Math.ceil(points.length / 12)));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function label(date: string) {
    if (granularity === 'month') return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(2, 4)}`;
    return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
  }
  function tip(p: Point) {
    const parts = SERIES.filter((s) => p[s.key] > 0).map((s) => `${s.label}: ${p[s.key]}`);
    return `${label(p.date)} — total ${p.total}${parts.length ? '\n' + parts.join(', ') : ''}`;
  }
</script>

<div class="chart">
  <div class="plot">
    <div class="y">{#each ticks as t}<span>{t}</span>{/each}</div>
    <div class="area">
      <div class="grid">{#each ticks as _}<i></i>{/each}</div>
      <div class="bars" style="--n:{points.length}">
        {#each points as p, i (p.date)}
          <div class="col" title={tip(p)}>
            <div class="stack" style="height:{(p.total / niceMax) * 100}%">
              {#each SERIES as s}
                {#if p[s.key] > 0}<span style="flex:{p[s.key]}; background:{s.color}"></span>{/if}
              {/each}
            </div>
            <em class:show={i % every === 0}>{label(p.date)}</em>
          </div>
        {/each}
      </div>
    </div>
  </div>
  <div class="legend">
    {#each SERIES as s}<span><i style="background:{s.color}"></i>{s.label}</span>{/each}
  </div>
</div>

<style>
  .chart { padding: 8px 22px 20px; }
  .plot { display: grid; grid-template-columns: 28px 1fr; gap: 8px; height: 250px; padding-bottom: 26px; }
  .y { display: flex; flex-direction: column; justify-content: space-between; text-align: right; font-size: 11px; color: var(--ink-3); transform: translateY(-7px); height: calc(100% + 14px); }
  .area { position: relative; }
  .grid { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; }
  .grid i { border-top: 1px dashed var(--line); }
  .bars { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: clamp(2px, 0.6vw, 8px); align-items: end; }
  .col { position: relative; height: 100%; display: flex; align-items: flex-end; justify-content: center; }
  .stack { width: 100%; max-width: 34px; min-height: 0; display: flex; flex-direction: column-reverse; border-radius: 6px 6px 2px 2px; overflow: hidden; transform-origin: bottom; animation: grow .6s var(--ease) both; transition: filter .15s; }
  .col:hover .stack { filter: brightness(1.08); }
  .stack span { min-height: 2px; }
  .col em { position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); font-style: normal; font-size: 10.5px; color: var(--ink-3); white-space: nowrap; visibility: hidden; }
  .col em.show { visibility: visible; }
  .legend { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 4px; font-size: 12px; color: var(--ink-2); }
  .legend span { display: inline-flex; align-items: center; gap: 7px; } .legend i { width: 10px; height: 10px; border-radius: 3px; }
  @keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
</style>
