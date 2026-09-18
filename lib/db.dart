import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';

SupabaseClient get _sb => Supabase.instance.client;

/// Cube Vault data in Supabase (schema: supabase/migrations).
class Db {
  static Future<void> open() =>
      Supabase.initialize(url: supabaseUrl, publishableKey: supabaseKey);

  static Session? get session => _sb.auth.currentSession;
  static Stream<AuthState> get authChanges => _sb.auth.onAuthStateChange;

  /// Opens Discord in the browser. The session arrives through [authChanges]
  /// once Discord sends the user back via the deep link.
  static Future<void> loginWithDiscord() => _sb.auth.signInWithOAuth(
    OAuthProvider.discord,
    redirectTo: 'de.prigl.mtgscanner://login-callback',
    authScreenLaunchMode: LaunchMode.externalApplication,
    // Discord skips its own screen once you have authorized the app.
    queryParams: const {'prompt': 'none'},
  );

  static Future<void> logout() => _sb.auth.signOut();

  /// 'waiting', 'player', 'editor' or 'admin'. null while the profile is not created yet.
  static Future<String?> myRole() async {
    final row = await _sb
        .from('profiles')
        .select('role')
        .eq('id', _sb.auth.currentUser!.id)
        .maybeSingle();
    return row?['role'] as String?;
  }

  /// Cards of all sets in the cube, with `qty` = scanned copies of all prints.
  /// Cards with 0 copies are only there after a whole-set import.
  static Future<List<Map<String, Object?>>> cubeCards() async {
    final rows = <Map<String, Object?>>[];
    // Supabase returns at most 1000 rows per request, so read page by page.
    for (var from = 0; ; from += 1000) {
      final page = await _sb
          .from('cards')
          .select('*, sets!inner(name, in_cube), copies(print_id, qty)')
          .eq('sets.in_cube', true)
          .eq('excluded', false)
          .order('id')
          .range(from, from + 999);
      rows.addAll(page);
      if (page.length < 1000) break;
    }
    for (final r in rows) {
      r['qty'] = (r['copies'] as List).fold<int>(
        0,
        (s, c) => s + (c['qty'] as int),
      );
    }
    return rows;
  }

  /// The cube card for a scanned print: same set, same oracle id.
  static Future<Map<String, Object?>?> findCard(
    String setCode,
    String oracleId,
  ) => _sb
      .from('cards')
      .select('*, sets(name, in_cube)')
      .eq('set_code', setCode)
      .eq('oracle_id', oracleId)
      .maybeSingle();

  /// Set codes in the cube, upper case, to fix OCR mistakes while scanning.
  static Future<Set<String>> setCodes() async => {
    for (final r in await _sb.from('sets').select('code'))
      '${r['code']}'.toUpperCase(),
  };

  static Future<Map<String, Object?>?> findSet(String code) =>
      _sb.from('sets').select().eq('code', code).maybeSingle();

  /// [set] is Scryfall's set object. [parentCode] links a bonus sheet or a
  /// commander deck to the main set it is drafted with.
  static Future<void> addSet(
    Map<String, dynamic> set, {
    String? parentCode,
  }) async {
    await _sb.from('sets').upsert({
      'code': set['code'],
      'name': set['name'],
      'released_at': set['released_at'],
      'icon_svg_uri': set['icon_svg_uri'],
      'parent_code': parentCode ?? set['parent_set_code'],
    }, ignoreDuplicates: true);
  }

  /// Sets in the cube with their codes and names, for the sub-set question.
  static Future<List<Map<String, Object?>>> cubeSets() =>
      _sb.from('sets').select('code, name').eq('in_cube', true).order('name');

  /// Inserts cards that are not there yet. Existing cards keep their data and exclusions.
  static Future<void> addCards(List<Map<String, Object?>> rows) async {
    for (var i = 0; i < rows.length; i += 200) {
      await _sb
          .from('cards')
          .upsert(
            rows.sublist(i, (i + 200).clamp(0, rows.length)),
            ignoreDuplicates: true,
          );
    }
  }

  /// Creates the card unless another phone was faster, then reads it back with its set.
  static Future<Map<String, Object?>?> addCard(Map<String, Object?> row) async {
    await _sb.from('cards').upsert(row, ignoreDuplicates: true);
    return findCard('${row['set_code']}', '${row['oracle_id']}');
  }

  /// Both return how many copies of the card exist afterwards.
  static Future<int> addCopy(
    String printId,
    String cardId,
    String lang,
  ) async =>
      await _sb.rpc(
            'add_copy',
            params: {
              'p_print_id': printId,
              'p_card_id': cardId,
              'p_lang': lang,
            },
          )
          as int;

  static Future<int> removeCopy(String printId, String cardId) async =>
      await _sb.rpc(
            'remove_copy',
            params: {'p_print_id': printId, 'p_card_id': cardId},
          )
          as int;
}
