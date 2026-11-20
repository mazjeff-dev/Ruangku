import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../models/models.dart';
import 'common.dart';

class RoomCard extends StatelessWidget {
  const RoomCard({super.key, required this.room, required this.onTap, this.compact = false});

  final Room room;
  final VoidCallback onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    if (compact) {
      return SizedBox(
        width: 210,
        child: AppCard(
          padding: const EdgeInsets.all(10),
          onTap: onTap,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            RoomImage(url: room.imageFullUrl, height: 100, radius: 14, label: room.code),
            const SizedBox(height: 10),
            Text(room.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
            const SizedBox(height: 3),
            Row(children: [
              const Icon(Icons.people_outline, size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 4),
              Text('${room.capacity} orang', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            ]),
            const SizedBox(height: 8),
            RoomStatusChip(available: room.isAvailable, inUse: room.inUseNow),
            const SizedBox(height: 5),
            Text('Antrean ${room.waitlistCount} orang', style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
            if (room.availabilityMessage != null)
              Text(room.availabilityMessage!, maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
          ]),
        ),
      );
    }

    return AppCard(
      padding: const EdgeInsets.all(10),
      onTap: onTap,
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 108, child: RoomImage(url: room.imageFullUrl, height: 108, radius: 14, label: room.code)),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (room.category != null)
              Text(room.category!.toUpperCase(),
                  style: const TextStyle(fontSize: 10.5, letterSpacing: 1.1, fontWeight: FontWeight.w700, color: AppColors.goldDeep)),
            const SizedBox(height: 2),
            Text(room.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontFamily: AppTheme.serif, fontWeight: FontWeight.w600, fontSize: 17)),
            const SizedBox(height: 5),
            Row(children: [
              const Icon(Icons.place_outlined, size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 4),
              Expanded(child: Text(room.location, maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5, color: AppColors.textSecondary))),
            ]),
            const SizedBox(height: 3),
            Row(children: [
              const Icon(Icons.people_outline, size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 4),
              Text('${room.capacity} orang', style: const TextStyle(fontSize: 12.5, color: AppColors.textSecondary)),
            ]),
            const SizedBox(height: 9),
            RoomStatusChip(available: room.isAvailable, inUse: room.inUseNow),
            const SizedBox(height: 5),
            Text(
              '${room.availabilityMessage ?? (room.inUseNow ? 'Terpakai' : 'Tersedia sekarang')} · Antrean ${room.waitlistCount}'
              '${room.myWaitlistPosition == null ? '' : ' · Posisi saya #${room.myWaitlistPosition}'}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11.5, color: AppColors.textSecondary),
            ),
          ]),
        ),
      ]),
    );
  }
}
