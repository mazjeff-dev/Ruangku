<script lang="ts">
  import { statusLabel, statusClass } from '../utils';
  let { status }: { status: string } = $props();
</script>

<span class="badge {statusClass(status)}"><i></i>{statusLabel(status)}</span>
