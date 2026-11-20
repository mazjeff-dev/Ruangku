import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/auth_state.dart';
import 'login_screen.dart';
import 'main_shell.dart';
import 'onboarding_screen.dart';
import 'splash_screen.dart';

/// Memilih layar berdasarkan status sesi: splash -> onboarding/login -> aplikasi.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();

    Widget child;
    switch (auth.status) {
      case AuthStatus.initializing:
        child = const SplashScreen(key: ValueKey('splash'));
        break;
      case AuthStatus.loggedIn:
        child = const MainShell(key: ValueKey('shell'));
        break;
      case AuthStatus.loggedOut:
        child = auth.onboarded
            ? const LoginScreen(key: ValueKey('login'))
            : const OnboardingScreen(key: ValueKey('onboarding'));
        break;
    }

    return AnimatedSwitcher(duration: const Duration(milliseconds: 450), child: child);
  }
}
