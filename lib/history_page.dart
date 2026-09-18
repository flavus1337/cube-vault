import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'app_theme.dart';
import 'db.dart';
import 'main.dart';
import 'scan_page.dart';
import 'update_check.dart';

/// What this player scanned, newest first. Loading only these rows keeps the
/// start fast: the whole cube lives on the website.
class ScanHistoryPage extends StatefulWidget {
  final bool canEdit;
  const ScanHistoryPage({super.key, required this.canEdit});

  @override
  State<ScanHistoryPage> createState() => _ScanHistoryPageState();
}

class _ScanHistoryPageState extends State<ScanHistoryPage> {
  List<Map<String, Object?>>? _scans;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
    _checkForUpdate();
  }

  /// Asks GitHub once per start whether a newer release is out.
  Future<void> _checkForUpdate() async {
    try {
      final current = (await PackageInfo.fromPlatform()).version;
      final tag = await newerRelease(current);
      if (tag == null || !mounted) return;
      final install = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Update verfügbar'),
          content: Text('Version $tag ist da, du hast $current.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Später'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Herunterladen'),
            ),
          ],
        ),
      );
      // The browser downloads the APK, Android installs it over this version.
      if (install == true) {
        await launchUrl(
          Uri.parse(apkUrl),
          mode: LaunchMode.externalApplication,
        );
      }
    } catch (e) {
      debugPrint('update check: $e'); // no network, GitHub down: not important
    }
  }

  Future<void> _load() async {
    try {
      final scans = await Db.myScans();
      if (mounted) {
        setState(() {
          _scans = scans;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _undo(Map<String, Object?> scan) async {
    try {
      await Db.undoScan(scan);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Fehler: $e')));
      }
      return;
    }
    await _load();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${displayName(scan)} zurückgenommen')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final scans = _scans;
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const VaultLogo(compact: true, height: 34),
            const SizedBox(width: 10),
            const Flexible(child: Text('Meine Scans')),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Abmelden',
            icon: const Icon(Icons.logout),
            onPressed: Db.logout,
          ),
        ],
      ),
      floatingActionButton: widget.canEdit
          ? FloatingActionButton.extended(
              icon: const Icon(Icons.document_scanner),
              label: const Text('Scannen'),
              onPressed: () async {
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const ScanPage()),
                );
                _load();
              },
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: scans == null && _error == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'Laden fehlgeschlagen: $_error',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  if (scans != null && scans.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Text(
                        'Noch nichts gescannt. Tippe auf „Scannen“.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  for (final scan in scans ?? const <Map<String, Object?>>[])
                    _ScanTile(
                      scan: scan,
                      canEdit: widget.canEdit,
                      onUndo: () => _undo(scan),
                    ),
                ],
              ),
      ),
    );
  }
}

class _ScanTile extends StatelessWidget {
  final Map<String, Object?> scan;
  final bool canEdit;
  final VoidCallback onUndo;
  const _ScanTile({
    required this.scan,
    required this.canEdit,
    required this.onUndo,
  });

  @override
  Widget build(BuildContext context) {
    final private = scan['kind'] == 'private';
    final removed = (scan['delta'] as int? ?? 1) < 0;
    final time = DateTime.tryParse('${scan['at']}')?.toLocal();
    final color = private ? VaultColors.info : VaultColors.ember;

    return ListTile(
      // The stripe says where the card went: cube or the player's own cards.
      leading: SizedBox(
        width: 48,
        child: Row(
          children: [
            Container(width: 4, height: 44, color: color),
            const SizedBox(width: 6),
            if (scan['image'] != null)
              Expanded(
                child: Image.network('${scan['image']}', fit: BoxFit.cover),
              ),
          ],
        ),
      ),
      title: Text(displayName(scan)),
      subtitle: Text(
        '${printLabel(scan)} · ${time == null ? '' : '${time.day}.${time.month}. ${time.hour}:${time.minute.toString().padLeft(2, '0')}'}',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Chip(
            visualDensity: VisualDensity.compact,
            avatar: Icon(
              private ? Icons.person : Icons.inventory_2,
              size: 16,
              color: color,
            ),
            label: Text(private ? 'Privat' : 'Cube'),
            side: BorderSide(color: color),
          ),
          if (canEdit && !removed)
            IconButton(
              tooltip: 'Scan zurücknehmen',
              icon: const Icon(Icons.undo),
              onPressed: onUndo,
            ),
        ],
      ),
    );
  }
}
