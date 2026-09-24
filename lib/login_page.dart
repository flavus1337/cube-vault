import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show AuthState;

import 'app_theme.dart';
import 'db.dart';
import 'history_page.dart';

/// Shows login, the waiting screen or the cube, depending on session and role.
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  late final StreamSubscription<AuthState> _sub;
  String? _role;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _sub = Db.authChanges.listen((_) => _loadRole());
  }

  Future<void> _loadRole() async {
    if (Db.session == null) {
      setState(() {
        _role = null;
        _loading = false;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // The profile is created by a trigger right after the first login.
      var role = await Db.myRole();
      if (role == null) {
        await Future.delayed(const Duration(seconds: 1));
        role = await Db.myRole();
      }
      if (mounted) setState(() => _role = role);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingPage();
    if (Db.session == null) return const _LoginPage();
    if (_error != null || _role == null || _role == 'waiting') {
      return _WaitingPage(error: _error, onRetry: _loadRole);
    }
    return ScanHistoryPage(canEdit: _role == 'editor' || _role == 'admin');
  }
}

class _LoadingPage extends StatelessWidget {
  const _LoadingPage();

  @override
  Widget build(BuildContext context) {
    return const _AuthScaffold(
      children: [
        VaultLogo(height: 88),
        SizedBox(height: 28),
        CircularProgressIndicator(),
      ],
    );
  }
}

class _LoginPage extends StatelessWidget {
  const _LoginPage();

  @override
  Widget build(BuildContext context) {
    return _AuthScaffold(
      children: [
        const VaultLogo(height: 104),
        const SizedBox(height: 28),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            icon: const Icon(Icons.login),
            label: const Text('Mit Discord anmelden'),
            onPressed: () async {
              try {
                await Db.loginWithDiscord();
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Login fehlgeschlagen: $e')),
                  );
                }
              }
            },
          ),
        ),
      ],
    );
  }
}

class _AuthScaffold extends StatelessWidget {
  final List<Widget> children;

  const _AuthScaffold({required this.children});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: DecoratedBox(
        // The brand's own ground: dark stone, colour only at the edges.
        decoration: const BoxDecoration(
          color: VaultColors.ink,
          image: DecorationImage(
            image: AssetImage('assets/background.webp'),
            fit: BoxFit.cover,
          ),
        ),
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: constraints.maxHeight - 48,
                ),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(28),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: children,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _WaitingPage extends StatelessWidget {
  final String? error;
  final VoidCallback onRetry;
  const _WaitingPage({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return _AuthScaffold(
      children: [
        const VaultLogo(height: 88),
        const SizedBox(height: 24),
        Icon(
          error == null ? Icons.hourglass_top : Icons.error_outline,
          color: error == null ? VaultColors.brass : VaultColors.error,
          size: 40,
        ),
        const SizedBox(height: 12),
        Text(
          error == null
              ? 'Warte auf Freigabe durch einen Admin.'
              : 'Fehler: $error',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: onRetry,
            child: const Text('Erneut prüfen'),
          ),
        ),
        TextButton(onPressed: Db.logout, child: const Text('Abmelden')),
      ],
    );
  }
}
