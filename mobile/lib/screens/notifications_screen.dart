import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/api_service.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/auth_state.dart';
import '../widgets/common.dart';
import 'booking_detail_screen.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final List<AppNotification> _items = [];
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _page = 1;
  bool _hasMore = false;
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool more = false}) async {
    final api = context.read<ApiService>();
    final next = more ? _page + 1 : 1;
    setState(() {
      if (more) {
        _loadingMore = true;
      } else {
        _loading = true;
        _error = null;
      }
    });
    try {
      final page = await api.notifications(page: next);
      if (!mounted) return;
      setState(() {
        if (!more) _items.clear();
        _items.addAll(page.items);
        _page = next;
        _hasMore = page.hasMore;
        _unread = page.unread;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  (IconData, Color, Color) _style(String type) {
    switch (type) {
      case 'BOOKING_APPROVED':
        return (Icons.check_circle_outline, const Color(0xFF027A48), const Color(0xFFD1FADF));
      case 'BOOKING_REJECTED':
        return (Icons.cancel_outlined, const Color(0xFFB42318), const Color(0xFFFEE4E2));
      case 'BOOKING_CANCELLED':
        return (Icons.block_outlined, const Color(0xFF475467), const Color(0xFFEAECF0));
      case 'BOOKING_REMINDER':
        return (Icons.alarm_rounded, const Color(0xFF3A5A8C), const Color(0xFFE6EDF8));
      default:
        return (Icons.notifications_none_rounded, AppColors.goldDeep, AppColors.goldTint);
    }
  }

  Future<void> _open(AppNotification n) async {
    final api = context.read<ApiService>();
    if (!n.isRead) {
      try {
        await api.markRead(n.id);
        if (mounted) {
          setState(() {
            n.isRead = true;
            _unread = _unread > 0 ? _unread - 1 : 0;
          });
        }
      } on ApiException catch (e) {
        if (mounted) showSnack(context, e.message, error: true);
      }
    }
    if (!mounted) return;
    final style = _style(n.type);
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Center(child: Container(width: 44, height: 5, decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(5)))),
            const SizedBox(height: 18),
            Row(children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(color: style.$3, borderRadius: BorderRadius.circular(14)),
                child: Icon(style.$1, color: style.$2),
              ),
              const SizedBox(width: 14),
              Expanded(child: Text(n.title, style: const TextStyle(fontFamily: AppTheme.serif, fontSize: 20, fontWeight: FontWeight.w600))),
            ]),
            const SizedBox(height: 14),
            Text(n.message, style: const TextStyle(height: 1.6, fontSize: 14.5)),
            const SizedBox(height: 10),
            Text(fmtDateTime(n.createdAt), style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
            if (n.bookingId != null) ...[
              const SizedBox(height: 18),
              FilledButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  Navigator.of(context).push(MaterialPageRoute<bool>(builder: (_) => BookingDetailScreen(bookingId: n.bookingId!)));
                },
                child: const Text('Lihat peminjaman'),
              ),
            ],
          ]),
        ),
      ),
    );
  }

  Future<void> _markAll() async {
    try {
      await context.read<ApiService>().markAllRead();
      if (!mounted) return;
      showSnack(context, 'Semua notifikasi ditandai sudah dibaca');
      await _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifikasi'),
        actions: [
          if (_unread > 0) TextButton(onPressed: _markAll, child: const Text('Tandai dibaca')),
          const SizedBox(width: 6),
        ],
      ),
      body: _body(),
    );
  }

  Widget _body() {
    if (_loading) return const ListSkeleton(count: 6, height: 82);
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);
    if (_items.isEmpty) {
      return const EmptyView(
        icon: Icons.notifications_off_outlined,
        title: 'Belum ada notifikasi',
        message: 'Kami akan memberi tahu Anda saat peminjaman disetujui, ditolak, atau segera dimulai.',
      );
    }
    return RefreshIndicator(
      color: AppColors.goldDeep,
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 24),
        itemCount: _items.length + 1,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, i) {
          if (i == _items.length) {
            return _hasMore
                ? OutlinedButton(
                    onPressed: _loadingMore ? null : () => _load(more: true),
                    child: _loadingMore ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Muat lebih banyak'),
                  )
                : const SizedBox.shrink();
          }
          final n = _items[i];
          final style = _style(n.type);
          return AppCard(
            padding: const EdgeInsets.all(14),
            onTap: () => _open(n),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: style.$3, borderRadius: BorderRadius.circular(14)),
                child: Icon(style.$1, color: style.$2, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(n.title, style: TextStyle(fontWeight: n.isRead ? FontWeight.w600 : FontWeight.w800, fontSize: 14.5)),
                  const SizedBox(height: 3),
                  Text(n.message, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.4)),
                  const SizedBox(height: 5),
                  Text(fmtRelative(n.createdAt), style: const TextStyle(color: AppColors.textSecondary, fontSize: 11.5)),
                ]),
              ),
              if (!n.isRead)
                Container(
                  width: 10,
                  height: 10,
                  margin: const EdgeInsets.only(top: 6, left: 8),
                  decoration: const BoxDecoration(color: AppColors.gold, shape: BoxShape.circle),
                ),
            ]),
          );
        },
      ),
    );
  }
}
