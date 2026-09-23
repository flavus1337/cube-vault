import 'package:flutter_test/flutter_test.dart';
import 'package:mtg_scanner/scan_lookup.dart';

/// The lookup only asks its questions when it needs them; the name check
/// never does, so these stubs are enough.
CardLookup lookup() => CardLookup(
  askWhichCard: (_) async => null,
  askNewSet: (_) async => null,
  onSetLoading: (_) {},
);

void main() {
  final it = lookup();

  test('the read name matches the German name', () {
    expect(it.nameMatches('Aasfressender Schlamm', {
      'name': 'Scavenging Ooze',
      'name_de': 'Aasfressender Schlamm',
    }), isTrue);
  });

  test('the English name counts too', () {
    expect(it.nameMatches('Scavenging Ooze', {
      'name': 'Scavenging Ooze',
      'name_de': 'Aasfressender Schlamm',
    }), isTrue);
  });

  test('OCR that stopped halfway still matches', () {
    expect(it.nameMatches('Aasfressen', {
      'name': 'Scavenging Ooze',
      'name_de': 'Aasfressender Schlamm',
    }), isTrue);
  });

  test('another card does not match', () {
    expect(it.nameMatches('Blütenpflegerin', {
      'name': 'Scavenging Ooze',
      'name_de': 'Aasfressender Schlamm',
    }), isFalse);
  });

  test('three letters are too few to decide', () {
    expect(it.nameMatches('Aas', {
      'name': 'Scavenging Ooze',
      'name_de': 'Aasfressender Schlamm',
    }), isFalse);
  });

  test('a card without a German name is checked against the English one', () {
    expect(it.nameMatches('Lightning Bolt', {
      'name': 'Lightning Bolt',
      'name_de': null,
    }), isTrue);
  });
}
