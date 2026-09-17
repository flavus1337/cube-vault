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
  const CardHit(this.set, this.number, this.lang);

  String get key => '$set/$number/$lang';
}

// "MKM • EN", "M20 · DE"; OCR often turns the bullet into * . - + or drops it.
final _setLine = RegExp(
  r'\b([A-Z0-9]{3,5})\s*[•·*.+\-]?\s*(EN|DE|FR|IT|ES|PT|JA|JP|RU|KO|ZHS|ZHT|PH)\b',
);
// "0123 R", "123/280 U", "R 0123" — the whole text must be just this.
final _numberLine = RegExp(r'^\s*[CURMSLTP]?\s*0*(\d{1,4})(?:\s*/\s*\d{1,4})?\s*[CURMSLTP]?\s*$');

CardHit? parseCard(List<OcrLine> lines) {
  for (final line in lines) {
    final m = _setLine.firstMatch(line.text);
    if (m == null || !m[1]!.contains(RegExp('[A-Z]'))) continue;

    final sameLine = _numberLine.firstMatch(line.text.substring(0, m.start));
    if (sameLine != null) {
      return CardHit(m[1]!, sameLine[1]!, m[2]!);
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
      if (n != null) return CardHit(m[1]!, n[1]!, m[2]!);
    }
  }

  return null;
}
