<script lang="ts">
  type Props = { rows?: number; height?: number };
  let { rows = 5, height = 18 }: Props = $props();
</script>

<div class="wrap" aria-hidden="true">
  {#each Array(rows) as _, i}
    <div class="skeleton" style="height:{height}px; width:{i % 3 === 2 ? 70 : 100}%"></div>
  {/each}
</div>

<style>
  .wrap { display: grid; gap: 14px; padding: 22px; }
</style>
