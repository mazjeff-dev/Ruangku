<script lang="ts">
  type Props = { size?: number };
  let { size = 32 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 48 48"
  fill="none"
  aria-hidden="true"
  focusable="false"
>
  <path d="M5 13.5 24 4l19 9.5H5Z" fill="#D9B876" />
  <path d="M9 15h30v26H9V15Z" fill="#192B42" />
  <path d="M5 41h38v3H5v-3Z" fill="#D9B876" />
  <path d="M14 19h5v5h-5zM22 19h5v5h-5zM30 19h5v5h-5zM14 27h5v5h-5zM22 27h5v5h-5zM30 27h5v5h-5zM14 35h5v4h-5zM22 35h5v4h-5zM30 35h5v4h-5z" fill="#E8D7B4" />
</svg>
