<script lang="ts">
  import { page } from '$app/state';
  import Icon from './Icon.svelte';
  import BrandLogo from './BrandLogo.svelte';
  import { app, logout } from '../stores/app.svelte';
  import { confirmDialog } from '../stores/confirm.svelte';
  import { initials } from '../utils';

  type Props = { open: boolean; onnavigate: () => void };
  let { open, onnavigate }: Props = $props();

  type NavItem = { href: string; label: string; icon: string; badge?: 'pending' | 'unread' };

  const main: NavItem[] = [
    { href: '/', label: 'Dashboard', icon: 'dashboard' },
    { href: '/bookings', label: 'Peminjaman', icon: 'bookings', badge: 'pending' },
    { href: '/schedule', label: 'Jadwal Ruangan', icon: 'schedule' }
  ];
  const manage: NavItem[] = [
    { href: '/rooms', label: 'Manajemen Ruangan', icon: 'rooms' },
    { href: '/students', label: 'Mahasiswa', icon: 'students' },
    { href: '/reports', label: 'Laporan', icon: 'reports' }
  ];
  const account: NavItem[] = [
    { href: '/notifications', label: 'Notifikasi', icon: 'bell', badge: 'unread' },
    { href: '/settings', label: 'Pengaturan', icon: 'settings' }
  ];
  const lecturerGroups = [
    { t: 'Menu dosen', items: [{ href: '/lecturer', label: 'Dashboard', icon: 'dashboard' }, { href: '/lecturer/bookings', label: 'Peminjaman', icon: 'bookings', badge: 'pending' as const }, { href: '/lecturer/rooms', label: 'Ruangan tugas', icon: 'rooms' }] },
    { t: 'Pengelolaan', items: [{ href: '/extensions', label: 'Perpanjangan', icon: 'clock', badge: 'pending' as const }, { href: '/reports', label: 'Laporan', icon: 'reports' }] },
    { t: 'Akun', items: [account[0]] }
  ];
  const studentGroups = [
    { t: 'Ruangku', items: [{ href: '/student', label: 'Dashboard', icon: 'dashboard' }, { href: '/student/rooms', label: 'Katalog Ruangan', icon: 'rooms' }, { href: '/student/bookings', label: 'Peminjaman Saya', icon: 'bookings', badge: 'pending' as const }, { href: '/student/violations', label: 'Poin & Sanksi Saya', icon: 'reports' }] },
    { t: 'Akun', items: [account[0]] }
  ];
  const adminGroups = [
    { t: 'Menu utama', items: main },
    { t: 'Pengelolaan', items: [...manage, { href: '/lecturers', label: 'Dosen', icon: 'students' }, { href: '/leaders', label: 'Akun Pimpinan', icon: 'students' }, { href: '/leadership', label: 'Dasbor Pengadaan', icon: 'reports' }] },
    { t: 'Akun', items: account }
  ];
  const leadershipGroups: { t: string; items: NavItem[] }[] = [{ t: 'Dasbor', items: [{ href: '/leadership', label: 'Dasbor Pengadaan', icon: 'reports' }] }];
  const groups = $derived(app.user?.role === 'PIMPINAN' ? leadershipGroups : app.user?.role === 'DOSEN' ? lecturerGroups : app.user?.role === 'STUDENT' ? studentGroups : adminGroups);
  const home = $derived(app.user?.role === 'PIMPINAN' ? '/leadership' : app.user?.role === 'DOSEN' ? '/lecturer' : app.user?.role === 'STUDENT' ? '/student' : '/');

  // Halaman beranda tiap peran harus cocok PERSIS: '/lecturer' dan '/student' adalah induk dari sub-halaman lain
  // ('/lecturer/rooms', '/student/bookings'), sehingga bila memakai awalan, Dashboard ikut menyala bersama menu lain.
  // Menu lain cocok persis atau sebagai sub-halaman (href + '/'), supaya '/leaders' tidak aktif di '/leadership'.
  const exactOnly = new Set(['/', '/lecturer', '/student', '/leadership']);
  const isActive = (href: string) =>
    exactOnly.has(href)
      ? page.url.pathname === href
      : page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
  const badge = (key?: NavItem['badge']) => (key === 'pending' ? app.pending : key === 'unread' ? app.unread : 0);

  async function askLogout() {
    const ok = await confirmDialog({ title: 'Keluar dari RuangKu?', message: 'Sesi akun Anda akan diakhiri.', confirmLabel: 'Keluar' });
    if (ok) logout();
  }
</script>

<aside class="sidebar" class:open>
  <a class="brand" href={home} onclick={onnavigate}>
    <span class="mark"><BrandLogo size={31} /></span>
    <span>
      <b>ruangku<i>.</i></b>
      <small>Campus Space Management</small>
    </span>
  </a>

  <nav>
    {#each groups as group}
      <div class="group">{group.t}</div>
      {#each group.items as item}
        <a href={item.href} class="item" class:active={isActive(item.href)} onclick={onnavigate} aria-current={isActive(item.href) ? 'page' : undefined}>
          <Icon name={item.icon} size={18} />
          <span>{item.label}</span>
          {#if badge(item.badge) > 0}<em>{badge(item.badge) > 99 ? '99+' : badge(item.badge)}</em>{/if}
        </a>
      {/each}
    {/each}
  </nav>

  <div class="foot">
    <div class="me">
      <span class="av">{initials(app.user?.name ?? 'Admin')}</span>
      <span class="who"><b>{app.user?.name ?? 'Administrator'}</b><small>{app.user?.email ?? ''}</small></span>
      <button onclick={askLogout} aria-label="Keluar" title="Keluar"><Icon name="logout" size={17} /></button>
    </div>
  </div>
</aside>

<style>
  .sidebar { position: fixed; inset: 0 auto 0 0; z-index: 50; width: 264px; display: flex; flex-direction: column; padding: 24px 16px 16px; background: linear-gradient(180deg, var(--navy) 0%, var(--navy-2) 100%); color: #aab4c6; overflow-y: auto; transition: transform .3s var(--ease); }
  .brand { display: flex; align-items: center; gap: 12px; padding: 4px 10px 26px; }
  .mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, var(--gold-soft), var(--gold)); box-shadow: 0 8px 20px -8px rgba(217,184,118,.7); }
  .brand b { display: block; color: #fff; font-family: var(--font); font-size: 20px; font-weight: 800; letter-spacing: -.6px; line-height: 1.1; }
  .brand b i { font-style: normal; color: var(--gold); }
  .brand small { display: block; margin-top: 4px; font-size: 9px; letter-spacing: .16em; text-transform: uppercase; color: #78859b; }
  nav { flex: 1; }
  .group { padding: 18px 12px 8px; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #6d7a90; }
  .item { position: relative; display: flex; align-items: center; gap: 12px; height: 44px; padding: 0 14px; margin-bottom: 3px; border-radius: 12px; font-size: 13.5px; font-weight: 500; transition: background .18s, color .18s; }
  .item:hover { background: rgba(255,255,255,.06); color: #fff; }
  .item.active { background: linear-gradient(90deg, rgba(198,165,107,.22), rgba(198,165,107,.08)); color: #fff; font-weight: 600; }
  .item.active::before { content: ''; position: absolute; left: -16px; top: 10px; bottom: 10px; width: 4px; border-radius: 0 4px 4px 0; background: var(--gold); }
  .item.active :global(svg) { color: var(--gold); }
  em { margin-left: auto; min-width: 22px; padding: 2px 7px; border-radius: 99px; background: var(--gold); color: var(--navy); font-size: 11px; font-style: normal; font-weight: 700; text-align: center; }
  .foot { padding-top: 14px; border-top: 1px solid rgba(255,255,255,.08); }
  .me { display: flex; align-items: center; gap: 11px; padding: 8px; border-radius: 14px; background: rgba(255,255,255,.04); }
  .av { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; background: var(--gold-soft); color: var(--navy); font-size: 12px; font-weight: 700; flex-shrink: 0; }
  .who { min-width: 0; flex: 1; display: grid; }
  .who b { font-family: var(--font); font-size: 13px; font-weight: 600; letter-spacing: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who small { font-size: 11px; color: #7f8ca2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .me button { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; border: 0; background: transparent; color: #aab4c6; }
  .me button:hover { background: rgba(255,255,255,.1); color: #fff; }
  @media (max-width: 1023px) {
    .sidebar { transform: translateX(-100%); box-shadow: var(--shadow-lg); }
    .sidebar.open { transform: none; }
    .item.active::before { left: -16px; }
  }
</style>
