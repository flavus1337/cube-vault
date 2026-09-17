import 'package:flutter_test/flutter_test.dart';
import 'package:mtg_scanner/update_check.dart';

void main() {
  test('finds newer versions only', () {
    expect(isNewer('v0.1.2', '0.1.1'), isTrue);
    expect(isNewer('v0.2.0', '0.1.9'), isTrue);
    expect(isNewer('v1.0.0', '0.9.9'), isTrue);
    expect(isNewer('v0.1.1', '0.1.1'), isFalse);
    expect(isNewer('v0.1.0', '0.1.1'), isFalse);
    expect(isNewer('0.1.2', '0.1.1'), isTrue); // tag without "v"
    expect(isNewer('v0.2', '0.1.5'), isTrue); // short tag
    expect(isNewer('garbage', '0.1.1'), isFalse);
  });
}
