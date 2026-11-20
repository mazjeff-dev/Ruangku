import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruangku/widgets/common.dart';

void main() {
  testWidgets('StatusBadge menampilkan label status dalam Bahasa Indonesia', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Column(children: [
            StatusBadge('PENDING'),
            StatusBadge('APPROVED'),
            StatusBadge('REJECTED'),
          ]),
        ),
      ),
    );

    expect(find.text('Menunggu'), findsOneWidget);
    expect(find.text('Disetujui'), findsOneWidget);
    expect(find.text('Ditolak'), findsOneWidget);
  });

  testWidgets('EmptyView menampilkan judul dan pesan', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: EmptyView(title: 'Belum ada data', message: 'Coba lagi nanti'))),
    );
    expect(find.text('Belum ada data'), findsOneWidget);
    expect(find.text('Coba lagi nanti'), findsOneWidget);
  });
}
