import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:mtg_scanner/card_parser.dart';

OcrLine line(String text, double left, double top) =>
    OcrLine(text, Rect.fromLTWH(left, top, 200, 20));

void main() {
  test('new frame: number above set code', () {
    final hit = parseCard([
      line('Tolarian Terror', 30, 20),
      line('Whenever you cast 3 spells, draw a card.', 30, 600),
      line('3/3', 520, 830), // P/T box on the right
      line('0123 R', 30, 850),
      line('MKM • EN', 30, 872),
      line('© 2024 Wizards of the Coast', 400, 872),
    ]);
    expect(hit?.key, 'MKM/123/EN');
  });

  test('old frame with total count and OCR bullet as dot', () {
    final hit = parseCard([
      line('Llanowar Elves', 30, 20),
      line('070/280 C', 30, 850),
      line('M20 . EN', 30, 872),
    ]);
    expect(hit?.key, 'M20/70/EN');
  });

  test('number and set code merged into one line', () {
    expect(parseCard([line('0045 U DMU • DE', 30, 850)])?.key, 'DMU/45/DE');
  });

  test('name alone is not enough', () {
    expect(parseCard([line('Lightning Bolt {R}', 30, 20)]), isNull);
  });

  test('OCR noise in the set code and the number', () {
    // Real reads of a borderless Tarkir card: "MO339" and "TOM DE".
    final lines = [
      line('Fäulnisfluch-Rakshasa', 30, 20),
      line('MO339', 30, 850),
      line('TOM DE > TOMAS DUCHEK', 30, 872),
    ];
    expect(parseCard(lines, knownSets: {'TDM', 'FDN'})?.key, 'TDM/339/DE');
    // Without the cube's set codes the read code stays as it is.
    expect(parseCard(lines)?.key, 'TOM/339/DE');
  });

  test('nothing readable', () {
    expect(parseCard([line('3/3', 30, 20)]), isNull);
  });
}
