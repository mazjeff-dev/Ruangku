import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import '../core/validation.dart';
import '../state/auth_state.dart';
import '../widgets/common.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _nim = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _error;
  Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    for (final c in [_name, _nim, _email, _password, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _error = null;
      _fieldErrors = {};
    });
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    final auth = context.read<AuthState>();
    final navigator = Navigator.of(context);
    try {
      await auth.register(name: _name.text, email: _email.text, password: _password.text, nim: _nim.text);
      // AuthGate berpindah ke aplikasi; tutup layar registrasi.
      if (navigator.canPop()) navigator.pop();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _fieldErrors = e.fieldErrors;
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Form(
                key: _form,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Text('Buat akun baru',
                      style: TextStyle(fontFamily: AppTheme.serif, fontSize: 32, fontWeight: FontWeight.w600, height: 1.15)),
                  const SizedBox(height: 8),
                  const Text('Daftar sebagai mahasiswa untuk mulai meminjam ruangan kampus.',
                      style: TextStyle(color: AppColors.textSecondary, height: 1.5)),
                  const SizedBox(height: 28),
                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF3F2),
                        borderRadius: BorderRadius.circular(AppRadius.control),
                        border: Border.all(color: const Color(0xFFFECDCA)),
                      ),
                      child: Text(_error!, style: const TextStyle(color: Color(0xFFB42318), height: 1.4)),
                    ),
                    const SizedBox(height: 16),
                  ],
                  TextFormField(
                    controller: _name,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Nama lengkap', prefixIcon: Icon(Icons.person_outline)),
                    validator: (v) {
                      final value = (v ?? '').trim();
                      if (value.isEmpty) return 'Nama wajib diisi';
                      if (value.length < 2) return 'Nama minimal 2 karakter';
                      return _fieldErrors['name'];
                    },
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _nim,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'NIM (opsional)', prefixIcon: Icon(Icons.badge_outlined)),
                    validator: (_) => _fieldErrors['nim'],
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline)),
                    validator: (v) {
                      final value = (v ?? '').trim();
                      if (value.isEmpty) return 'Email wajib diisi';
                      if (!emailPattern.hasMatch(value)) return 'Format email tidak valid';
                      return _fieldErrors['email'];
                    },
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _password,
                    obscureText: _obscure,
                    textInputAction: TextInputAction.next,
                    decoration: InputDecoration(
                      labelText: 'Password',
                      helperText: 'Minimal 8 karakter',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        tooltip: _obscure ? 'Tampilkan password' : 'Sembunyikan password',
                        icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                    ),
                    validator: (v) {
                      if (v == null || v.isEmpty) return 'Password wajib diisi';
                      if (v.length < 8) return 'Password minimal 8 karakter';
                      return _fieldErrors['password'];
                    },
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _confirm,
                    obscureText: _obscure,
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) => _submit(),
                    decoration: const InputDecoration(labelText: 'Konfirmasi password', prefixIcon: Icon(Icons.lock_reset_outlined)),
                    validator: (v) => v != _password.text ? 'Konfirmasi password tidak cocok' : null,
                  ),
                  const SizedBox(height: 26),
                  LoadingButton(label: 'Daftar', loading: _loading, onPressed: _submit),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
