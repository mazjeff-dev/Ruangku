import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/api_service.dart';
import '../core/config.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../state/auth_state.dart';
import '../widgets/common.dart';
import 'login_screen.dart' show emailPattern;
import 'notifications_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  Future<void> _logout(BuildContext context) async {
    final auth = context.read<AuthState>();
    final ok = await confirmDialog(
      context,
      title: 'Keluar dari RuangKu?',
      message: 'Anda perlu masuk kembali untuk mengajukan peminjaman.',
      confirmLabel: 'Keluar',
      danger: true,
    );
    if (ok) {
      context.read<NavState>().go(0);
      await auth.logout();
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthState>().user;
    if (user == null) return const SizedBox.shrink();

    return SafeArea(
      bottom: false,
      child: ListView(padding: const EdgeInsets.fromLTRB(20, 16, 20, 28), children: [
        const Text('Profil', style: TextStyle(fontFamily: AppTheme.serif, fontSize: 30, fontWeight: FontWeight.w600)),
        const SizedBox(height: 18),
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            gradient: const LinearGradient(colors: [AppColors.primaryDark, Color(0xFF22324D)], begin: Alignment.topLeft, end: Alignment.bottomRight),
            boxShadow: const [BoxShadow(color: Color(0x33101828), blurRadius: 30, offset: Offset(0, 14))],
          ),
          child: Row(children: [
            Container(
              width: 70,
              height: 70,
              alignment: Alignment.center,
              decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.lightGold),
              child: Text(initials(user.name), style: const TextStyle(fontFamily: AppTheme.serif, fontSize: 26, fontWeight: FontWeight.w700, color: AppColors.primaryDark)),
            ),
            const SizedBox(width: 18),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontFamily: AppTheme.serif, color: Colors.white, fontSize: 21, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(user.email, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Color(0xFFAAB4C6), fontSize: 13)),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: const Color(0x33C6A56B), borderRadius: BorderRadius.circular(99)),
                  child: Text(user.role == 'STUDENT' ? 'Mahasiswa' : user.role == 'DOSEN' ? 'Dosen' : 'Administrator', style: const TextStyle(color: AppColors.lightGold, fontSize: 11.5, fontWeight: FontWeight.w700)),
                ),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 16),
        AppCard(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(children: [
            if (user.role == 'STUDENT') ...[
              _Item(icon: Icons.badge_outlined, title: 'NIM', trailing: user.nim ?? '—'),
              const Divider(height: 1, indent: 56),
            ],
            _Item(icon: Icons.edit_outlined, title: 'Edit profil', onTap: () => _editProfile(context)),
            const Divider(height: 1, indent: 56),
            _Item(icon: Icons.lock_outline, title: 'Ganti password', onTap: () => _changePassword(context)),
            const Divider(height: 1, indent: 56),
            _Item(
              icon: Icons.notifications_none_rounded,
              title: 'Notifikasi',
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const NotificationsScreen())),
            ),
          ]),
        ),
        const SizedBox(height: 16),
        AppCard(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(children: [
            _Item(
              icon: Icons.info_outline,
              title: 'Tentang RuangKu',
              onTap: () => showAboutDialog(
                context: context,
                applicationName: AppConfig.appName,
                applicationVersion: '1.0.0',
                children: const [SizedBox(height: 8), Text(AppConfig.tagline)],
              ),
            ),
            const Divider(height: 1, indent: 56),
            _Item(icon: Icons.logout_rounded, title: 'Keluar', danger: true, onTap: () => _logout(context)),
          ]),
        ),
      ]),
    );
  }

  void _editProfile(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (_) => const _EditProfileSheet(),
    );
  }

  void _changePassword(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (_) => const _PasswordSheet(),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({required this.icon, required this.title, this.onTap, this.trailing, this.danger = false});

  final IconData icon;
  final String title;
  final VoidCallback? onTap;
  final String? trailing;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? AppColors.danger : AppColors.textPrimary;
    return ListTile(
      onTap: onTap,
      leading: Icon(icon, color: danger ? AppColors.danger : AppColors.goldDeep),
      title: Text(title, style: TextStyle(fontWeight: FontWeight.w600, color: color)),
      trailing: trailing != null
          ? Text(trailing!, style: const TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.w600))
          : (onTap != null && !danger ? const Icon(Icons.chevron_right_rounded, color: AppColors.textSecondary) : null),
    );
  }
}

class _EditProfileSheet extends StatefulWidget {
  const _EditProfileSheet();

  @override
  State<_EditProfileSheet> createState() => _EditProfileSheetState();
}

class _EditProfileSheetState extends State<_EditProfileSheet> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _email;
  bool _saving = false;
  late bool _emailNotifications;
  String? _error;

  @override
  void initState() {
    super.initState();
    final u = context.read<AuthState>().user!;
    _name = TextEditingController(text: u.name);
    _email = TextEditingController(text: u.email);
    _emailNotifications = u.emailNotifications;
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final api = context.read<ApiService>();
    final auth = context.read<AuthState>();
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final updated = await api.updateProfile(
        name: _name.text.trim(),
        email: _email.text.trim().toLowerCase(),
        emailNotifications: _emailNotifications,
      );
      auth.updateUser(updated);
      navigator.pop();
      messenger.showSnackBar(const SnackBar(content: Text('Profil berhasil diperbarui')));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(24, 18, 24, 24 + MediaQuery.of(context).viewInsets.bottom),
      child: Form(
        key: _form,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Edit profil', style: TextStyle(fontFamily: AppTheme.serif, fontSize: 22, fontWeight: FontWeight.w600)),
          const SizedBox(height: 18),
          if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_error!, style: const TextStyle(color: AppColors.danger))),
          TextFormField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Nama lengkap', prefixIcon: Icon(Icons.person_outline)),
            validator: (v) => (v ?? '').trim().length < 2 ? 'Nama minimal 2 karakter' : null,
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Terima notifikasi melalui email'),
            value: _emailNotifications,
            onChanged: _saving ? null : (value) => setState(() => _emailNotifications = value),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline)),
            validator: (v) => emailPattern.hasMatch((v ?? '').trim()) ? null : 'Format email tidak valid',
          ),
          const SizedBox(height: 20),
          LoadingButton(label: 'Simpan', loading: _saving, onPressed: _save),
        ]),
      ),
    );
  }
}

class _PasswordSheet extends StatefulWidget {
  const _PasswordSheet();

  @override
  State<_PasswordSheet> createState() => _PasswordSheetState();
}

class _PasswordSheetState extends State<_PasswordSheet> {
  final _form = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final api = context.read<ApiService>();
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await api.changePassword(_current.text, _next.text);
      navigator.pop();
      messenger.showSnackBar(const SnackBar(content: Text('Password berhasil diubah')));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(24, 18, 24, 24 + MediaQuery.of(context).viewInsets.bottom),
      child: Form(
        key: _form,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Ganti password', style: TextStyle(fontFamily: AppTheme.serif, fontSize: 22, fontWeight: FontWeight.w600)),
          const SizedBox(height: 18),
          if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_error!, style: const TextStyle(color: AppColors.danger))),
          TextFormField(
            controller: _current,
            obscureText: _obscure,
            decoration: const InputDecoration(labelText: 'Password saat ini', prefixIcon: Icon(Icons.lock_outline)),
            validator: (v) => (v == null || v.isEmpty) ? 'Wajib diisi' : null,
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _next,
            obscureText: _obscure,
            decoration: InputDecoration(
              labelText: 'Password baru (min. 8 karakter)',
              prefixIcon: const Icon(Icons.lock_reset_outlined),
              suffixIcon: IconButton(
                icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
            validator: (v) {
              if (v == null || v.length < 8) return 'Minimal 8 karakter';
              if (v == _current.text) return 'Harus berbeda dari password saat ini';
              return null;
            },
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _confirm,
            obscureText: _obscure,
            decoration: const InputDecoration(labelText: 'Konfirmasi password baru', prefixIcon: Icon(Icons.lock_reset_outlined)),
            validator: (v) => v != _next.text ? 'Konfirmasi tidak cocok' : null,
          ),
          const SizedBox(height: 20),
          LoadingButton(label: 'Perbarui password', loading: _saving, onPressed: _save),
        ]),
      ),
    );
  }
}
