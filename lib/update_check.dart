import 'dart:convert';

import 'package:http/http.dart' as http;

const _repo = 'flavus1337/cube-vault';
const apkUrl =
    'https://github.com/$_repo/releases/latest/download/cube-vault.apk';

/// Returns the tag of the newest release when it is newer than [current],
/// otherwise null. Tags look like "v0.1.2".
Future<String?> newerRelease(String current) async {
  final res = await http.get(
    Uri.https('api.github.com', '/repos/$_repo/releases/latest'),
    headers: const {'Accept': 'application/vnd.github+json'},
  );
  if (res.statusCode != 200) return null;
  final tag =
      (jsonDecode(res.body) as Map<String, dynamic>)['tag_name'] as String?;
  return tag != null && isNewer(tag, current) ? tag : null;
}

/// Compares "v0.1.2" with "0.1.1". Missing or odd parts count as 0.
bool isNewer(String tag, String current) {
  List<int> parts(String v) => [
    for (final p in v.replaceFirst(RegExp('^v'), '').split('.').take(3))
      int.tryParse(RegExp(r'^\d+').stringMatch(p) ?? '') ?? 0,
  ];
  final a = parts(tag), b = parts(current);
  for (var i = 0; i < 3; i++) {
    final x = i < a.length ? a[i] : 0;
    final y = i < b.length ? b[i] : 0;
    if (x != y) return x > y;
  }
  return false;
}
