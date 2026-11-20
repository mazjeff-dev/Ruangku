import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:ruangku/core/api_client.dart';
import 'package:ruangku/core/api_service.dart';
import 'package:ruangku/screens/forgot_password_screen.dart';
import 'package:ruangku/screens/login_screen.dart';
import 'package:ruangku/state/auth_state.dart';

void main() {
  testWidgets('ForgotPasswordScreen validates email and displays generic result and email hint', (tester) async {
    var requests = 0;
    final service = ApiService(ApiClient(
      client: MockClient((request) async {
        requests++;
        expect(request.url.path.endsWith('/auth/forgot-password'), isTrue);
        expect(jsonDecode(request.body), {'email': 'mahasiswa@example.test'});
        return http.Response(
          jsonEncode({
            'success': true,
            'message': 'Jika email terdaftar, tautan reset telah dikirim',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    ));

    await tester.pumpWidget(
      Provider<ApiService>.value(
        value: service,
        child: const MaterialApp(home: ForgotPasswordScreen()),
      ),
    );
    await tester.enterText(find.byKey(const Key('forgot-password-email')), 'email-tidak-valid');
    await tester.tap(find.byKey(const Key('forgot-password-submit')));
    await tester.pump();
    expect(find.text('Format email tidak valid'), findsOneWidget);
    expect(requests, 0);

    await tester.enterText(find.byKey(const Key('forgot-password-email')), 'mahasiswa@example.test');
    await tester.tap(find.byKey(const Key('forgot-password-submit')));
    await tester.pumpAndSettle();

    expect(requests, 1);
    expect(find.text('Jika email terdaftar, tautan reset telah dikirim'), findsOneWidget);
    expect(find.text('Buka tautan di email Anda untuk membuat password baru.'), findsOneWidget);
  });

  testWidgets('ForgotPasswordScreen displays ApiException messages', (tester) async {
    final service = ApiService(ApiClient(
      client: MockClient((_) async => http.Response(
        jsonEncode({'success': false, 'message': 'Terlalu banyak percobaan'}),
        429,
        headers: {'content-type': 'application/json'},
      )),
    ));

    await tester.pumpWidget(
      Provider<ApiService>.value(
        value: service,
        child: const MaterialApp(home: ForgotPasswordScreen()),
      ),
    );
    await tester.enterText(find.byKey(const Key('forgot-password-email')), 'mahasiswa@example.test');
    await tester.tap(find.byKey(const Key('forgot-password-submit')));
    await tester.pumpAndSettle();

    expect(find.text('Terlalu banyak percobaan'), findsOneWidget);
  });

  testWidgets('LoginScreen password visibility toggle shows and hides password', (tester) async {
    final client = ApiClient(client: MockClient((_) async => http.Response('{}', 200)));
    final api = ApiService(client);
    final auth = AuthState(client, api);

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthState>.value(
        value: auth,
        child: const MaterialApp(home: LoginScreen()),
      ),
    );

    var passwordField = tester.widget<TextFormField>(find.byType(TextFormField).last);
    expect(passwordField.obscureText, isTrue);
    await tester.tap(find.byTooltip('Tampilkan password'));
    await tester.pump();
    passwordField = tester.widget<TextFormField>(find.byType(TextFormField).last);
    expect(passwordField.obscureText, isFalse);

    await tester.tap(find.byTooltip('Sembunyikan password'));
    await tester.pump();
    passwordField = tester.widget<TextFormField>(find.byType(TextFormField).last);
    expect(passwordField.obscureText, isTrue);
  });
}
