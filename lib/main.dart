import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'app_theme.dart';
import 'db.dart';
import 'login_page.dart';
import 'scan_page.dart';
import 'update_check.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Db.open();
  runApp(
    MaterialApp(
      title: 'Cube Vault',
      theme: buildVaultTheme(),
      home: const AuthGate(),
    ),
  );
}

/// Scryfall "large" (672×936 JPG) instead of the stored "normal" (488×680) for big views.
String largeImage(Object? url) => '$url'.replaceFirst('/normal/', '/large/');

/// Scryfall's sharpest image (745×1040 PNG, ~1 MB), for the full-size card view.
String pngImage(Object? url) =>
    '$url'.replaceFirst('/normal/', '/png/').replaceFirst('.jpg', '.png');

String displayName(Map<String, Object?> c) => '${c['name_de'] ?? c['name']}';

String printLabel(Map<String, Object?> c) =>
    '${'${c['set_code']}'.toUpperCase()} #${c['number']}';

String typeLine(Map<String, Object?> c) {
  final de = c['type_de'] as String?;
  return de == null || de.isEmpty ? '${c['type_line']}' : de;
}

const rarityDe = {
  'common': 'Gewöhnlich',
  'uncommon': 'Ungewöhnlich',
  'rare': 'Selten',
  'mythic': 'Mythisch selten',
};

const _colorNames = {
  'W': 'Weiß',
  'U': 'Blau',
  'B': 'Schwarz',
  'R': 'Rot',
  'G': 'Grün',
  'C': 'Farblos',
};

String _price(Map<String, Object?> c) {
  final p = c['price_eur'] as num?;
  return p == null ? '–' : '${p.toStringAsFixed(2)} €';
}

class CollectionPage extends StatefulWidget {
  /// Editors and admins may scan and change copies.
  final bool canEdit;
  const CollectionPage({super.key, required this.canEdit});

  @override
  State<CollectionPage> createState() => _CollectionPageState();
}

class _CollectionPageState extends State<CollectionPage> {
  final _search = TextEditingController();
  final _colors = <String>{};
  String? _rarity;
  String _sort = 'name';
  bool _missingOnly = false;
  List<Map<String, Object?>> _all = [];
  List<Map<String, Object?>> _cards = [];

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
      _all = await Db.cubeCards();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Laden fehlgeschlagen: $e')));
      }
    }
    _apply();
  }

  // ponytail: a cube has a few hundred cards, so filter and sort in memory.
  void _apply() {
    final text = _search.text.trim().toLowerCase();
    final cards = _all.where((c) {
      final colors = '${c['colors']}';
      final haystack = [
        c['name'],
        c['name_de'],
        c['type_line'],
        c['type_de'],
        c['set_code'],
      ].join(' ').toLowerCase();
      return haystack.contains(text) &&
          _colors.every(
            (col) => col == 'C' ? colors.isEmpty : colors.contains(col),
          ) &&
          (_rarity == null || c['rarity'] == _rarity) &&
          // The cube is what you own; missing cards only exist after a whole-set import.
          (_missingOnly ? c['qty'] == 0 : c['qty'] != 0);
    }).toList();

    int byName(Map<String, Object?> a, Map<String, Object?> b) =>
        displayName(a).toLowerCase().compareTo(displayName(b).toLowerCase());
    cards.sort(switch (_sort) {
      'number' => (a, b) {
        final d = '${a['set_code']}'.compareTo('${b['set_code']}');
        return d != 0
            ? d
            : (int.tryParse('${a['number']}') ?? 0).compareTo(
                int.tryParse('${b['number']}') ?? 0,
              );
      },
      'cmc' => (a, b) {
        final d = ((a['cmc'] as num?) ?? 0).compareTo((b['cmc'] as num?) ?? 0);
        return d != 0 ? d : byName(a, b);
      },
      _ => byName,
    });
    if (mounted) setState(() => _cards = cards);
  }

  Future<void> _details(Map<String, Object?> c) async {
    // Scanned prints of this card (variants, languages), most copies first.
    final prints = [
      for (final p in c['copies'] as List)
        {'print_id': p['print_id'], 'qty': p['qty']},
    ]..sort((a, b) => (b['qty'] as int).compareTo(a['qty'] as int));
    var qty = c['qty'] as int;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          Future<void> change(int delta) async {
            // ponytail: + and − act on the print with most copies (or the main print).
            final print = prints.isEmpty ? null : prints.first;
            final printId = '${print?['print_id'] ?? c['id']}';
            try {
              qty = delta > 0
                  ? await Db.addCopy(printId, c['id'] as String, 'en')
                  : await Db.removeCopy(printId, c['id'] as String);
            } catch (e) {
              if (ctx.mounted) {
                ScaffoldMessenger.of(
                  ctx,
                ).showSnackBar(SnackBar(content: Text('Fehler: $e')));
              }
              return;
            }
            setSheet(() {
              if (print == null) {
                prints.add({'print_id': printId, 'qty': 1});
              } else {
                print['qty'] = (print['qty'] as int) + delta;
                if ((print['qty'] as int) <= 0) prints.remove(print);
              }
            });
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (c['image'] != null)
                  ConstrainedBox(
                    constraints: BoxConstraints(
                      maxHeight: MediaQuery.sizeOf(ctx).height * 0.55,
                    ),
                    // The small image is already cached from the list; the PNG fades in over it.
                    child: FadeInImage(
                      placeholder: NetworkImage('${c['image']}'),
                      image: NetworkImage(pngImage(c['image'])),
                      fit: BoxFit.contain,
                      fadeInDuration: const Duration(milliseconds: 150),
                    ),
                  ),
                const SizedBox(height: 12),
                if (c['name_de'] != null) Text('${c['name']}'),
                const SizedBox(height: 4),
                Text(typeLine(c), textAlign: TextAlign.center),
                const SizedBox(height: 4),
                Text(
                  '${printLabel(c)} · ${rarityDe[c['rarity']] ?? c['rarity']} · ${_price(c)}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: VaultColors.brass),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (widget.canEdit)
                      IconButton(
                        tooltip: 'Eine Kopie entfernen',
                        icon: const Icon(Icons.remove),
                        onPressed: qty > 0 ? () => change(-1) : null,
                      ),
                    Text(
                      '$qty× gescannt',
                      style: Theme.of(ctx).textTheme.titleLarge,
                    ),
                    if (widget.canEdit)
                      IconButton(
                        tooltip: 'Eine Kopie hinzufügen',
                        icon: const Icon(Icons.add),
                        onPressed: () => change(1),
                      ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final owned = _all.where((c) => (c['qty'] as int) > 0);
    final copies = owned.fold<int>(0, (s, c) => s + (c['qty'] as int));

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const VaultLogo(compact: true, height: 34),
            const SizedBox(width: 10),
            Flexible(child: Text('${owned.length} Karten · $copies Kopien')),
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
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: TextField(
              controller: _search,
              onChanged: (_) => _apply(),
              decoration: const InputDecoration(
                hintText: 'Name, Typ oder Set',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                for (final color in const ['W', 'U', 'B', 'R', 'G', 'C'])
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: Semantics(
                      label: 'Farbe ${_colorNames[color]} filtern',
                      button: true,
                      selected: _colors.contains(color),
                      excludeSemantics: true,
                      child: Tooltip(
                        message: _colorNames[color]!,
                        child: FilterChip(
                          label: Text(color),
                          selected: _colors.contains(color),
                          onSelected: (on) {
                            on ? _colors.add(color) : _colors.remove(color);
                            _apply();
                          },
                        ),
                      ),
                    ),
                  ),
                Semantics(
                  label: 'Nur fehlende Karten anzeigen',
                  button: true,
                  selected: _missingOnly,
                  excludeSemantics: true,
                  child: Tooltip(
                    message: 'Nur fehlende Karten',
                    child: FilterChip(
                      label: const Text('Fehlend'),
                      selected: _missingOnly,
                      onSelected: (on) {
                        _missingOnly = on;
                        _apply();
                      },
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                DropdownButton<String?>(
                  value: _rarity,
                  hint: const Text('Seltenheit'),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('Alle')),
                    for (final r in rarityDe.entries)
                      DropdownMenuItem(value: r.key, child: Text(r.value)),
                  ],
                  onChanged: (r) {
                    _rarity = r;
                    _apply();
                  },
                ),
                const SizedBox(width: 12),
                DropdownButton<String>(
                  value: _sort,
                  items: const [
                    DropdownMenuItem(value: 'name', child: Text('Name')),
                    DropdownMenuItem(value: 'number', child: Text('Nummer')),
                    DropdownMenuItem(value: 'cmc', child: Text('Manawert')),
                  ],
                  onChanged: (s) {
                    _sort = s!;
                    _apply();
                  },
                ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              child: _cards.isEmpty
                  ? ListView(
                      children: const [
                        Padding(
                          padding: EdgeInsets.all(32),
                          child: Text(
                            'Keine Karten gefunden. Neue Karten kommen durch Scannen in den Cube.',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ],
                    )
                  : ListView.builder(
                      itemCount: _cards.length,
                      itemBuilder: (_, i) {
                        final c = _cards[i];
                        final qty = c['qty'] as int;
                        return Card(
                          margin: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                          child: ListTile(
                            leading: c['image'] == null
                                ? null
                                : ClipRRect(
                                    borderRadius: BorderRadius.circular(4),
                                    child: Opacity(
                                      opacity: qty == 0
                                          ? 0.4
                                          : 1, // missing cards look faded
                                      child: Image.network(
                                        '${c['image']}',
                                        width: 40,
                                      ),
                                    ),
                                  ),
                            title: Text(displayName(c)),
                            subtitle: Text(
                              '${printLabel(c)} · ${typeLine(c)}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            trailing: Text(
                              '$qty×',
                              style: const TextStyle(
                                color: VaultColors.brass,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            onTap: () => _details(c),
                          ),
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
