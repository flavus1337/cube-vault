import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import 'app_theme.dart';
import 'card_parser.dart';
import 'db.dart';
import 'scan_lookup.dart';
import 'scan_settings.dart';
import 'main.dart' show displayName, largeImage, printLabel;

class ScanPage extends StatefulWidget {
  /// Only editors and admins may scan into the cube. Everyone else collects
  /// into their own cards.
  final bool canEdit;
  const ScanPage({super.key, required this.canEdit});

  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> {
  final _ocr = TextRecognizer();
  CameraController? _cam;
  String? _error;
  bool _busy = false;

  String? _candidate;
  String _status = 'Karte in den Rahmen halten';
  // How often each hit was read while cards are in view. Counting instead of
  // requiring consecutive frames: OCR often misses the set line in single frames.
  final _seen = <String, int>{};
  DateTime _lastHitAt = DateTime(0);
  DateTime _lastLogAt = DateTime(0);
  // Lookup results per hit key. null = Scryfall does not know it, so we don't ask again.
  final _cache = <String, Found?>{};
  late final _lookup = CardLookup(
    askWhichCard: _askWhichCard,
    askNewSet: _askNewSet,
    onSetLoading: (setName) => _showFlash(
      'Lade $setName …',
      VaultColors.info,
      Icons.downloading,
      subtitle: 'alle Karten des Sets',
      duration: const Duration(minutes: 1), // replaced by the next flash
    ),
  );
  /* Where a scan goes, how the card is finished and which printing it is.
     Stays as it is until you change it, so a pile of the same kind goes in one
     card after another. */
  late ScanSettings _settings = (
    privateMode: !widget.canEdit,
    finish: 'nonfoil',
    variant: 'normal',
  );

  Found? _last;
  // The card just counted. It counts again only after the camera saw nothing
  // for a few frames, which means the card was taken out of the picture.
  String? _countedCardId;
  int _framesWithoutCard = 0;
  static const _framesUntilGone = 3;
  int _ocrMs = 0;
  int _added = 0;

  // Short confirmation over the camera after each scan result.
  ({String title, String? subtitle, String? image, Color color, IconData icon})?
  _flash;
  Timer? _flashTimer;

  void _showFlash(
    String title,
    Color color,
    IconData icon, {
    String? subtitle,
    String? image,
    Duration duration = const Duration(milliseconds: 1500),
  }) {
    _flashTimer?.cancel();
    setState(
      () => _flash = (
        title: title,
        subtitle: subtitle,
        image: image,
        color: color,
        icon: icon,
      ),
    );
    _flashTimer = Timer(duration, () {
      if (mounted) setState(() => _flash = null);
    });
  }

  @override
  void initState() {
    super.initState();
    WakelockPlus.enable(); // the screen must not switch off while scanning
    _start();
    Db.setCodes()
        .then((codes) => _lookup.knownSets = codes)
        .catchError((_) => const <String>{});
  }

  Future<void> _start() async {
    try {
      final cams = await availableCameras();
      final cam = cams.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cams.first,
      );
      final ctrl = CameraController(
        cam,
        ResolutionPreset.veryHigh, // the collector number is tiny text
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.nv21,
      );
      await ctrl.initialize();
      if (!mounted) return ctrl.dispose();
      await ctrl.startImageStream(
        (img) => _onFrame(img, cam.sensorOrientation),
      );
      setState(() => _cam = ctrl);
    } catch (e) {
      setState(() => _error = '$e');
    }
  }

  Future<void> _onFrame(CameraImage img, int sensorOrientation) async {
    if (_busy) return;
    _busy = true;
    final ocrWatch = Stopwatch()..start();
    try {
      final plane = img.planes.first; // NV21 comes as a single plane
      final text = await _ocr.processImage(
        InputImage.fromBytes(
          bytes: plane.bytes,
          metadata: InputImageMetadata(
            size: Size(img.width.toDouble(), img.height.toDouble()),
            rotation: InputImageRotationValue.fromRawValue(sensorOrientation)!,
            format: InputImageFormat.nv21,
            bytesPerRow: plane.bytesPerRow,
          ),
        ),
      );
      final lines = [
        for (final b in text.blocks)
          for (final l in b.lines) OcrLine(l.text, l.boundingBox),
      ];
      _ocrMs = ocrWatch.elapsedMilliseconds;
      final hit = parseCard(lines, knownSets: _lookup.knownSets);
      // Diagnosis: when nothing is readable, log what the camera saw.
      if (hit == null &&
          DateTime.now().difference(_lastLogAt) > const Duration(seconds: 2)) {
        _lastLogAt = DateTime.now();
        debugPrint(
          'read nothing (${_ocrMs}ms): ${lines.map((l) => l.text).join(' | ')}',
        );
      }
      await _handle(hit);
    } catch (e) {
      debugPrint('scan: $e');
    } finally {
      _busy = false;
    }
  }

  Future<void> _handle(CardHit? hit) async {
    if (hit == null) {
      if (_countedCardId != null && ++_framesWithoutCard >= _framesUntilGone) {
        _countedCardId = null;
      }
      if (_candidate != null && mounted) {
        setState(() {
          _candidate = null;
          _status = 'Karte in den Rahmen halten';
        });
      }
      return;
    }
    final now = DateTime.now();
    if (now.difference(_lastHitAt) > const Duration(seconds: 1)) _seen.clear();
    _lastHitAt = now;
    final count = _seen[hit.key] = (_seen[hit.key] ?? 0) + 1;

    // Same card still in front of the camera: don't count it again. OCR can
    // read a different number on the same card, so the card id decides.
    final known = _cache[hit.key]?.card;
    if (known != null && known['id'] == _countedCardId) {
      _framesWithoutCard = 0;
      return;
    }
    if (_candidate != hit.key) {
      debugPrint('read ${hit.key}');
      if (mounted) {
        setState(() {
          _candidate = hit.key;
          _status = hit.set == null
              ? '#${hit.number} · suche in den Cube-Sets …'
              : '${hit.set} #${hit.number} · suche Karte …';
        });
      }
    }
    // A number without a set code fits every set, so the name always has to
    // confirm the card. With a set code, two identical reads are enough.
    final needsName = hit.set == null;
    if (hit.name == null && (needsName || count < 2)) {
      if (mounted) {
        setState(
          () => _status = needsName
              ? 'Kartenname nicht lesbar'
              : 'Karte noch kurz still halten',
        );
      }
      return;
    }

    final watch = Stopwatch()..start();
    if (!_cache.containsKey(hit.key)) {
      try {
        _cache[hit.key] = await _lookup.find(
          hit,
          private: _settings.privateMode,
          variant: _settings.variant,
        );
      } catch (e) {
        debugPrint('lookup ${hit.key} failed: $e');
        if (mounted) {
          _showFlash('Keine Verbindung', VaultColors.warning, Icons.wifi_off);
        }
        return;
      }
      final found = _cache[hit.key];
      if (!mounted) return;
      debugPrint(
        'lookup ${hit.key}: ${found == null ? 'unknown to Scryfall' : found.problem ?? 'ok'}',
      );
      if (found == null) {
        _showFlash(
          'Nicht gefunden',
          VaultColors.error,
          Icons.close,
          subtitle: hit.key,
        );
      } else if (found.problem != null) {
        _showFlash(
          found.problem!,
          VaultColors.error,
          Icons.block,
          subtitle: hit.key,
          image: found.card?['image'] as String?,
        );
      }
    }
    final found = _cache[hit.key];
    final card = found?.card;
    if (found == null || card == null || found.problem != null) return;
    final lookupMs = watch.elapsedMilliseconds;

    // A lookup can take seconds, and in that time this can become the card
    // that was just counted.
    if (card['id'] == _countedCardId) {
      _framesWithoutCard = 0;
      return;
    }

    // One read is enough when the name on the card matches the card we found.
    // Only a misread number could put the wrong card in, and a wrong number
    // almost never belongs to a card with the same name.
    if (!found.confirmed &&
        (needsName || count < 2) &&
        !_lookup.nameMatches(hit.name!, card)) {
      debugPrint(
        'name "${hit.name}" != "${card['name_de'] ?? card['name']}", waiting for a second read',
      );
      if (mounted) setState(() => _status = 'Karte noch kurz still halten');
      return;
    }

    final int qty;
    try {
      qty = _settings.privateMode
          ? await Db.addPrivateCopy({...card, 'finish': _settings.finish})
          : await Db.addCopy(
              found.printId,
              card['id'] as String,
              found.lang,
              _settings.finish,
            );
    } catch (e) {
      debugPrint('save ${hit.key} failed: $e');
      if (mounted) {
        _showFlash(
          'Speichern fehlgeschlagen',
          VaultColors.warning,
          Icons.cloud_off,
        );
      }
      return;
    }
    debugPrint(
      'scan ${hit.key}: $count reads (ocr ${_ocrMs}ms per frame), lookup ${lookupMs}ms, save ${watch.elapsedMilliseconds - lookupMs}ms',
    );
    HapticFeedback.heavyImpact();
    _countedCardId = card['id'] as String?;
    _framesWithoutCard = 0;
    _status = 'Karte weglegen, nächste Karte scannen';
    if (!mounted) return;
    setState(() {
      _last = found;
      _added++;
    });
    _showAdded(card, qty);
  }

  Future<Map<String, dynamic>?> _askWhichCard(
    List<Map<String, dynamic>> candidates,
  ) async {
    if (!mounted) return null;
    HapticFeedback.mediumImpact();
    return showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Welche Karte ist das?'),
        children: [
          for (final card in candidates)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(ctx, card),
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Image.network(
                  '${(card['image_uris'] ?? (card['card_faces'] as List?)?.first['image_uris'])?['normal']}',
                  width: 40,
                  errorBuilder: (_, _, _) =>
                      const Icon(Icons.image_not_supported),
                ),
                title: Text('${card['printed_name'] ?? card['name']}'),
                subtitle: Text(
                  '${'${card['set']}'.toUpperCase()} #${card['collector_number']}',
                ),
              ),
            ),
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Keine davon'),
          ),
        ],
      ),
    );
  }

  /// Asks what to do with a set that is not in the cube. Returns the parent set
  /// code for a sub-set, an empty string for a set of its own, null for no.
  /// Scanning pauses while the dialog is open: frames are skipped while busy.
  Future<String?> _askNewSet(String setName) async {
    if (!mounted) return null;
    HapticFeedback.mediumImpact();
    final cubeSets = await Db.cubeSets();
    if (!mounted) return null;
    return showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: Text('$setName ist nicht im Cube'),
        children: [
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx, ''),
            child: const Text('Als eigenes Set aufnehmen'),
          ),
          for (final set in cubeSets)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(ctx, '${set['code']}'),
              child: Text('Als Zusatz zu ${set['name']}'),
            ),
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Nicht aufnehmen'),
          ),
        ],
      ),
    );
  }

  void _showAdded(Map<String, Object?> card, int qty) => _showFlash(
    displayName(card),
    VaultColors.success,
    Icons.check_circle,
    subtitle: _settings.privateMode
        ? '${printLabel(card)} · jetzt $qty× in Meine Karten'
        : '${printLabel(card)} · jetzt $qty× gescannt',
    image: card['image'] as String?,
  );

  /* A different target or printing makes the same card a different scan, so
     what was read before must not count again. */
  Future<void> _openSettings() => showScanSettings(
    context,
    canEdit: widget.canEdit,
    settings: _settings,
    onChange: (next) => setState(() {
      final target = next.privateMode != _settings.privateMode;
      _settings = next;
      _cache.clear();
      _countedCardId = null;
      _last = null;
      if (target) _added = 0;
    }),
  );

  @override
  void dispose() {
    WakelockPlus.disable();
    _flashTimer?.cancel();
    _cam?.dispose();
    _ocr.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cam = _cam;
    final last = _last;
    final lastCard = last?.card;
    final flash = _flash;
    final frameColor =
        flash?.color ??
        (_candidate != null ? VaultColors.brass : VaultColors.parchment);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Row(
          children: [
            const VaultLogo(compact: true, height: 34),
            const SizedBox(width: 10),
            Flexible(child: Text('Scannen · $_added hinzugefügt')),
          ],
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: OutlinedButton.icon(
              onPressed: _openSettings,
              icon: const Icon(Icons.tune, size: 20),
              label: Text(
                settingsLine(_settings),
                overflow: TextOverflow.ellipsis,
              ),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(44),
              ),
            ),
          ),
        ),
      ),
      body: _error != null
          ? Center(child: Text('Kamera-Fehler: $_error'))
          : cam == null
          ? const Center(child: CircularProgressIndicator())
          : Stack(
              children: [
                Center(child: CameraPreview(cam)),
                Center(
                  child: FractionallySizedBox(
                    widthFactor: 0.8,
                    child: AspectRatio(
                      aspectRatio: 63 / 88, // Magic card
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: frameColor,
                            width: flash != null ? 6 : 2,
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: SafeArea(
                    bottom: false,
                    child: Semantics(
                      liveRegion: true,
                      label: _status,
                      child: ExcludeSemantics(
                        child: Container(
                          margin: const EdgeInsets.all(12),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                          decoration: BoxDecoration(
                            color: VaultColors.surfaceElevated.withValues(
                              alpha: 0.94,
                            ),
                            border: Border.all(color: VaultColors.outline),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Text(
                            _status,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: VaultColors.parchmentBright,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned.fill(
                  child: SafeArea(
                    child: Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(32),
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 150),
                          child: flash == null
                              ? const SizedBox.shrink()
                              : Semantics(
                                  key: ValueKey(flash),
                                  liveRegion: true,
                                  container: true,
                                  label: [
                                    flash.title,
                                    if (flash.subtitle != null) flash.subtitle!,
                                  ].join(', '),
                                  child: ExcludeSemantics(
                                    child: Card(
                                      color: VaultColors.surfaceElevated
                                          .withValues(alpha: 0.96),
                                      shape: RoundedRectangleBorder(
                                        side: BorderSide(
                                          color: flash.color,
                                          width: 2,
                                        ),
                                        borderRadius: BorderRadius.circular(14),
                                      ),
                                      child: Padding(
                                        padding: const EdgeInsets.all(16),
                                        child: Column(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            if (flash.image != null)
                                              ConstrainedBox(
                                                constraints:
                                                    const BoxConstraints(
                                                      maxHeight: 220,
                                                    ),
                                                child: Image.network(
                                                  largeImage(flash.image),
                                                  fit: BoxFit.contain,
                                                ),
                                              )
                                            else
                                              Icon(
                                                flash.icon,
                                                size: 56,
                                                color: flash.color,
                                              ),
                                            const SizedBox(height: 8),
                                            Text(
                                              flash.title,
                                              textAlign: TextAlign.center,
                                              style: const TextStyle(
                                                color:
                                                    VaultColors.parchmentBright,
                                                fontSize: 20,
                                                fontWeight: FontWeight.bold,
                                              ),
                                            ),
                                            if (flash.subtitle != null)
                                              Text(
                                                flash.subtitle!,
                                                textAlign: TextAlign.center,
                                                style: const TextStyle(
                                                  color: VaultColors.parchment,
                                                ),
                                              ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                        ),
                      ),
                    ),
                  ),
                ),
                if (last != null && lastCard != null)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: SafeArea(
                      top: false,
                      child: Semantics(
                        liveRegion: true,
                        container: true,
                        label:
                            'Zuletzt gescannt: ${displayName(lastCard)}, ${printLabel(lastCard)}',
                        child: Material(
                          color: VaultColors.surfaceElevated.withValues(
                            alpha: 0.96,
                          ),
                          child: ListTile(
                            leading: lastCard['image'] == null
                                ? null
                                : ClipRRect(
                                    borderRadius: BorderRadius.circular(4),
                                    child: Image.network(
                                      '${lastCard['image']}',
                                      width: 40,
                                    ),
                                  ),
                            title: Text(displayName(lastCard)),
                            subtitle: Text(printLabel(lastCard)),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  tooltip: 'Rückgängig',
                                  icon: const Icon(Icons.undo),
                                  onPressed: () async {
                                    if (_settings.privateMode) {
                                      await Db.removePrivateCopy(
                                        last.printId,
                                        _settings.finish,
                                      );
                                    } else {
                                      await Db.removeCopy(
                                        last.printId,
                                        lastCard['id'] as String,
                                        _settings.finish,
                                      );
                                    }
                                    setState(() {
                                      _last = null;
                                      _added--;
                                      _countedCardId =
                                          null; // scanning it again is fine now
                                    });
                                    _showFlash(
                                      'Entfernt',
                                      VaultColors.brassMuted,
                                      Icons.undo,
                                    );
                                  },
                                ),
                                IconButton(
                                  tooltip: 'Noch eine',
                                  icon: const Icon(Icons.add),
                                  onPressed: () async {
                                    final qty = _settings.privateMode
                                        ? await Db.addPrivateCopy({
                                            ...lastCard,
                                            'finish': _settings.finish,
                                          })
                                        : await Db.addCopy(
                                            last.printId,
                                            lastCard['id'] as String,
                                            last.lang,
                                            _settings.finish,
                                          );
                                    setState(() => _added++);
                                    _showAdded(lastCard, qty);
                                  },
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}
