import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';

/// Error API yang aman ditampilkan ke pengguna.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode = 0, this.fieldErrors = const {}});

  final String message;
  final int statusCode;
  final Map<String, String> fieldErrors;

  bool get isUnauthorized => statusCode == 401 || statusCode == 403;

  @override
  String toString() => message;
}

/// Klien HTTP tipis: menambahkan token JWT, memparse JSON, dan menerjemahkan error.
class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  String? token;

  /// Dipanggil saat server menjawab 401/403 untuk request ber-token (sesi habis / akun dinonaktifkan).
  void Function()? onUnauthorized;

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final params = <String, String>{};
    query?.forEach((key, value) {
      if (value == null) return;
      final text = value.toString();
      if (text.isNotEmpty) params[key] = text;
    });
    final base = Uri.parse('${AppConfig.apiBaseUrl}$path');
    return params.isEmpty ? base : base.replace(queryParameters: params);
  }

  Map<String, String> get _headers => {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) =>
      _send('GET', path, query: query);

  Future<Map<String, dynamic>> post(String path, {Object? body}) => _send('POST', path, body: body);

  Future<Map<String, dynamic>> put(String path, {Object? body}) => _send('PUT', path, body: body);

  Future<Map<String, dynamic>> patch(String path, {Object? body}) => _send('PATCH', path, body: body);

  Future<Map<String, dynamic>> delete(String path) => _send('DELETE', path);

  /// Unduh berkas biner (PDF/ICS/CSV) dari endpoint yang membutuhkan token.
  Future<({List<int> bytes, String filename})> getBytes(String path, {required String fallbackName}) async {
    final headers = <String, String>{'Accept': '*/*', if (token != null) 'Authorization': 'Bearer $token'};
    http.Response response;
    try {
      response = await _client.get(_uri(path), headers: headers).timeout(AppConfig.requestTimeout);
    } on TimeoutException {
      throw ApiException('Server tidak merespons. Periksa koneksi internet Anda lalu coba lagi.');
    } catch (_) {
      throw ApiException('Tidak dapat terhubung ke server. Pastikan backend berjalan dan alamat API benar.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      var message = 'Gagal mengunduh berkas (${response.statusCode})';
      try {
        final decoded = jsonDecode(utf8.decode(response.bodyBytes));
        if (decoded is Map && decoded['message'] is String) message = decoded['message'] as String;
      } catch (_) {}
      final exception = ApiException(message, statusCode: response.statusCode);
      if (token != null && exception.isUnauthorized) onUnauthorized?.call();
      throw exception;
    }
    final disposition = response.headers['content-disposition'] ?? '';
    final match = RegExp(r'filename="([^"]+)"').firstMatch(disposition);
    return (bytes: response.bodyBytes, filename: match?.group(1) ?? fallbackName);
  }

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Map<String, dynamic>? query,
    Object? body,
  }) async {
    final request = http.Request(method, _uri(path, query))..headers.addAll(_headers);
    if (body != null) request.body = jsonEncode(body);

    final hadToken = token != null;
    http.Response response;
    try {
      final streamed = await _client.send(request).timeout(AppConfig.requestTimeout);
      response = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw ApiException('Server tidak merespons. Periksa koneksi internet Anda lalu coba lagi.');
    } catch (_) {
      throw ApiException(
        'Tidak dapat terhubung ke server. Pastikan backend berjalan dan alamat API benar.',
      );
    }

    Map<String, dynamic> json = {};
    if (response.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(utf8.decode(response.bodyBytes));
        if (decoded is Map<String, dynamic>) json = decoded;
      } catch (_) {
        // respons bukan JSON; ditangani di bawah berdasarkan status
      }
    }

    if (response.statusCode >= 200 && response.statusCode < 300) return json;

    final fields = <String, String>{};
    final errors = json['errors'];
    if (errors is Map) {
      errors.forEach((k, v) => fields[k.toString()] = v.toString());
    }
    final exception = ApiException(
      (json['message'] as String?) ?? 'Terjadi kesalahan pada server (${response.statusCode})',
      statusCode: response.statusCode,
      fieldErrors: fields,
    );

    // Token kedaluwarsa / akun dinonaktifkan. Login/registrasi (tanpa token) tidak memicu ini.
    if (hadToken && exception.isUnauthorized) onUnauthorized?.call();
    throw exception;
  }
}
