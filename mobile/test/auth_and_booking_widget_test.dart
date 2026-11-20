import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:ruangku/core/api_client.dart';
import 'package:ruangku/core/api_service.dart';
import 'package:ruangku/models/models.dart';
import 'package:ruangku/screens/booking_form_screen.dart';
import 'package:ruangku/screens/login_screen.dart';
import 'package:ruangku/state/auth_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('login menampilkan validasi email dan password kosong', (tester) async {
    var requests = 0;
    final client = ApiClient(client: MockClient((_) async {
      requests++;
      return http.Response('{}', 200);
    }));
    final auth = AuthState(client, ApiService(client));

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthState>.value(
        value: auth,
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.tap(find.text('Masuk'));
    await tester.pump();

    expect(find.text('Email wajib diisi'), findsOneWidget);
    expect(find.text('Password wajib diisi'), findsOneWidget);
    expect(requests, 0);
    auth.dispose();
  });

  testWidgets('form booking menolak durasi di bawah batas minimum', (tester) async {
    final client = ApiClient(client: MockClient((request) async {
      if (request.url.path.endsWith('/bookings/rules')) {
        return http.Response(jsonEncode({
          'success': true,
          'data': {'minMinutes': 30, 'maxHours': 8, 'maxDaysAhead': 90},
        }), 200);
      }
      if (request.url.path.endsWith('/rooms/1/schedule')) {
        return http.Response(jsonEncode({'success': true, 'data': {'bookings': []}}), 200);
      }
      return http.Response('{}', 404);
    }));
    final api = ApiService(client);
    final tomorrow = DateTime.now().add(const Duration(days: 1));

    await tester.pumpWidget(
      MultiProvider(
        providers: [Provider<ApiService>.value(value: api)],
        child: MaterialApp(
          home: BookingFormScreen(
            room: Room(id: 1, name: 'Ruang Uji', code: 'UJI-01', location: 'Gedung Uji', capacity: 20),
            initialDate: DateTime(tomorrow.year, tomorrow.month, tomorrow.day),
            initialStart: const TimeOfDay(hour: 9, minute: 0),
            initialEnd: const TimeOfDay(hour: 9, minute: 15),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final submit = find.text('Ajukan Peminjaman').last;
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pump();

    expect(find.text('Durasi minimal 30 menit'), findsOneWidget);
    expect(find.text('Tujuan peminjaman wajib diisi'), findsOneWidget);
  });

  testWidgets('form booking memvalidasi jumlah peserta terhadap kapasitas', (tester) async {
    final client = ApiClient(client: MockClient((request) async {
      if (request.url.path.endsWith('/bookings/rules')) {
        return http.Response(jsonEncode({
          'success': true,
          'data': {'minMinutes': 30, 'maxHours': 8, 'maxDaysAhead': 90},
        }), 200);
      }
      if (request.url.path.endsWith('/rooms/1/schedule')) {
        return http.Response(jsonEncode({
          'success': true,
          'data': {
            'bookings': [],
            'operatingHours': {'overrides': [], 'default': {'openTime': '07:00', 'closeTime': '21:00', 'operatingDays': [1, 2, 3, 4, 5, 6]}},
            'closures': [],
          },
        }), 200);
      }
      return http.Response('{}', 404);
    }));
    final tomorrow = DateTime.now().add(const Duration(days: 1));

    await tester.pumpWidget(
      Provider<ApiService>.value(
        value: ApiService(client),
        child: MaterialApp(
          home: BookingFormScreen(
            room: Room(id: 1, name: 'Ruang Uji', code: 'UJI-01', location: 'Gedung Uji', capacity: 20),
            initialDate: DateTime(tomorrow.year, tomorrow.month, tomorrow.day),
            initialStart: const TimeOfDay(hour: 9, minute: 0),
            initialEnd: const TimeOfDay(hour: 10, minute: 0),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Tujuan peminjaman'), 'Rapat mahasiswa');
    await tester.enterText(find.widgetWithText(TextFormField, 'Deskripsi kegiatan'), 'Kegiatan mahasiswa');
    await tester.enterText(find.widgetWithText(TextFormField, 'Jumlah peserta'), '21');
    final submit = find.text('Ajukan Peminjaman').last;
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pump();

    expect(find.text('Maksimal 20 orang'), findsOneWidget);
  });
}
