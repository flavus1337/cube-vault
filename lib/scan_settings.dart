import 'package:flutter/material.dart';

/// What a scan is filed as: where it goes, how it shines, which printing.
typedef ScanSettings = ({bool privateMode, String finish, String variant});

/// Finish of a scanned copy: value, label and the icon on the chip.
const finishes = <(String, String, IconData)>[
  ('nonfoil', 'Normal', Icons.crop_portrait),
  ('foil', 'Foil', Icons.auto_awesome),
  ('etched', 'Etched', Icons.brush),
];

/// Printing of a scanned card. Scryfall keeps the stamped ones in the promo
/// set of the same block, e.g. FDN 134 next to PFDN 134s.
const variants = <(String, String)>[
  ('normal', 'Standard'),
  ('prerelease', 'Prerelease'),
  ('promo', 'Promo'),
];

String label(List<(String, String, IconData)> options, String value) =>
    options.firstWhere((o) => o.$1 == value).$2;

/// "Cube · Normal · Standard", the line over the camera picture.
String settingsLine(ScanSettings s) =>
    '${s.privateMode ? 'Meine Karten' : 'Cube'} · '
    '${label(finishes, s.finish)} · '
    '${variants.firstWhere((v) => v.$1 == s.variant).$2}';

/* One sheet instead of three rows of chips over the camera. Every choice
   carries the sentence that explains it, because "Etched" and "Promo" mean
   nothing to someone holding the phone for the first time. */
Future<void> showScanSettings(
  BuildContext context, {
  required bool canEdit,
  required ScanSettings settings,
  required void Function(ScanSettings next) onChange,
}) async {
  var current = settings;

  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSheet) {
        void update(ScanSettings next) {
          setSheet(() => current = next);
          onChange(next);
        }

        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SheetTitle(
                  'Wohin',
                  'Der Cube ist für alle, deine Karten siehst nur du.',
                ),
                SegmentedButton<bool>(
                  segments: [
                    ButtonSegment(
                      value: false,
                      label: const Text('Cube'),
                      icon: const Icon(Icons.inventory_2),
                      enabled: canEdit,
                    ),
                    const ButtonSegment(
                      value: true,
                      label: Text('Meine Karten'),
                      icon: Icon(Icons.person),
                    ),
                  ],
                  selected: {current.privateMode},
                  onSelectionChanged: (choice) => update((
                    privateMode: choice.first,
                    finish: current.finish,
                    variant: current.variant,
                  )),
                ),
                const _SheetTitle(
                  'Folierung',
                  'Ob eine Karte glänzt, sieht die Kamera nicht. Foils zählen als eigener Stapel.',
                ),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final option in finishes)
                      ChoiceChip(
                        label: Text(option.$2),
                        avatar: Icon(option.$3, size: 18),
                        selected: current.finish == option.$1,
                        onSelected: (_) => update((
                          privateMode: current.privateMode,
                          finish: option.$1,
                          variant: current.variant,
                        )),
                      ),
                  ],
                ),
                const _SheetTitle(
                  'Druck',
                  'Prerelease- und Promo-Karten tragen denselben Setcode wie die normale Karte, '
                      'nur der Stempel unterscheidet sie.',
                ),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final option in variants)
                      ChoiceChip(
                        label: Text(option.$2),
                        selected: current.variant == option.$1,
                        onSelected: (_) => update((
                          privateMode: current.privateMode,
                          // Prerelease cards are always foil.
                          finish: option.$1 == 'prerelease' ? 'foil' : current.finish,
                          variant: option.$1,
                        )),
                      ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

/// A heading in the settings sheet with the line that explains it.
class _SheetTitle extends StatelessWidget {
  final String title;
  final String hint;
  const _SheetTitle(this.title, this.hint);

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 18, bottom: 8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 2),
        Text(hint, style: Theme.of(context).textTheme.bodySmall),
      ],
    ),
  );
}
