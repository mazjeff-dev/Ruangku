<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';

  type Props = {
    id: string;
    value?: string;
    visible?: boolean;
    inputClass?: string;
    placeholder?: string;
    autocomplete?: HTMLInputAttributes['autocomplete'];
    required?: boolean;
    minlength?: number;
    maxlength?: number;
    invalid?: boolean;
  };

  let {
    id,
    value = $bindable(''),
    visible = $bindable(false),
    inputClass = '',
    placeholder,
    autocomplete = 'new-password',
    required = false,
    minlength,
    maxlength,
    invalid = false
  }: Props = $props();

  function keepInputFocus(event: PointerEvent) {
    event.preventDefault();
  }
</script>

<div class="password-input">
  <input
    {id}
    class={inputClass}
    type={visible ? 'text' : 'password'}
    bind:value
    {placeholder}
    {autocomplete}
    {required}
    {minlength}
    {maxlength}
    aria-invalid={invalid ? 'true' : undefined}
  />
  <button
    class="toggle"
    type="button"
    aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'}
    aria-pressed={visible}
    onpointerdown={keepInputFocus}
    onclick={() => (visible = !visible)}
  >
    <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
  </button>
</div>

<style>
  .password-input { position: relative; width: 100%; }
  .password-input input { width: 100%; padding-right: 44px; }
  :global(.password-input input.login-password-input) {
    height: 45px;
    padding-left: 13px;
    border: 1px solid #e2e5e9;
    border-radius: 8px;
    outline: none;
    color: #24354b;
    background: #fff;
    font: inherit;
    font-size: 12px;
  }
  :global(.password-input input.login-password-input:focus) {
    border-color: #c3a265;
    box-shadow: 0 0 0 3px #c3a26520;
  }
  .toggle {
    position: absolute;
    top: 50%;
    right: 8px;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #7f8997;
    cursor: pointer;
    transform: translateY(-50%);
  }
  .toggle:hover { background: #f2f3f5; color: #192b42; }
  .toggle:focus-visible { outline: 2px solid #c3a265; outline-offset: 1px; }
</style>
