
<script lang="ts">
  import { onMount } from 'svelte';
  import { apiRequest, ApiError } from '../lib/api';

  type Booking = {
    id: number;
    title: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
    startTime: string;
    endTime: string;
    createdAt?: string;
    room: {
      name: string;
      code: string;
      location: string;
    };
    student: {
      name: string;
      email: string;
      nim: string;
    };
  };

    let bookings = $state<Booking[]>([]);
    let loading = $state(true);
    let errorMessage = $state('');
    let processingId = $state<number | null>(null);
    let adminNote = $state('');

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(new Date(value));

  const formatTime = (value: string) =>
    new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(value));

  const initials = (name: string) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();

  const statusLabel = (status: Booking['status']) => ({
    PENDING: 'Menunggu',
    APPROVED: 'Disetujui',
    REJECTED: 'Ditolak',
    CANCELLED: 'Dibatalkan',
    COMPLETED: 'Selesai'
  })[status];

  const statusClass = (status: Booking['status']) => ({
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
    COMPLETED: 'approved'
  })[status];

  function logout() {
    sessionStorage.removeItem('ruangku_admin_token');
    sessionStorage.removeItem('ruangku_admin_user');
    window.location.href = '/login';
  }

  async function loadBookings() {
    loading = true;
    errorMessage = '';

    const token = sessionStorage.getItem('ruangku_admin_token');

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      const result = await apiRequest('/admin/bookings', {}, token);
      bookings = result.data ?? [];
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        logout();
        return;
      }

      errorMessage =
        error instanceof Error
          ? error.message
          : 'Gagal mengambil data pemesanan';
    } finally {
      loading = false;
    }
  }

  async function reviewBooking(id: number, status: 'APPROVED' | 'REJECTED') {
    const action = status === 'APPROVED' ? 'menyetujui' : 'menolak';

    if (!confirm(`Yakin ingin ${action} pengajuan ini?`)) return;

    const token = sessionStorage.getItem('ruangku_admin_token');
    if (!token) {
      window.location.href = '/login';
      return;
    }

    processingId = id;
    errorMessage = '';

    try {
      const result = await apiRequest(
        `/admin/bookings/${id}/review`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status,
            adminNote: adminNote.trim()
          })
        },
        token
      );

      alert(result.message || 'Status pengajuan berhasil diperbarui');
      adminNote = '';
      await loadBookings();
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        logout();
        return;
      }

      errorMessage =
        error instanceof Error ? error.message : 'Gagal memperbarui pengajuan';
    } finally {
      processingId = null;
    }
  }

  onMount(loadBookings);
</script>

<svelte:head>
  <title>RuangKu — Admin Dashboard</title>
  <meta name="description" content="Dashboard admin sistem pemesanan ruangan RuangKu" />
</svelte:head>

<div class="app">
  <aside class="sidebar">
    <a class="brand" href="/">
      <div class="brand-icon">R<span>.</span></div>
      <div>
        <div class="brand-name">ruangku<span>.</span></div>
        <div class="brand-caption">CAMPUS SPACE MANAGEMENT</div>
      </div>
    </a>

    <div class="nav-label">MENU UTAMA</div>
    <a class="nav-item active" href="/">▦ Dashboard <span class="nav-arrow">›</span></a>
    <a class="nav-item" href="#pengajuan">▤ Pengajuan Ruangan <span class="nav-count">{bookings.filter((b) => b.status === 'PENDING').length}</span></a>
    <a class="nav-item" href="#ringkasan">▣ Ringkasan Aktivitas</a>

    <div class="nav-label management-label">PENGELOLAAN</div>
    <a class="nav-item" href="#pengajuan">▦ Pemesanan Ruangan</a>

    <div class="sidebar-bottom">
      <div class="help-card">
        <div class="help-icon">✳</div>
        <strong>Butuh bantuan?</strong>
        <p>Kelola ruang kampus jadi lebih mudah bersama RuangKu.</p>
        <a href="mailto:admin@ruangku.local">Hubungi dukungan ↗</a>
      </div>
      <div class="admin-profile">
        <div class="avatar admin-avatar">AD</div>
        <div class="profile-info">
          <strong>Admin RuangKu</strong>
          <span>Administrator</span>
        </div>
        <button class="logout" onclick={logout}>Keluar</button>
      </div>
    </div>
  </aside>

  <main class="main">
    <header class="topbar">
      <div class="breadcrumb">Workspace <span>/</span> <strong>Dashboard</strong></div>
      <div class="top-actions">
        <span class="date-label">✧ Campus Workspace</span>
        <div class="avatar top-avatar">AD</div>
      </div>
    </header>

    <section class="content">
      <div class="welcome-row">
        <div>
          <div class="eyebrow"><span></span> ADMINISTRATOR WORKSPACE</div>
          <h1>Selamat datang kembali<span>,</span><br />Admin.</h1>
          <p>Pantau aktivitas peminjaman ruang kampus dalam satu tempat.</p>
        </div>
        <div class="welcome-art" aria-hidden="true">
          <div class="art-circle"></div>
          <div class="art-building">
            <div></div><div></div><div></div>
            <div></div><div></div><div></div>
          </div>
          <div class="art-spark">✳</div>
        </div>
      </div>

      <div class="section-heading" id="ringkasan">
        <div>
          <h2>Ringkasan aktivitas</h2>
          <p>Data pemesanan aktual dari database RuangKu</p>
        </div>
        <button class="refresh-button" onclick={loadBookings}>↻ Muat ulang</button>
      </div>

      {#if errorMessage}
        <div class="message error">{errorMessage}</div>
      {/if}

      <div class="stats-grid">
        <article class="stat-card">
          <div class="stat-top">Total Pengajuan <span class="stat-icon">▦</span></div>
          <div class="stat-value">{bookings.length}</div>
          <div class="stat-note">Seluruh pemesanan</div>
        </article>
        <article class="stat-card">
          <div class="stat-top">Menunggu Persetujuan <span class="stat-icon gold">◷</span></div>
          <div class="stat-value">{bookings.filter((b) => b.status === 'PENDING').length}</div>
          <div class="stat-note">Perlu ditinjau admin</div>
        </article>
        <article class="stat-card">
          <div class="stat-top">Pemesanan Disetujui <span class="stat-icon green">✓</span></div>
          <div class="stat-value">{bookings.filter((b) => b.status === 'APPROVED').length}</div>
          <div class="stat-note">Berstatus disetujui</div>
        </article>
        <article class="stat-card">
          <div class="stat-top">Pengajuan Ditolak <span class="stat-icon red">×</span></div>
          <div class="stat-value">{bookings.filter((b) => b.status === 'REJECTED').length}</div>
          <div class="stat-note">Berstatus ditolak</div>
        </article>
      </div>

      <section class="booking-panel" id="pengajuan">
        <div class="panel-heading">
          <div>
            <h2>Pengajuan terbaru</h2>
            <p>Tinjau dan kelola pemesanan ruangan mahasiswa</p>
          </div>
          <span class="live-label"><span></span> Data database</span>
        </div>

        <div class="note-area">
          <label for="admin-note">Catatan admin (opsional)</label>
          <input
            id="admin-note"
            bind:value={adminNote}
            maxlength="2000"
            placeholder="Contoh: Mohon sesuaikan jadwal peminjaman"
          />
          <p>Catatan ini akan dikirim bersama keputusan yang kamu pilih.</p>
        </div>

        {#if loading}
          <div class="empty-state">Sedang mengambil data pemesanan...</div>
        {:else if bookings.length === 0}
          <div class="empty-state">Belum ada pengajuan pemesanan.</div>
        {:else}
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>PEMOHON</th>
                  <th>RUANGAN</th>
                  <th>TANGGAL & WAKTU</th>
                  <th>STATUS</th>
                  <th>AKSI</th>
                </tr>
              </thead>
              <tbody>
                {#each bookings as booking (booking.id)}
                  <tr>
                    <td>
                      <div class="person">
                        <div class="avatar person-avatar">{initials(booking.student?.name || 'Mahasiswa')}</div>
                        <div>
                          <strong>{booking.student?.name || 'Nama tidak tersedia'}</strong>
                          <span class="sub-text">{booking.student?.nim || booking.student?.email || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong class="room-name">{booking.room?.name || 'Ruangan tidak tersedia'}</strong>
                      <span class="sub-text">{booking.room?.code || '—'}</span>
                    </td>
                    <td>
                      <strong class="date-text">{formatDate(booking.startTime)}</strong>
                      <span class="time-text">{formatTime(booking.startTime)}–{formatTime(booking.endTime)}</span>
                    </td>
                    <td>
                      <span class={`status ${statusClass(booking.status)}`}>
                        <i></i>{statusLabel(booking.status)}
                      </span>
                    </td>
                    <td>
                      {#if booking.status === 'PENDING'}
                        <div class="actions">
                          <button class="approve" disabled={processingId === booking.id} onclick={() => reviewBooking(booking.id, 'APPROVED')}>Setujui</button>
                          <button class="reject" disabled={processingId === booking.id} onclick={() => reviewBooking(booking.id, 'REJECTED')}>Tolak</button>
                        </div>
                      {:else}
                        <span class="done-label">Sudah diproses</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

        <div class="panel-footer">
          <span>Menampilkan {bookings.length} pengajuan dari database</span>
          <span>Dashboard RuangKu <b>✳</b></span>
        </div>
      </section>

      <footer>© 2026 RuangKu <span>Dirancang untuk pengelolaan ruang kampus yang lebih baik.</span></footer>
    </section>
  </main>
</div>

<style>
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; background: #f7f7f4; color: #202c3d; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; }
  :global(a) { color: inherit; text-decoration: none; }
  :global(button), :global(input) { font: inherit; }
  button { cursor: pointer; }
  button:disabled { cursor: wait; opacity: .6; }
  .app { min-height: 100vh; }
  .sidebar { position: fixed; inset: 0 auto 0 0; z-index: 2; display: flex; flex-direction: column; width: 248px; padding: 27px 17px 15px; background: #17283f; color: #c1cad6; }
  .brand { display: flex; align-items: center; gap: 11px; padding: 0 8px 35px; }
  .brand-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 13px; background: #e7c88b; color: #17283f; font-size: 24px; font-weight: 800; }
  .brand-icon span, .brand-name span { color: #d6b371; }
  .brand-name { color: #fff; font-size: 23px; font-weight: 750; letter-spacing: -1px; }
  .brand-caption { margin-top: 3px; font-size: 8px; letter-spacing: 1.15px; color: #8998ac; }
  .nav-label { padding: 0 11px 12px; font-size: 9px; letter-spacing: 1.5px; color: #8191a8; font-weight: 700; }
  .nav-item { display: flex; align-items: center; gap: 12px; min-height: 43px; padding: 0 12px; margin-bottom: 5px; border-radius: 9px; font-size: 12px; }
  .nav-item:hover { background: #223852; color: white; }
  .nav-item.active { background: #e6c88e; color: #1a2b42; font-weight: 700; }
  .nav-arrow, .nav-count { margin-left: auto; }
  .nav-count { padding: 3px 7px; background: #30455e; color: #f3d8a0; border-radius: 5px; font-size: 10px; }
  .management-label { margin-top: 27px; }
  .sidebar-bottom { margin-top: auto; }
  .help-card { padding: 15px 13px; border: 1px solid #34465c; border-radius: 11px; background: #1d3049; }
  .help-icon { display: grid; place-items: center; width: 27px; height: 27px; border-radius: 8px; background: #34465c; color: #e7c88b; margin-bottom: 11px; }
  .help-card strong { color: #f5f6f8; font-size: 12px; }
  .help-card p { color: #9eacbd; font-size: 10px; line-height: 1.7; margin: 7px 0 12px; }
  .help-card a { color: #e8ca91; font-size: 10px; font-weight: 650; }
  .admin-profile { display: flex; align-items: center; gap: 10px; padding: 18px 5px 0; margin-top: 15px; border-top: 1px solid #34465c; }
  .avatar { flex-shrink: 0; display: grid; place-items: center; border-radius: 50%; font-weight: 750; }
  .admin-avatar, .top-avatar { width: 35px; height: 35px; color: #17283f; background: #e5c78e; font-size: 10px; }
  .profile-info { display: grid; gap: 4px; min-width: 0; }
  .profile-info strong { color: #fff; font-size: 11px; }
  .profile-info span { color: #9eacbd; font-size: 10px; }
  .logout { margin-left: auto; border: 0; color: #e8ca91; background: transparent; font-size: 10px; }
  .main { margin-left: 248px; min-height: 100vh; }
  .topbar { height: 70px; display: flex; align-items: center; justify-content: space-between; padding: 0 42px; border-bottom: 1px solid #eaeae5; background: #fff; }
  .breadcrumb { color: #929aa5; font-size: 11px; }
  .breadcrumb span { padding: 0 10px; color: #c7cbd0; }
  .breadcrumb strong { color: #27364a; }
  .top-actions { display: flex; align-items: center; gap: 20px; }
  .date-label { color: #647184; font-size: 11px; }
  .top-avatar { width: 32px; height: 32px; }
  .content { max-width: 1440px; padding: 35px 42px 20px; margin: 0 auto; }
  .welcome-row { display: flex; align-items: center; justify-content: space-between; min-height: 175px; padding: 3px 28px 20px; border-radius: 14px; background: linear-gradient(110deg, #f0eee5, #f7f5ee 68%, #eeeadf); overflow: hidden; }
  .eyebrow { display: flex; align-items: center; gap: 8px; font-size: 9px; letter-spacing: 1.6px; font-weight: 750; color: #9c7c43; }
  .eyebrow span, .live-label span { width: 6px; height: 6px; border-radius: 50%; background: #c3a062; }
  h1 { margin: 13px 0 8px; color: #1a2c43; font-size: clamp(25px, 3vw, 34px); line-height: 1.17; letter-spacing: -1.3px; }
  h1 span { color: #bd9653; }
  .welcome-row p, .section-heading p, .panel-heading p { margin: 0; color: #818995; font-size: 11px; }
  .welcome-art { position: relative; width: 195px; height: 145px; flex-shrink: 0; }
  .art-circle { position: absolute; width: 128px; height: 128px; border-radius: 50%; top: 12px; left: 29px; background: #e7dfcc; }
  .art-building { position: absolute; left: 48px; top: 38px; width: 91px; height: 89px; padding: 13px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #233951; border-radius: 5px 5px 0 0; border-top: 7px solid #c9a363; box-shadow: 7px 8px 0 #d4c7aa; }
  .art-building div { background: #e8d8b4; border-radius: 2px; }
  .art-spark { position: absolute; top: 7px; right: 20px; color: #b89350; font-size: 25px; }
  .section-heading { display: flex; justify-content: space-between; align-items: end; margin: 31px 0 16px; }
  h2 { margin: 0 0 6px; font-size: 15px; color: #23334a; }
  .refresh-button { padding: 9px 12px; border: 1px solid #e8e3d7; border-radius: 7px; color: #876a39; background: white; font-size: 11px; }
  .stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
  .stat-card { padding: 17px; min-height: 124px; background: #fff; border: 1px solid #eeeee9; border-radius: 11px; box-shadow: 0 3px 12px #26354a05; }
  .stat-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #7c8591; font-size: 10px; }
  .stat-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: #f1eee5; color: #a78445; font-size: 16px; }
  .stat-icon.gold { background: #f8efe0; color: #bb9148; }
  .stat-icon.green { background: #e9f2eb; color: #648b6c; }
  .stat-icon.red { background: #f8eaea; color: #ad6565; }
  .stat-value { margin: 12px 0 8px; color: #1d2d43; font-size: 27px; font-weight: 750; letter-spacing: -1px; }
  .stat-note { color: #969da5; font-size: 10px; }
  .booking-panel { margin-top: 25px; background: #fff; border: 1px solid #ecece7; border-radius: 12px; overflow: hidden; }
  .panel-heading { display: flex; align-items: center; justify-content: space-between; padding: 21px 22px 17px; }
  .live-label { display: flex; align-items: center; gap: 7px; color: #63836a; font-size: 10px; }
  .live-label span { background: #9bb69c; }
  .note-area { padding: 0 22px 16px; }
  .note-area label { display: block; margin-bottom: 7px; color: #435065; font-size: 11px; font-weight: 650; }
  .note-area input { width: 100%; padding: 10px 12px; border: 1px solid #e5e6e1; border-radius: 7px; outline-color: #c9a363; }
  .note-area p { margin: 6px 0 0; color: #969da5; font-size: 10px; }
  .table-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; text-align: left; white-space: nowrap; }
  thead { background: #fafaf8; }
  th { padding: 12px 16px; color: #9199a3; font-size: 9px; letter-spacing: .8px; font-weight: 700; }
  th:first-child, td:first-child { padding-left: 22px; }
  td { padding: 13px 16px; border-top: 1px solid #f0f0ec; color: #657080; font-size: 10px; }
  .person { display: flex; align-items: center; gap: 9px; }
  .person-avatar { width: 30px; height: 30px; background: #e9edf1; color: #465b72; font-size: 9px; }
  .person strong, .room-name { display: block; color: #344258; font-size: 10px; }
  .sub-text { display: block; margin-top: 4px; color: #929aa4; font-size: 9px; }
  .date-text, .time-text { display: block; }
  .date-text { color: #435065; font-size: 10px; margin-bottom: 4px; }
  .time-text { color: #929aa4; font-size: 9px; }
  .status { display: inline-flex; align-items: center; gap: 6px; border-radius: 5px; padding: 6px 8px; font-size: 9px; font-weight: 650; }
  .status i { width: 5px; height: 5px; border-radius: 50%; }
  .pending { background: #faf1df; color: #a27a36; }
  .pending i { background: #c29a4e; }
  .approved { background: #e8f3e9; color: #55805d; }
  .approved i { background: #6da078; }
  .rejected { background: #f8eaea; color: #ad6565; }
  .rejected i { background: #c97878; }
  .cancelled { background: #edf0f4; color: #647184; }
  .cancelled i { background: #8793a3; }
  .actions { display: flex; gap: 6px; }
  .actions button { padding: 7px 9px; border-radius: 6px; font-size: 10px; }
  .approve { border: 1px solid #d5e7d8; background: #edf6ee; color: #477b51; }
  .reject { border: 1px solid #f0dada; background: #fcf0f0; color: #a65b5b; }
  .done-label { color: #9aa1a9; font-size: 9px; }
  .empty-state { padding: 35px 20px; text-align: center; color: #818995; font-size: 12px; }
  .message { margin-bottom: 15px; padding: 12px 14px; border-radius: 8px; font-size: 12px; }
  .error { border: 1px solid #f0dada; background: #fcf0f0; color: #a65b5b; }
  .panel-footer { display: flex; justify-content: space-between; padding: 13px 22px; border-top: 1px solid #efefea; color: #969da5; font-size: 9px; }
  .panel-footer b { padding-left: 4px; color: #b18d4c; }
  footer { display: flex; justify-content: space-between; padding: 25px 2px 0; color: #9299a1; font-size: 9px; }
  @media (max-width: 1150px) { .sidebar { width: 215px; } .main { margin-left: 215px; } .content { padding: 28px 24px; } .topbar { padding: 0 24px; } .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 720px) { .sidebar { position: static; width: 100%; padding: 17px; } .brand { padding-bottom: 18px; } .nav-label, .nav-item:not(.active), .management-label, .sidebar-bottom { display: none; } .nav-item.active { margin-bottom: 0; } .main { margin-left: 0; } .topbar { height: 55px; padding: 0 16px; } .date-label { display: none; } .content { padding: 18px 14px; } .welcome-row { min-height: 150px; padding: 18px; } .welcome-art { width: 80px; transform: scale(.65); transform-origin: center right; margin-left: -30px; } .stats-grid { gap: 9px; } .stat-card { padding: 12px; } .stat-top { align-items: start; } .stat-icon { width: 25px; height: 25px; } .section-heading { align-items: start; gap: 10px; } .live-label { white-space: nowrap; } footer span { max-width: 52%; text-align: right; line-height: 1.5; } }
</style>
