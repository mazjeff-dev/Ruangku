import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../core/api_service.dart';
import '../models/models.dart';

enum AuthStatus { initializing, loggedOut, loggedIn }

/// Sesi autentikasi: token JWT disimpan di SharedPreferences dan divalidasi ke server saat aplikasi dibuka.
class AuthState extends ChangeNotifier {
  AuthState(this.client, this.api) {
    client.onUnauthorized = _handleUnauthorized;
  }

  static const _tokenKey = 'ruangku_token';
  static const _onboardedKey = 'ruangku_onboarded';

  final ApiClient client;
  final ApiService api;

  AuthStatus status = AuthStatus.initializing;
  AppUser? user;
  bool onboarded = false;
  String? sessionMessage;

  Future<void> init() async {
    final started = DateTime.now();
    final prefs = await SharedPreferences.getInstance();
    onboarded = prefs.getBool(_onboardedKey) ?? false;

    final saved = prefs.getString(_tokenKey);
    var nextStatus = AuthStatus.loggedOut;
    if (saved != null) {
      client.token = saved;
      try {
        final me = await api.me();
        if (me.role == 'STUDENT' || me.role == 'DOSEN') {
          user = me;
          nextStatus = AuthStatus.loggedIn;
        } else {
          await _clear(prefs);
        }
      } on ApiException catch (e) {
        if (e.isUnauthorized) {
          await _clear(prefs);
        } else {
          // Server tidak terjangkau: tetap masuk dengan sesi tersimpan tidak aman (profil tak diketahui),
          // jadi kembali ke login dan beri tahu pengguna.
          await _clear(prefs);
          sessionMessage = e.message;
        }
      }
    }

    // Tahan splash minimal agar animasi terlihat utuh.
    final elapsed = DateTime.now().difference(started);
    const minimum = Duration(milliseconds: 1800);
    if (elapsed < minimum) await Future<void>.delayed(minimum - elapsed);

    status = nextStatus;
    notifyListeners();
  }

  Future<void> completeOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_onboardedKey, true);
    onboarded = true;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    final result = await api.login(email.trim().toLowerCase(), password);
    if (result.user.role != 'STUDENT' && result.user.role != 'DOSEN') {
      throw ApiException('Akun administrator menggunakan dashboard web RuangKu, bukan aplikasi ini.');
    }
    client.token = result.token;
    user = result.user;
    sessionMessage = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, result.token);
    status = AuthStatus.loggedIn;
    notifyListeners();
  }

  Future<void> register({required String name, required String email, required String password, String? nim}) async {
    await api.register(name: name.trim(), email: email.trim().toLowerCase(), password: password, nim: nim?.trim());
    await login(email, password);
  }

  void updateUser(AppUser updated) {
    user = updated;
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.logout();
    } catch (_) {
      // logout server bersifat konfirmasi saja; sesi lokal tetap dihapus
    }
    final prefs = await SharedPreferences.getInstance();
    await _clear(prefs);
    status = AuthStatus.loggedOut;
    notifyListeners();
  }

  Future<void> _clear(SharedPreferences prefs) async {
    await prefs.remove(_tokenKey);
    client.token = null;
    user = null;
  }

  void _handleUnauthorized() {
    if (status != AuthStatus.loggedIn) return;
    SharedPreferences.getInstance().then(_clear).then((_) {
      sessionMessage = 'Sesi Anda berakhir. Silakan masuk kembali.';
      status = AuthStatus.loggedOut;
      notifyListeners();
    });
  }
}

/// Navigasi antar-tab dan permintaan muat ulang data lintas layar.
class NavState extends ChangeNotifier {
  int index = 0;
  String? roomQuery;

  void go(int i, {String? query}) {
    index = i;
    roomQuery = query;
    notifyListeners();
  }
}

/// Dinaikkan setiap kali data server berubah (mis. booking baru) agar layar memuat ulang.
class RefreshState extends ChangeNotifier {
  int version = 0;

  void bump() {
    version++;
    notifyListeners();
  }
}
