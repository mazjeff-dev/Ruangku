import 'package:flutter/material.dart';

import '../core/config.dart';
import '../core/theme.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1300))..forward();
  late final Animation<double> _fade = CurvedAnimation(parent: _c, curve: Curves.easeOut);
  late final Animation<double> _scale = Tween<double>(begin: 0.82, end: 1).animate(
    CurvedAnimation(parent: _c, curve: Curves.easeOutBack),
  );

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppColors.primaryDark, AppColors.secondaryDark],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: Center(
          child: FadeTransition(
            opacity: _fade,
            child: ScaleTransition(
              scale: _scale,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Container(
                  width: 92,
                  height: 92,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(28),
                    gradient: const LinearGradient(
                      colors: [AppColors.lightGold, AppColors.gold],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    boxShadow: const [BoxShadow(color: Color(0x66C6A56B), blurRadius: 36, offset: Offset(0, 14))],
                  ),
                  alignment: Alignment.center,
                  child: const Text('R',
                      style: TextStyle(
                          fontFamily: AppTheme.serif, fontSize: 52, fontWeight: FontWeight.w600, color: AppColors.primaryDark)),
                ),
                const SizedBox(height: 26),
                const Text.rich(
                  TextSpan(children: [
                    TextSpan(text: 'ruangku'),
                    TextSpan(text: '.', style: TextStyle(color: AppColors.gold)),
                  ]),
                  style: TextStyle(fontFamily: AppTheme.serif, fontSize: 40, fontWeight: FontWeight.w600, color: Colors.white, letterSpacing: -1),
                ),
                const SizedBox(height: 10),
                const Text(AppConfig.tagline,
                    style: TextStyle(color: AppColors.lightGold, fontSize: 13.5, letterSpacing: 0.4)),
                const SizedBox(height: 44),
                const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.2, color: AppColors.gold),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
