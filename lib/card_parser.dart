import 'dart:ui';

class OcrLine {
  final String text;
  final Rect box;
  const OcrLine(this.text, this.box);
}

/// The exact print read from one camera frame. All cube cards are from 2024
/// or newer, so every card has set code and collector number printed.
class CardHit {
  final String set, number, lang;

  /// The top line of the card, used to check the looked-up card. OCR of the
  /// name is unreliable, so it only confirms, it never picks the card.
  final String? name;
  const CardHit(this.set, this.number, this.lang, this.name);

  String get key => '$set/$number/$lang';
}

/// Letters only, lower case, umlauts folded: "Fäulnisfluch-Rakshasa" becomes
/// "faulnisfluchrakshasa". Used to compare an OCR name with a card name.
String plainName(String text) => text
    .toLowerCase()
    .replaceAll('ä', 'a')
    .replaceAll('ö', 'o')
    .replaceAll('ü', 'u')
    .replaceAll('ß', 'ss')
    .replaceAll(RegExp(r'[^a-z]'), '');

// "MKM • EN", "M20 · DE"; OCR often turns the bullet into * . - + or drops it.
final _setLine = RegExp(
  r'\b([A-Z0-9]{3,5})\s*[•·*.+\-]?\s*(EN|DE|FR|IT|ES|PT|JA|JP|RU|KO|ZHS|ZHT|PH)\b',
);
// "0123 R", "123/280 U", "R 0123", and OCR noise in front of it like "MO339".
final _numberLine = RegExp(r'^\s*\D{0,3}\s*0*(\d{1,4})(?:\s*/\s*\d{1,4})?\s*[CURMSLTP]?\s*$');

// Characters OCR mixes up in the tiny set code line.
const _confusable = ['0ODQ', '1IL7T', '2Z', '5S', '6G', '8B', 'MN', 'UV', 'CG'];

bool _sameChar(String a, String b) =>
    a == b || _confusable.any((group) => group.contains(a) && group.contains(b));

/// OCR reads "TDM" as "TOM", "T9M" or "70M". Matching against the set codes
/// already in the cube turns those back into one stable key.
String _closestSet(String read, Set<String> knownSets) {
  for (final code in knownSets) {
    if (code.length != read.length) continue;
    var wrong = 0;
    for (var i = 0; i < code.length; i++) {
      if (!_sameChar(code[i], read[i])) wrong++;
    }
    if (wrong == 0) return code;
  }
  return read;
}

/// [knownSets] are the set codes of the cube, used to fix OCR mistakes.
CardHit? parseCard(List<OcrLine> lines, {Set<String> knownSets = const {}}) {
  final name = _topLine(lines);
  for (final line in lines) {
    final m = _setLine.firstMatch(line.text);
    if (m == null || !m[1]!.contains(RegExp('[A-Z]'))) continue;

    final sameLine = _numberLine.firstMatch(line.text.substring(0, m.start));
    if (sameLine != null) {
      return CardHit(_closestSet(m[1]!, knownSets), sameLine[1]!, m[2]!, name);
    }

    // The collector number sits directly above the set code, left-aligned.
    // Checking alignment keeps the P/T box ("3/3") and the copyright year out.
    final h = line.box.height;
    final above = lines.where(
      (l) =>
          l != line &&
          l.box.center.dy < line.box.top &&
          line.box.top - l.box.bottom < h * 1.5 &&
          (l.box.left - line.box.left).abs() < h * 2,
    );
    for (final l in above) {
      final n = _numberLine.firstMatch(l.text);
      if (n != null) return CardHit(_closestSet(m[1]!, knownSets), n[1]!, m[2]!, name);
    }
  }

  return null;
}

/// The card name sits at the top. Mana symbols land there as single letters.
String? _topLine(List<OcrLine> lines) {
  final sorted = [...lines]..sort((a, b) => a.box.top.compareTo(b.box.top));
  for (final l in sorted) {
    final name = l.text.replaceAll(RegExp(r'(\s+\S)+\s*$'), '').trim();
    if (plainName(name).length >= 4) return name;
  }
  return null;
}
