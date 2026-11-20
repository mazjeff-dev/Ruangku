export type ToastKind = 'success' | 'error' | 'info';
export type ToastItem = { id: number; kind: ToastKind; message: string };

export const toasts = $state<{ items: ToastItem[] }>({ items: [] });
let counter = 0;

export function toast(kind: ToastKind, message: string, ms = 4200) {
  const id = ++counter;
  toasts.items.push({ id, kind, message });
  setTimeout(() => dismissToast(id), ms);
}
export const toastSuccess = (m: string) => toast('success', m);
export const toastError = (m: string) => toast('error', m, 6000);
export const toastInfo = (m: string) => toast('info', m);

export function dismissToast(id: number) {
  const i = toasts.items.findIndex((t) => t.id === id);
  if (i >= 0) toasts.items.splice(i, 1);
}
