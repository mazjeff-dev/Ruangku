<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Sidebar from '../../lib/components/Sidebar.svelte';
  import Topbar from '../../lib/components/Topbar.svelte';
  import { getToken } from '../../lib/api';
  import { loadSessionUser, refreshBadges } from '../../lib/stores/app.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
  let ready = $state(false);
  let navOpen = $state(false);

  onMount(() => {
    if (!getToken()) {
      goto('/login');
      return;
    }
    loadSessionUser();
    ready = true;
    refreshBadges();
    const id = setInterval(refreshBadges, 30000);
    return () => clearInterval(id);
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
