import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Kartu putih dengan sudut membulat dan bayangan lembut.
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.onTap, this.margin});

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final EdgeInsets? margin;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.line),
        boxShadow: const [
          BoxShadow(color: Color(0x0A101828), blurRadius: 18, offset: Offset(0, 8)),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(AppRadius.card),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.card),
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

/// Kotak abu berkilau untuk loading skeleton.
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({super.key, this.width, this.height = 16, this.radius = 10});

  final double? width;
  final double height;
  final double radius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) => Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: Color.lerp(const Color(0xFFEFEDE6), const Color(0xFFE3E0D5), _c.value),
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      ),
    );
  }
}

class ListSkeleton extends StatelessWidget {
  const ListSkeleton({super.key, this.count = 4, this.height = 96});

  final int count;
  final double height;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(20),
      itemCount: count,
      separatorBuilder: (_, __) => const SizedBox(height: 14),
      itemBuilder: (_, __) => SkeletonBox(height: height, radius: AppRadius.card),
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.title, this.message, this.icon = Icons.inbox_outlined, this.action});

  final String title;
  final String? message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 68,
              height: 68,
              decoration: BoxDecoration(color: AppColors.goldTint, borderRadius: BorderRadius.circular(22)),
              child: Icon(icon, size: 32, color: AppColors.goldDeep),
            ),
            const SizedBox(height: 18),
            Text(title,
                textAlign: TextAlign.center,
                style: const TextStyle(fontFamily: AppTheme.serif, fontSize: 19, fontWeight: FontWeight.w600)),
            if (message != null) ...[
              const SizedBox(height: 8),
              Text(message!,
                  textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textSecondary, height: 1.5)),
            ],
            if (action != null) ...[const SizedBox(height: 18), action!],
          ],
        ),
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 68,
              height: 68,
              decoration: BoxDecoration(color: const Color(0xFFFEF3F2), borderRadius: BorderRadius.circular(22)),
              child: const Icon(Icons.cloud_off_outlined, size: 32, color: AppColors.danger),
            ),
            const SizedBox(height: 18),
            const Text('Data gagal dimuat',
                style: TextStyle(fontFamily: AppTheme.serif, fontSize: 19, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(message,
                textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textSecondary, height: 1.5)),
            if (onRetry != null) ...[
              const SizedBox(height: 18),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Coba lagi'),
                style: OutlinedButton.styleFrom(minimumSize: const Size(160, 46)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// FutureBuilder dengan skeleton, error, dan tombol coba lagi yang seragam.
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({
    super.key,
    required this.future,
    required this.builder,
    required this.onRetry,
    this.skeleton,
  });

  final Future<T> future;
  final Widget Function(BuildContext context, T data) builder;
  final VoidCallback onRetry;
  final Widget? skeleton;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return skeleton ?? const ListSkeleton();
        }
        if (snapshot.hasError) {
          return ErrorView(message: snapshot.error.toString(), onRetry: onRetry);
        }
        return builder(context, snapshot.data as T);
      },
    );
  }
}

class StatusStyle {
  const StatusStyle(this.label, this.color, this.background, this.icon);

  final String label;
  final Color color;
  final Color background;
  final IconData icon;

  static StatusStyle of(String status) {
    switch (status) {
      case 'PENDING':
        return const StatusStyle('Menunggu', Color(0xFFB54708), Color(0xFFFEF0C7), Icons.hourglass_bottom_rounded);
      case 'APPROVED':
        return const StatusStyle('Disetujui', Color(0xFF027A48), Color(0xFFD1FADF), Icons.check_circle_outline);
      case 'REJECTED':
        return const StatusStyle('Ditolak', Color(0xFFB42318), Color(0xFFFEE4E2), Icons.cancel_outlined);
      case 'CANCELLED':
        return const StatusStyle('Dibatalkan', Color(0xFF475467), Color(0xFFEAECF0), Icons.block_outlined);
      case 'COMPLETED':
        return const StatusStyle('Selesai', Color(0xFF3A5A8C), Color(0xFFE6EDF8), Icons.task_alt_outlined);
      case 'NO_SHOW':
        return const StatusStyle('Tidak hadir', Color(0xFFB42318), Color(0xFFFEE4E2), Icons.event_busy_outlined);
      default:
        return StatusStyle(status, AppColors.textSecondary, const Color(0xFFEAECF0), Icons.help_outline);
    }
  }
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.status, {super.key});

  final String status;

  @override
  Widget build(BuildContext context) {
    final s = StatusStyle.of(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: s.background, borderRadius: BorderRadius.circular(AppRadius.chip)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(s.icon, size: 14, color: s.color),
        const SizedBox(width: 5),
        Text(s.label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: s.color)),
      ]),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.actionLabel, this.onAction});

  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 26, 12, 12),
      child: Row(children: [
        Expanded(
          child: Text(title,
              style: const TextStyle(fontFamily: AppTheme.serif, fontSize: 19, fontWeight: FontWeight.w600)),
        ),
        if (actionLabel != null) TextButton(onPressed: onAction, child: Text(actionLabel!)),
      ]),
    );
  }
}

/// Foto ruangan dengan placeholder elegan bila belum ada foto / gagal dimuat.
class RoomImage extends StatelessWidget {
  const RoomImage({super.key, required this.url, this.height = 150, this.radius = 18, this.label});

  final String? url;
  final double height;
  final double radius;
  final String? label;

  Widget _placeholder() => Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppColors.secondaryDark, Color(0xFF22324D)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        alignment: Alignment.center,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.meeting_room_outlined, color: AppColors.lightGold, size: 34),
          if (label != null) ...[
            const SizedBox(height: 6),
            Text(label!,
                style: const TextStyle(fontFamily: AppTheme.serif, color: AppColors.lightGold, fontSize: 15)),
          ],
        ]),
      );

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: url == null
            ? _placeholder()
            : Image.network(
                url!,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _placeholder(),
                loadingBuilder: (context, child, progress) =>
                    progress == null ? child : const SkeletonBox(height: double.infinity, radius: 0),
              ),
      ),
    );
  }
}

class LoadingButton extends StatelessWidget {
  const LoadingButton({super.key, required this.label, required this.onPressed, this.loading = false, this.icon});

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: loading ? null : onPressed,
      child: loading
          ? const SizedBox(
              width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
          : Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              if (icon != null) ...[Icon(icon, size: 19), const SizedBox(width: 8)],
              Text(label),
            ]),
    );
  }
}

void showSnack(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: error ? AppColors.danger : AppColors.primaryDark,
    ));
}

Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Ya, lanjutkan',
  bool danger = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      title: Text(title, style: const TextStyle(fontFamily: AppTheme.serif, fontWeight: FontWeight.w600)),
      content: Text(message, style: const TextStyle(color: AppColors.textSecondary, height: 1.5)),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          style: TextButton.styleFrom(foregroundColor: AppColors.textSecondary),
          child: const Text('Batal'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, true),
          style: FilledButton.styleFrom(
            minimumSize: const Size(110, 44),
            backgroundColor: danger ? AppColors.danger : AppColors.primaryDark,
          ),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result ?? false;
}

/// Kartu ringkas ruangan (daftar katalog / beranda).
class RoomStatusChip extends StatelessWidget {
  const RoomStatusChip({super.key, required this.available, required this.inUse});

  final bool available;
  final bool inUse;

  @override
  Widget build(BuildContext context) {
    final (label, color, bg) = !available
        ? ('Tidak tersedia', AppColors.danger, const Color(0xFFFEE4E2))
        : inUse
            ? ('Sedang dipakai', const Color(0xFFB54708), const Color(0xFFFEF0C7))
            : ('Tersedia', const Color(0xFF027A48), const Color(0xFFD1FADF));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.chip)),
      child: Text(label, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: color)),
    );
  }
}
