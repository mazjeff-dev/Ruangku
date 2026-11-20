<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Sidebar from '../../lib/components/Sidebar.svelte';
  import Topbar from '../../lib/components/Topbar.svelte';
  import { apiRequest, ApiError, getToken } from '../../lib/api';
  import { app, handleApiError, logout, refreshBadges, saveSessionUser } from '../../lib/stores/app.svelte';
  import { dashboardForRole, roleCanAccessPath } from '../../lib/auth-routing.js';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
  let ready = $state(false);
  let navOpen = $state(false);

  onMount(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (!getToken()) {
      void goto('/login');
    } else {
      void (async () => {
        try {
          const user = (await apiRequest('/auth/me')).data;
          const dashboard = dashboardForRole(user?.role);
          if (!dashboard) {
            logout();
            return;
          }
          saveSessionUser(user);
          if (!roleCanAccessPath(user.role, page.url.pathname)) {
            await goto(dashboard, { replaceState: true });
            return;
          }
          ready = true;
          if (user.role !== 'PIMPINAN') {
            refreshBadges();
            interval = setInterval(refreshBadges, 30000);
          }
        } catch (error) {
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            logout();
          } else {
            handleApiError(error, 'Sesi tidak dapat diverifikasi');
            logout();
          }
        }
      })();
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  });

  $effect(() => {
    const role = app.user?.role;
    const path = page.url.pathname;
    if (!ready || !role || roleCanAccessPath(role, path)) return;
    const dashboard = dashboardForRole(role);
    if (dashboard) void goto(dashboard, { replaceState: true });
  });

  // tutup menu mobile saat pindah halaman
  $effect(() => {
    page.url.pathname;
    navOpen = false;
  });
</script>

{#if ready}
  <div class="shell">
    <Sidebar open={navOpen} onnavigate={() => (navOpen = false)} />
    {#if navOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="scrim" onclick={() => (navOpen = false)}></div>
    {/if}
    <div class="main">
      <Topbar ontoggle={() => (navOpen = !navOpen)} />
      <main class="content">
        {@render children()}
        <footer>© 2026 RuangKu · Find Your Space. Make It Happen.</footer>
      </main>
    </div>
  </div>
{/if}

<style>
  .shell { min-height: 100vh; }
  .main { margin-left: 264px; min-height: 100vh; min-width: 0; }
  .content { max-width: 1400px; margin: 0 auto; padding: 32px 36px 24px; }
  footer { padding: 36px 0 4px; text-align: center; font-size: 11.5px; color: var(--ink-3); letter-spacing: .02em; }
  .scrim { position: fixed; inset: 0; z-index: 40; background: rgba(16,24,40,.5); animation: fade .2s; }
  @media (max-width: 1023px) { .main { margin-left: 0; } .content { padding: 22px 18px 20px; } }
</style>
