import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/api_service.dart';
import '../core/theme.dart';
import '../core/validation.dart';
import '../widgets/common.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _loading = false;
  String? _message;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_form.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _message = null;
      _error = null;
    });
    try {
      final message = await context.read<ApiService>().forgotPassword(_email.text.trim().toLowerCase());
      if (mounted) setState(() => _message = message);
    } on ApiException catch (exception) {
      if (mounted) setState(() => _error = exception.message);
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
                  const Text(
                    'Lupa password?',
                    style: TextStyle(fontFamily: AppTheme.serif, fontSize: 30, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Masukkan email akun Anda untuk meminta tautan reset password.',
                    style: TextStyle(color: AppColors.textSecondary, height: 1.5),
                  ),
                  const SizedBox(height: 28),
                  TextFormField(
                    key: const Key('forgot-password-email'),
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.email],
                    onFieldSubmitted: (_) => _submit(),
                    decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline)),
                    validator: (value) {
                      final email = (value ?? '').trim();
                      if (email.isEmpty) return 'Email wajib diisi';
                      if (!emailPattern.hasMatch(email)) return 'Format email tidak valid';
                      return null;
                    },
                  ),
                  if (_message != null) ...[
                    const SizedBox(height: 18),
                    Text(_message!, key: const Key('forgot-password-result'), style: const TextStyle(color: AppColors.success, height: 1.5)),
                    const SizedBox(height: 8),
                    const Text(
                      'Buka tautan di email Anda untuk membuat password baru.',
                      style: TextStyle(color: AppColors.textSecondary, height: 1.5),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 18),
                    Text(_error!, key: const Key('forgot-password-error'), style: const TextStyle(color: AppColors.danger, height: 1.5)),
                  ],
                  const SizedBox(height: 24),
                  LoadingButton(
                    key: const Key('forgot-password-submit'),
                    label: 'Kirim tautan reset',
                    loading: _loading,
                    onPressed: _submit,
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
