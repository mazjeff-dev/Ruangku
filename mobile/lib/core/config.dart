/// Konfigurasi aplikasi.
///
/// Alamat API diatur saat menjalankan / membangun:
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1      (emulator Android)
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.10:3000/api/v1  (HP asli, satu Wi-Fi)
class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api/v1',
  );

  /// Alamat server tanpa "/api/v1" — dipakai untuk foto ruangan (/uploads/...).
  static String get serverOrigin =>
      apiBaseUrl.replaceFirst(RegExp(r'/api/v\d+/?$'), '');

  static const String appName = 'RuangKu';
  static const String tagline = 'Find Your Space. Make It Happen.';
  static const Duration requestTimeout = Duration(seconds: 20);
}
