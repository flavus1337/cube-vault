import 'package:flutter/material.dart';

import 'app_theme.dart';
import 'db.dart';
import 'login_page.dart';

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
