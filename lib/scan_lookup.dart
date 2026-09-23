import 'card_parser.dart';
import 'db.dart';
import 'scryfall.dart';

/// Lookup result for one read. [card] is the cube card; [problem] explains
/// why a print can't be counted (e.g. its set is not in the cube).
typedef Found = ({
  String printId,
  String lang,
  /// The printing that was scanned, for the copy row.
  String setCode,
  String number,
  Map<String, Object?>? card,
  String? problem,
  // The user picked this card in the dialog, so the read name must not
  // be checked again: a name that did not match is why we asked.
  bool confirmed,
});

/// Asked when the number belongs to several cards and the name did not help.
typedef AskWhichCard =
    Future<Map<String, dynamic>?> Function(List<Map<String, dynamic>> candidates);

/// Asked before a set nobody scanned before joins the cube. The answer is the
/// code of the main set, an empty string for a set of its own, null for no.
typedef AskNewSet = Future<String?> Function(String setName);

/* Turns what the camera read into the card the cube counts. Scryfall knows the
   print, the database knows which card it belongs to. Kept away from the
   camera and the widgets, so it can be read on its own. */
class CardLookup {
  CardLookup({
    required this.askWhichCard,
    required this.askNewSet,
    required this.onSetLoading,
  });

  final AskWhichCard askWhichCard;
  final AskNewSet askNewSet;
  /// Called while a whole set is fetched, which takes a moment.
  final void Function(String setName) onSetLoading;

  /// Set codes of the cube, to fix what OCR misread.
  Set<String> knownSets = const {};
  /// Sets the user said no to in this scan session.
  final declinedSets = <String>{};

  bool nameMatches(String read, Map<String, Object?> card) {
    final a = plainName(read);
    if (a.length < 4) return false;
    for (final name in [card['name_de'], card['name']]) {
      final b = plainName('${name ?? ''}');
      if (b.isEmpty) continue;
      if (b.contains(a) || a.contains(b)) return true;
      final prefix = [a.length, b.length, 6].reduce((x, y) => x < y ? x : y);
      if (a.substring(0, prefix) == b.substring(0, prefix)) return true;
    }
    return false;
  }

  /// Scryfall knows the print; the cube knows which card it counts for. A card
  /// scanned for the first time is created here, a new set only after asking.
  Future<Found?> find(CardHit hit, {required bool private, required String variant}) async {
    if (private) return _lookupPrivate(hit, variant: variant);
    var confirmed = false;
    // The print that is counted, and the print the cube card is built from.
    // For a prerelease card those differ: PFDN 134s belongs to FDN 134.
    Map<String, dynamic>? json;
    Map<String, dynamic>? base;
    if (hit.set != null) {
      json = await fetchBySetNumber(
        hit.set!,
        hit.number,
        hit.lang,
        variant: variant,
      );
      base = json == null || json['set'] == hit.set!.toLowerCase()
          ? json
          : await fetchBySetNumber(hit.set!, hit.number, hit.lang) ?? json;
    } else {
      final found = await _findInCubeSets(hit);
      json = found?.json;
      base = json;
      confirmed = found?.confirmed ?? false;
    }
    if (json == null || base == null) return null;
    final printId = json['id'] as String;
    final lang = json['lang'] as String;
    final printSet = '${json['set']}';
    final printNumber = '${json['collector_number']}';
    final setCode = base['set'] as String;
    final oracleId = oracleIdOf(base);
    if (oracleId == null) {
      return (
        printId: printId,
        lang: lang,
        setCode: printSet,
        number: printNumber,
        card: null,
        problem: 'Karte ohne Oracle-ID',
        confirmed: confirmed,
      );
    }

    var card = await Db.findCard(setCode, oracleId);
    if (card == null) {
      if (await Db.findSet(setCode) == null) {
        if (declinedSets.contains(setCode)) {
          return (
            printId: printId,
            lang: lang,
            setCode: printSet,
            number: printNumber,
            card: null,
            problem: '${base['set_name']} ist nicht im Cube',
            confirmed: confirmed,
          );
        }
        final set = await fetchSet(setCode);
        if (set == null) return null;
        // A bonus sheet or commander deck of a set in the cube joins silently.
        final parent = set['parent_set_code'] as String?;
        var parentCode = parent != null && await Db.findSet(parent) != null
            ? parent
            : null;
        if (parentCode == null) {
          final answer = await askNewSet('${base['set_name']}');
          if (answer == null) {
            declinedSets.add(setCode);
            return (
              printId: printId,
              lang: lang,
              setCode: printSet,
              number: printNumber,
              card: null,
              problem: '${base['set_name']} ist nicht im Cube',
              confirmed: confirmed,
            );
          }
          parentCode = answer.isEmpty ? null : answer;
        }
        // The whole set comes in with 0 copies, so the cube can show what is missing.
        onSetLoading('${set['name']}');
        await Db.addSet(set, parentCode: parentCode);
        await Db.addCards(await fetchSetRows(setCode));
        card = await Db.findCard(setCode, oracleId);
      }
      // A set added before whole-set loading can still miss this card.
      card ??= await Db.addCard(await fetchCardRow(base));
    }

    final set = card?['sets'] as Map?;
    final problem = card == null
        ? 'Karte konnte nicht angelegt werden'
        : set?['in_cube'] != true
        ? '${set?['name']} ist nicht mehr im Cube'
        : card['excluded'] == true
        ? 'Karte ist ausgeschlossen'
        : null;
    return (
      printId: printId,
      lang: lang,
      setCode: printSet,
      number: printNumber,
      card: card,
      problem: problem,
      confirmed: confirmed,
    );
  }

  /// Own cards can come from any set, so only Scryfall is asked. Without a set
  /// code on the card the name decides, across all sets.
  Future<Found?> _lookupPrivate(CardHit hit, {required String variant}) async {
    final json = hit.set != null
        ? await fetchBySetNumber(hit.set!, hit.number, hit.lang, variant: variant)
        : hit.name == null
        ? null
        : await fetchByPrintedName(hit.name!);
    if (json == null) return null;
    final row = privateRow(json);
    return (
      printId: json['id'] as String,
      lang: json['lang'] as String,
      setCode: '${json['set']}',
      number: '${json['collector_number']}',
      // The oracle id groups prints of the same card while scanning.
      card: {...row, 'id': row['oracle_id']},
      problem: null,
      confirmed: false,
    );
  }

  /// Retro frame cards print no set code. The number is tried in every set of
  /// the cube and only the card whose name matches the read name is taken.
  Future<({Map<String, dynamic> json, bool confirmed})?> _findInCubeSets(
    CardHit hit,
  ) async {
    final name = hit.name;
    bool matches(Map<String, dynamic> json) =>
        name != null &&
        nameMatches(name, {
          'name': json['name'],
          'name_de': json['printed_name'],
        });

    final candidates = <Map<String, dynamic>>[];
    for (final set in knownSets) {
      final json = await fetchBySetNumber(set, hit.number, hit.lang);
      if (json == null) continue;
      if (matches(json)) return (json: json, confirmed: false);
      candidates.add(json);
    }
    // The tiny number is easy to misread, so the name alone can find the card.
    if (name != null) {
      for (final json in await searchInSets(name, knownSets)) {
        if (matches(json)) return (json: json, confirmed: false);
      }
    }
    // Name unreadable or different: let the user pick instead of failing.
    if (candidates.isEmpty) return null;
    final picked = await askWhichCard(candidates);
    return picked == null ? null : (json: picked, confirmed: true);
  }
}
