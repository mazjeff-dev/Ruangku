// Menyiapkan AndroidManifest.xml hasil `flutter create` untuk RuangKu:
//  - izin INTERNET (wajib agar aplikasi bisa memanggil API),
//  - usesCleartextTraffic (agar bisa memakai http:// saat pengembangan),
//  - nama aplikasi "RuangKu".
//
// Jalankan dari folder mobile:  dart run tool/patch_manifest.dart
// Skrip ini aman dijalankan berulang kali.
import 'dart:io';

void main(List<String> args) {
  final path = args.isNotEmpty ? args.first : 'android/app/src/main/AndroidManifest.xml';
  final file = File(path);
  if (!file.existsSync()) {
    stderr.writeln('File $path tidak ditemukan. Jalankan dulu: flutter create --platforms=android .');
    exit(1);
  }

  var xml = file.readAsStringSync();
  var changed = false;

  if (!xml.contains('android.permission.INTERNET')) {
    xml = xml.replaceFirst(
      '<application',
      '<uses-permission android:name="android.permission.INTERNET"/>\n    <application',
    );
    changed = true;
  }

  if (!xml.contains('usesCleartextTraffic')) {
    xml = xml.replaceFirst('<application', '<application\n        android:usesCleartextTraffic="true"');
    changed = true;
  }

  final label = RegExp(r'android:label="[^"]*"');
  if (label.hasMatch(xml) && !xml.contains('android:label="RuangKu"')) {
    xml = xml.replaceFirst(label, 'android:label="RuangKu"');
    changed = true;
  }

  if (changed) {
    file.writeAsStringSync(xml);
    stdout.writeln('AndroidManifest.xml diperbarui.');
  } else {
    stdout.writeln('AndroidManifest.xml sudah sesuai.');
  }
}
