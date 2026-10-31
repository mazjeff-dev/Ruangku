<script lang="ts">
  import { goto } from '$app/navigation';
  import Icon from './Icon.svelte';
  import { apiRequest } from '../api';
  import { app, refreshBadges, handleApiError } from '../stores/app.svelte';
  import { fmtRelative, initials } from '../utils';
  import { page } from '$app/state';

  type Props = { ontoggle: () => void };
  let { ontoggle }: Props = $props();

  const TITLES: Record<string, string> = {
    '/': 'Dashboard', '/bookings': 'Peminjaman', '/schedule': 'Jadwal Ruangan',
    '/rooms': 'Manajemen Ruangan', '/students': 'Mahasiswa', '/notifications': 'Notifikasi', '/settings': 'Pengaturan'
  };
  const title = $derived(TITLES[page.url.pathname] ?? 'RuangKu');

  let open = $state(false);
  let items = $state<any[]>([]);
  let loading = $state(false);

  async function toggle() {
    open = !open;
    if (!open) return;
    loading = true;
    try {
      items = (await apiRequest('/notifications?pageSize=6')).data;
    } catch (e) {
      handleApiError(e);
    } finally {
      loading = false;
    }
  }

  async function openItem(n: any) {
    open = false;
    if (!n.isRead) {
      apiRequest(`/notifications/${n.id}/read`, { method: 'PATCH' }).then(refreshBadges).catch(() => {});
    }
    await goto('/notifications');
  }

  function onwindow(e: MouseEvent) {
    if (open && !(e.target as HTMLElement).closest('.bell-wrap')) open = false;
  }
</script>

<svelte:window onclick={onwindow} onkeydown={(e) => { if (e.key === 'Escape') open = false; }} />

<header class="topbar">
  <button class="btn btn-ghost btn-icon menu" onclick={ontoggle} aria-label="Buka menu"><Icon name="menu" /></button>
  <div class="crumb"><span>Workspace</span><i>/</i><b>{title}</b></div>
  <div class="right">
    <span class="date">{new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span>
    <div class="bell-wrap">
      <button class="btn btn-ghost btn-icon bell" onclick={toggle} aria-label="Notifikasi" aria-expanded={open}>
        <Icon name="bell" />
        {#if app.unread > 0}<span class="dot">{app.unread > 9 ? '9+' : app.unread}</span>{/if}
      </button>
      {#if open}
        <div class="dropdown">
          <div class="dh"><b>Notifikasi</b><a href="/notifications" onclick={() => (open = false)}>Lihat semua</a></div>
          {#if loading}
            <div class="pad muted">Memuat…</div>
          {:else if items.length === 0}
            <div class="pad muted">Belum ada notifikasi.</div>
          {:else}
            {#each items as n (n.id)}
              <button class="ni" class:unread={!n.isRead} onclick={() => openItem(n)}>
                <span class="t">{n.title}</span>
                <span class="m">{n.message}</span>
                <span class="w">{fmtRelative(n.createdAt)}</span>
              </button>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
    <a class="avatar me" href="/settings" aria-label="Pengaturan akun">{initials(app.user?.name ?? 'A')}</a>
  </div>
</header>

<style>
  .topbar { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 14px; height: 68px; padding: 0 36px; background: rgba(248,247,243,.86); backdrop-filter: blur(12px); border-bottom: 1px solid var(--line); }
  .menu { display: none; }
  .crumb { font-size: 13px; font-weight: 500; color: var(--ink-3); } .crumb i { padding: 0 9px; font-style: normal; color: #cdc8b9; } .crumb b { color: var(--navy); font-weight: 500; }
  .right { margin-left: auto; display: flex; align-items: center; gap: 14px; }
  .date { font-size: 12.5px; color: var(--ink-3); }
  .bell-wrap { position: relative; }
  .bell { position: relative; }
  .dot { position: absolute; top: -5px; right: -5px; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 99px; background: var(--gold); color: var(--navy); font-size: 10.5px; font-weight: 700; display: grid; place-items: center; border: 2px solid var(--bg); }
  .me { width: 38px; height: 38px; transition: transform .2s var(--ease); } .me:hover { transform: scale(1.06); }
  .dropdown { position: absolute; right: 0; top: calc(100% + 10px); width: 360px; max-width: calc(100vw - 24px); background: #fff; border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow-lg); animation: pop .2s var(--ease); overflow: hidden; }
  .dh { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--line-2); } .dh a { font-size: 12px; font-weight: 600; color: var(--gold-deep); }
  .pad { padding: 24px; text-align: center; font-size: 13px; }
  .ni { display: grid; gap: 3px; width: 100%; text-align: left; padding: 12px 16px; border: 0; border-bottom: 1px solid var(--line-2); background: #fff; }
  .ni:hover { background: #fcfbf8; } .ni.unread { background: #fffaf0; box-shadow: inset 3px 0 0 var(--gold); }
  .t { font-size: 13px; font-weight: 600; color: var(--navy); } .m { font-size: 12px; font-weight: 400; color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } .w { font-size: 11px; font-weight: 400; color: var(--ink-3); }
  @media (max-width: 1023px) { .topbar { padding: 0 18px; } .menu { display: inline-flex; } }
  @media (max-width: 720px) { .date { display: none; } .crumb span, .crumb i { display: none; } }
</style>
