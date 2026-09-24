import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';

SupabaseClient get _sb => Supabase.instance.client;

/// Cubist data in Supabase (schema: supabase/migrations).
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

  /// What this player scanned, newest first: cube scans come from the shared
  /// history, own cards from the private list. One entry per card.
  static Future<List<Map<String, Object?>>> myScans({int limit = 60}) async {
    final me = _sb.auth.currentUser!.id;
    final events = await _sb
        .from('card_events')
        .select('id, at, action, delta, card_id')
        .eq('user_id', me)
        .inFilter('action', ['copy_added', 'copy_removed'])
        .order('at', ascending: false)
        .limit(limit);

    final ids = {
      for (final e in events) e['card_id'] as String?,
    }.nonNulls.toList();
    final cards = ids.isEmpty
        ? <Map<String, dynamic>>[]
        : await _sb
              .from('cards')
              .select(
                'id, name, name_de, image, set_code, number, type_line, type_de',
              )
              .inFilter('id', ids);
    final byId = {for (final c in cards) c['id'] as String: c};

    final private = await _sb
        .from('private_cards')
        .select()
        .order('added_at', ascending: false)
        .limit(limit);

    final scans = <Map<String, Object?>>[
      for (final e in events)
        if (byId[e['card_id']] != null)
          {
            ...byId[e['card_id']]!,
            'kind': 'cube',
            'at': e['at'],
            'delta': e['delta'],
            'card_id': e['card_id'],
          },
      for (final card in private)
        {
          ...card,
          'kind': 'private',
          'at': card['added_at'],
          'delta': card['qty'],
        },
    ];
    scans.sort((a, b) => '${b['at']}'.compareTo('${a['at']}'));
    return scans.take(limit).toList();
  }

  /// Takes one copy back. For a cube card the print with the most copies is used.
  static Future<void> undoScan(Map<String, Object?> scan) async {
    if (scan['kind'] == 'private') {
      await removePrivateCopy(
        '${scan['print_id']}',
        '${scan['finish'] ?? 'nonfoil'}',
      );
      return;
    }
    final cardId = '${scan['card_id'] ?? scan['id']}';
    final prints = await _sb
        .from('copies')
        .select('print_id, finish')
        .eq('card_id', cardId)
        .order('qty', ascending: false)
        .limit(1);
    if (prints.isEmpty) return;
    await removeCopy(
      '${prints.first['print_id']}',
      cardId,
      '${prints.first['finish']}',
    );
  }

  /// Cards a player keeps outside the cube. Only the owner can read them.
  /// The finish ('nonfoil', 'foil', 'etched') is part of the card map.
  static Future<int> addPrivateCopy(Map<String, Object?> card) async =>
      await _sb.rpc('add_private_copy', params: {'card': card}) as int;

  static Future<int> removePrivateCopy(
    String printId, [
    String finish = 'nonfoil',
  ]) async =>
      await _sb.rpc(
            'remove_private_copy',
            params: {'p_print_id': printId, 'p_finish': finish},
          )
          as int;

  /// Both return how many copies of the card exist afterwards. A foil is its
  /// own stack, so it does not turn the copies you already have into foils.
  /// [setCode] and [number] say which printing was scanned, so the website
  /// can tell a promo from the card's own printing.
  static Future<int> addCopy(
    String printId,
    String cardId,
    String lang, [
    String finish = 'nonfoil',
    String? setCode,
    String? number,
  ]) async =>
      await _sb.rpc(
            'add_copy',
            params: {
              'p_print_id': printId,
              'p_card_id': cardId,
              'p_lang': lang,
              'p_finish': finish,
              'p_set': setCode,
              'p_number': number,
            },
          )
          as int;

  static Future<int> removeCopy(
    String printId,
    String cardId, [
    String finish = 'nonfoil',
  ]) async =>
      await _sb.rpc(
            'remove_copy',
            params: {
              'p_print_id': printId,
              'p_card_id': cardId,
              'p_finish': finish,
            },
          )
          as int;
}
