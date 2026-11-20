import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_service.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

class ViolationPointsScreen extends StatefulWidget {
  const ViolationPointsScreen({super.key});

  @override
  State<ViolationPointsScreen> createState() => _ViolationPointsScreenState();
}

class _ViolationPointsScreenState extends State<ViolationPointsScreen> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<ApiService>().myViolations();
  }

  void _reload() => setState(() => _future = context.read<ApiService>().myViolations());

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Poin & Sanksi Saya')),
        body: AsyncBody<Map<String, dynamic>>(
          future: _future,
          onRetry: _reload,
          builder: (context, data) {
            final rules = (data['rules'] as Map?)?.cast<String, dynamic>() ?? {};
            final points = (data['points'] as List?) ?? const [];
            final blockedUntil = data['blockedUntil'] as String?;
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
              children: [
                AppCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${data['totalPoints'] ?? 0} / ${rules['suspendThreshold'] ?? 5} poin aktif',
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18, color: AppColors.primaryDark)),
                    const SizedBox(height: 8),
                    Text(
                      blockedUntil == null
                          ? 'Tidak ada penangguhan aktif.'
                          : 'Penangguhan sampai ${fmtDateTime(DateTime.parse(blockedUntil))} WIB.',
                      style: const TextStyle(color: AppColors.textSecondary),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'No-show: ${rules['noShowPoints'] ?? 2} poin · Terlambat check-out: ${rules['overstayPoints'] ?? 1} poin · Pembatalan dekat waktu mulai: ${rules['lateCancelPoints'] ?? 1} poin. Masa tenggang check-in ${rules['gracePeriodMinutes'] ?? 15} menit.',
                      style: const TextStyle(fontSize: 12, color: AppColors.textSecondary, height: 1.5),
                    ),
                  ]),
                ),
                const SizedBox(height: 18),
                const Text('Riwayat poin', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                if (points.isEmpty)
                  const AppCard(child: Text('Belum ada poin pelanggaran.', style: TextStyle(color: AppColors.textSecondary)))
                else
                  for (final raw in points)
                    Builder(builder: (context) {
                      final point = (raw as Map).cast<String, dynamic>();
                      final booking = (point['booking'] as Map?)?.cast<String, dynamic>() ?? {};
                      final waived = point['waivedAt'] != null;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: AppCard(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Expanded(child: Text('${point['type']} · ${point['points']} poin', style: const TextStyle(fontWeight: FontWeight.w700))),
                              if (waived) const Text('Dibatalkan', style: TextStyle(color: AppColors.success, fontSize: 12)),
                            ]),
                            const SizedBox(height: 6),
                            Text(point['reason'] as String? ?? '', style: const TextStyle(color: AppColors.textSecondary, height: 1.45)),
                            if (booking['title'] != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text('Booking: ${booking['title']} · ${(booking['room'] as Map?)?['name'] ?? ''}',
                                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                              ),
                            const SizedBox(height: 6),
                            Text(fmtDateTime(DateTime.parse(point['createdAt'] as String)),
                                style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                            if (waived && point['waivedNote'] != null)
                              Text('Catatan admin: ${point['waivedNote']}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                          ]),
                        ),
                      );
                    }),
              ],
            );
          },
        ),
      );
}
