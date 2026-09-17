import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show AuthState;

import 'db.dart';
import 'main.dart';

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
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (Db.session == null) return const _LoginPage();
    if (_error != null || _role == null || _role == 'waiting') {
      return _WaitingPage(error: _error, onRetry: _loadRole);
    }
    return CollectionPage(canEdit: _role == 'editor' || _role == 'admin');
  }
}

class _LoginPage extends StatelessWidget {
  const _LoginPage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Cube Vault', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 24),
              FilledButton.icon(
                icon: const Icon(Icons.login),
                label: const Text('Mit Discord anmelden'),
                onPressed: () async {
                  try {
                    await Db.loginWithDiscord();
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(
                        context,
                      ).showSnackBar(SnackBar(content: Text('Login fehlgeschlagen: $e')));
                    }
                  }
                },
              ),
            ],
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
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                error == null ? 'Warte auf Freigabe durch einen Admin.' : 'Fehler: $error',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              FilledButton(onPressed: onRetry, child: const Text('Erneut prüfen')),
              TextButton(onPressed: Db.logout, child: const Text('Abmelden')),
            ],
          ),
        ),
      ),
    );
  }
}
