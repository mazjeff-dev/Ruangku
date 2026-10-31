type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
};

export const confirmState = $state<{
  open: boolean;
  options: ConfirmOptions;
  resolve: ((v: boolean) => void) | null;
}>({ open: false, options: { title: '', message: '' }, resolve: null });

/** Modal konfirmasi berbasis Promise (pengganti window.confirm). */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState.options = options;
    confirmState.resolve = resolve;
    confirmState.open = true;
  });
}

export function settleConfirm(value: boolean) {
  confirmState.open = false;
  confirmState.resolve?.(value);
  confirmState.resolve = null;
}
