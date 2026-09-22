import 'dart:convert';

import 'package:http/http.dart' as http;

// Scryfall asks for a custom User-Agent and an Accept header.
const _headers = {'User-Agent': 'MtgScanner/0.1', 'Accept': 'application/json'};

/// Returns null when Scryfall does not know the card. Network errors throw.
Future<Map<String, dynamic>?> _get(
  String path, [
  Map<String, String>? query,
]) async {
  final uri = Uri.https('api.scryfall.com', path, query);
  var res = await _fetch(uri);
  // 429 = too many requests. Wait as long as Scryfall asks, at most twice.
  for (var tries = 0; res.statusCode == 429 && tries < 2; tries++) {
    await Future.delayed(
      Duration(seconds: int.tryParse(res.headers['retry-after'] ?? '') ?? 15),
    );
    res = await _fetch(uri);
  }
  if (res.statusCode == 404) return null;
  if (res.statusCode != 200) {
    throw http.ClientException('Scryfall ${res.statusCode}');
  }
  return jsonDecode(res.body) as Map<String, dynamic>;
}

// One client for all requests: it keeps the connection open, which saves a
// handshake on a slow mobile network.
final _client = http.Client();

/// On mobile data a request can hang or the connection can drop, so it gets
/// a time limit and two more attempts.
Future<http.Response> _fetch(Uri uri) async {
  for (var attempt = 1; ; attempt++) {
    try {
      return await _client
          .get(uri, headers: _headers)
          .timeout(const Duration(seconds: 8));
    } catch (e) {
      if (attempt >= 3) rethrow;
      await Future.delayed(Duration(milliseconds: 400 * attempt));
    }
  }
}

// Language code printed on the card -> Scryfall language code.
const _langs = {
  'EN': 'en',
  'DE': 'de',
  'FR': 'fr',
  'IT': 'it',
  'ES': 'es',
  'PT': 'pt',
  'JA': 'ja',
  'JP': 'ja',
  'RU': 'ru',
  'KO': 'ko',
  'ZHS': 'zhs',
  'ZHT': 'zht',
  'PH': 'ph',
};

/// Fetches the print in its printed language. Scryfall does not have every
/// language for every set, so this falls back to the English print.
/// [variant] picks the printing: 'normal', or 'prerelease' and 'promo' for the
/// stamped cards. Those carry the same set code and number on the card itself;
/// Scryfall keeps them in the promo set, e.g. FDN 134 becomes PFDN 134s.
Future<Map<String, dynamic>?> fetchBySetNumber(
  String set,
  String number,
  String? lang, {
  String variant = 'normal',
}) async {
  // Unknown language: German first, the cube is played in German.
  final code = _langs[lang ?? 'DE'] ?? 'en';

  Future<Map<String, dynamic>?> print(String path) async {
    final card = code == 'en' ? null : await _get('$path/$code');
    return card ?? _get(path);
  }

  if (variant != 'normal') {
    final suffix = variant == 'prerelease' ? 's' : 'p';
    final promo = await print('/cards/p${set.toLowerCase()}/$number$suffix');
    if (promo != null) return promo;
  }
  return print('/cards/${set.toLowerCase()}/$number');
}

/// Double-faced and reversible cards can keep the oracle id on their faces.
String? oracleIdOf(Map<String, dynamic> card) =>
    card['oracle_id'] ?? (card['card_faces'] as List?)?.first['oracle_id'];

/// Finds a card by the name printed on it, German first. Only used for a
/// player's own cards, where the set code was not readable.
Future<Map<String, dynamic>?> fetchByPrintedName(String name) async {
  final german = await _get('/cards/search', {'q': '"$name" lang:de'});
  final card = (german?['data'] as List?)?.first as Map<String, dynamic>?;
  return card ?? await _get('/cards/named', {'fuzzy': name});
}

Future<Map<String, dynamic>?> fetchSet(String code) => _get('/sets/$code');

// Scryfall allows only about 2 searches per second, and answers 429 above that.
const _searchPause = Duration(milliseconds: 500);

/// German prints in [sets] whose name matches [name]. Used for retro frame
/// cards, where only the collector number is printed and OCR may misread it.
Future<List<Map<String, dynamic>>> searchInSets(
  String name,
  Iterable<String> sets,
) async {
  if (sets.isEmpty) return const [];
  final where = sets.map((s) => 'e:${s.toLowerCase()}').join(' or ');
  final found = await _get('/cards/search', {'q': '($where) lang:de $name'});
  return [...((found?['data'] as List?) ?? const [])].cast();
}

/// All pages of a Scryfall search, one print per row.
Future<List<Map<String, dynamic>>> _searchPrints(
  String q, {
  String order = 'set',
}) async {
  final prints = <Map<String, dynamic>>[];
  await Future.delayed(_searchPause);
  var page = await _get('/cards/search', {
    'q': q,
    'unique': 'prints',
    'order': order,
    'dir': 'desc',
  });
  while (page != null) {
    prints.addAll((page['data'] as List).cast());
    if (page['has_more'] != true) break;
    await Future.delayed(_searchPause);
    final next = Uri.parse(page['next_page'] as String);
    page = await _get(next.path, next.queryParameters);
  }
  return prints;
}

int _compareNumbers(Map a, Map b) {
  int n(Map c) =>
      int.tryParse(
        RegExp(r'^\d+').stringMatch('${c['collector_number']}') ?? '',
      ) ??
      0;
  final d = n(a).compareTo(n(b));
  return d != 0
      ? d
      : '${a['collector_number']}'.compareTo('${b['collector_number']}');
}

/// All cards of a set as `cards` rows, like web/src/importSet.ts: one row per
/// card, the main print is its lowest collector number, German data comes from
/// the German print with that number.
Future<List<Map<String, Object?>>> fetchSetRows(String set) async {
  final main = <String, Map<String, dynamic>>{};
  for (final print in await _searchPrints('e:$set lang:en game:paper')) {
    final oracleId = oracleIdOf(print);
    if (oracleId == null) continue;
    final known = main[oracleId];
    if (known == null || _compareNumbers(print, known) < 0) {
      main[oracleId] = print;
    }
  }
  final german = {
    for (final print in await _searchPrints('e:$set lang:de'))
      print['collector_number']: print,
  };
  final elsewhere = await _germanElsewhere([
    for (final e in main.entries)
      if (!german.containsKey(e.value['collector_number'])) e.key,
  ]);
  return [
    for (final e in main.entries)
      _cardRow(
        e.value,
        german[e.value['collector_number']] ?? elsewhere[e.key],
        e.key,
      ),
  ];
}

/// Some cards have no German print in their own set on Scryfall (e.g. starter
/// kit cards in Foundations). Names and texts are the same in every set, so
/// they come from the newest German print elsewhere, image included. Keyed by oracle id.
Future<Map<String, Map<String, dynamic>>> _germanElsewhere(
  List<String> oracleIds,
) async {
  final found = <String, Map<String, dynamic>>{};
  for (var i = 0; i < oracleIds.length; i += 20) {
    final ids = oracleIds.sublist(i, (i + 20).clamp(0, oracleIds.length));
    final q = '(${ids.map((id) => 'oracleid:$id').join(' or ')}) lang:de';
    for (final print in await _searchPrints(q, order: 'released')) {
      found.putIfAbsent(oracleIdOf(print)!, () => print);
    }
  }
  return found;
}

/// The `cards` row for a single scanned print whose set is already in the cube.
Future<Map<String, Object?>> fetchCardRow(Map<String, dynamic> scanned) async {
  final set = scanned['set'] as String;
  final oracleId = oracleIdOf(scanned)!;
  final prints =
      await _searchPrints('e:$set oracleid:$oracleId lang:en game:paper')
        ..sort(_compareNumbers);
  final en = prints.isEmpty ? scanned : prints.first;
  final de = await _get('/cards/$set/${en['collector_number']}/de');
  if (de != null) return _cardRow(en, de, oracleId);
  final elsewhere = await _germanElsewhere([oracleId]);
  return _cardRow(en, elsewhere[oracleId], oracleId);
}

/// [de] can be a print from another set: then the German image has other art,
/// which is still better than English text. `image_en` keeps this set's image.
Map<String, Object?> _cardRow(
  Map<String, dynamic> en,
  Map<String, dynamic>? de,
  String oracleId,
) {
  final face = (en['card_faces'] as List?)?.first as Map<String, dynamic>?;
  final typeLine = _field(en, 'type_line', ' // ') ?? '';
  final basic = typeLine.contains('Basic Land');
  return {
    'id': en['id'],
    'oracle_id': oracleId,
    'set_code': en['set'],
    'number': en['collector_number'],
    'name': en['name'],
    'name_de': _field(de, 'printed_name', ' // '),
    'type_line': typeLine,
    'type_de': _field(de, 'printed_type_line', ' // '),
    'oracle_text': _field(en, 'oracle_text', '\n//\n') ?? '',
    'text_de': _field(de, 'printed_text', '\n//\n'),
    'mana_cost': _field(en, 'mana_cost', ' // ') ?? '',
    'cmc': (en['cmc'] as num?)?.toDouble() ?? 0,
    'colors': ((en['colors'] ?? face?['colors'] ?? const []) as List).join(),
    'color_identity': ((en['color_identity'] ?? const []) as List).join(),
    'keywords': en['keywords'] ?? const [],
    'rarity': en['rarity'],
    'layout': en['layout'],
    'image': _image(de) ?? _image(en),
    'image_en': _image(en),
    'price_eur': double.tryParse('${en['prices']?['eur']}'),
    // Which formats allow the card, as Scryfall reports it.
    'legalities': en['legalities'],
    'excluded': basic,
    'exclude_reason': basic ? 'Standardland' : null,
  };
}

/// Top-level field, or the faces' fields joined (double-faced cards).
String? _field(Map<String, dynamic>? card, String key, String sep) {
  if (card == null) return null;
  if (card[key] is String) return card[key] as String;
  final parts = [
    for (final f in (card['card_faces'] as List?) ?? const [])
      if (f[key] is String && f[key] != '') f[key] as String,
  ];
  return parts.isEmpty ? null : parts.join(sep);
}

String? _image(Map<String, dynamic>? card) {
  if (card == null) return null;
  final uris =
      card['image_uris'] ?? (card['card_faces'] as List?)?.first['image_uris'];
  return (uris as Map?)?['normal'] as String?;
}

/// A row for `private_cards`: what one scanned print is, without the cube.
Map<String, Object?> privateRow(Map<String, dynamic> json) {
  final face = (json['card_faces'] as List?)?.first as Map<String, dynamic>?;
  return {
    'print_id': json['id'],
    'oracle_id': oracleIdOf(json),
    'set_code': json['set'],
    'set_name': json['set_name'],
    'number': json['collector_number'],
    'name': json['name'],
    'name_de': _field(json, 'printed_name', ' // '),
    'type_line': _field(json, 'type_line', ' // ') ?? '',
    'type_de': _field(json, 'printed_type_line', ' // '),
    'mana_cost': _field(json, 'mana_cost', ' // ') ?? '',
    'cmc': (json['cmc'] as num?)?.toDouble() ?? 0,
    'colors': ((json['colors'] ?? face?['colors'] ?? const []) as List).join(),
    'rarity': json['rarity'],
    'image': _image(json),
    'price_eur': double.tryParse('${json['prices']?['eur']}'),
    'lang': json['lang'],
  };
}
