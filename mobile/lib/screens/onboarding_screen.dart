import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../state/auth_state.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _Page {
  const _Page(this.icon, this.title, this.body);

  final IconData icon;
  final String title;
  final String body;
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _controller = PageController();
  int _page = 0;

  static const _pages = [
    _Page(Icons.travel_explore_rounded, 'Temukan ruangan yang tepat',
        'Jelajahi ruang seminar, laboratorium, ruang rapat, hingga auditorium kampus lengkap dengan fasilitas dan kapasitasnya.'),
    _Page(Icons.event_available_rounded, 'Booking dalam hitungan detik',
        'Pilih tanggal dan jam, lihat jadwal yang sudah terisi, lalu ajukan peminjaman tanpa perlu antre ke bagian umum.'),
    _Page(Icons.notifications_active_outlined, 'Pantau status real-time',
        'Dapatkan notifikasi saat peminjaman disetujui, ditolak, atau akan segera dimulai.'),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_page == _pages.length - 1) {
      context.read<AuthState>().completeOnboarding();
    } else {
      _controller.nextPage(duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic);
    }
  }

  @override
  Widget build(BuildContext context) {
    final last = _page == _pages.length - 1;
    return Scaffold(
      body: SafeArea(
        child: Column(children: [
          Align(
            alignment: Alignment.centerRight,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 12, 0),
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 200),
                opacity: last ? 0 : 1,
                child: TextButton(
                  onPressed: last ? null : () => context.read<AuthState>().completeOnboarding(),
                  child: const Text('Lewati'),
                ),
              ),
            ),
          ),
          Expanded(
            child: PageView.builder(
              controller: _controller,
              itemCount: _pages.length,
              onPageChanged: (i) => setState(() => _page = i),
              itemBuilder: (context, i) {
                final p = _pages[i];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Container(
                      width: 190,
                      height: 190,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const LinearGradient(
                          colors: [AppColors.primaryDark, AppColors.secondaryDark],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        boxShadow: const [BoxShadow(color: Color(0x33101828), blurRadius: 40, offset: Offset(0, 20))],
                      ),
                      child: Icon(p.icon, size: 84, color: AppColors.gold),
                    ),
                    const SizedBox(height: 48),
                    Text(p.title,
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontFamily: AppTheme.serif, fontSize: 28, fontWeight: FontWeight.w600, height: 1.2)),
                    const SizedBox(height: 14),
                    Text(p.body,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 15, height: 1.6)),
                  ]),
                );
              },
            ),
          ),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            for (var i = 0; i < _pages.length; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                margin: const EdgeInsets.symmetric(horizontal: 4),
                width: i == _page ? 28 : 8,
                height: 8,
                decoration: BoxDecoration(
                  color: i == _page ? AppColors.gold : AppColors.lightGold,
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
          ]),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 28, 24, 28),
            child: FilledButton(onPressed: _next, child: Text(last ? 'Mulai sekarang' : 'Lanjut')),
          ),
        ]),
      ),
    );
  }
}
