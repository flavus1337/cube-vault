import 'package:flutter/material.dart';

abstract final class VaultColors {
  static const ink = Color(0xFF15120F);
  static const surface = Color(0xFF1B1612);
  static const surfaceElevated = Color(0xFF211B16);
  static const surfaceHigh = Color(0xFF2B231C);
  static const parchment = Color(0xFFEADFCE);
  static const parchmentBright = Color(0xFFEEE6DC);
  static const ember = Color(0xFFD66029);
  static const emberBright = Color(0xFFE0703A);
  static const brass = Color(0xFFC69E5F);
  static const brassMuted = Color(0xFFB8905A);
  static const outline = Color(0xFF715E4B);
  static const success = Color(0xFF7FAF86);
  static const warning = Color(0xFFE1AD55);
  static const error = Color(0xFFE78B71);
  static const info = Color(0xFF88A7B0);
}

ThemeData buildVaultTheme() {
  const scheme = ColorScheme.dark(
    primary: VaultColors.ember,
    onPrimary: VaultColors.ink,
    primaryContainer: VaultColors.emberBright,
    onPrimaryContainer: VaultColors.ink,
    secondary: VaultColors.brass,
    onSecondary: VaultColors.ink,
    secondaryContainer: VaultColors.surfaceHigh,
    onSecondaryContainer: VaultColors.parchmentBright,
    surface: VaultColors.surface,
    onSurface: VaultColors.parchment,
    error: VaultColors.error,
    onError: VaultColors.ink,
    outline: VaultColors.outline,
    outlineVariant: VaultColors.surfaceHigh,
  );
  const rounded = RoundedRectangleBorder(
    borderRadius: BorderRadius.all(Radius.circular(14)),
  );

  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: VaultColors.ink,
  );

  return base.copyWith(
    focusColor: VaultColors.emberBright.withValues(alpha: 0.28),
    splashColor: VaultColors.ember.withValues(alpha: 0.16),
    highlightColor: VaultColors.brass.withValues(alpha: 0.12),
    textTheme: base.textTheme.apply(
      bodyColor: VaultColors.parchment,
      displayColor: VaultColors.parchmentBright,
    ),
    iconTheme: const IconThemeData(color: VaultColors.brass),
    appBarTheme: const AppBarTheme(
      backgroundColor: VaultColors.surface,
      foregroundColor: VaultColors.parchmentBright,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      elevation: 0,
      scrolledUnderElevation: 1,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: VaultColors.ember,
        foregroundColor: VaultColors.ink,
        disabledBackgroundColor: VaultColors.surfaceHigh,
        disabledForegroundColor: VaultColors.outline,
        minimumSize: const Size(48, 48),
        shape: rounded,
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: VaultColors.brass,
        minimumSize: const Size(48, 48),
        side: const BorderSide(color: VaultColors.brassMuted),
        shape: rounded,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: VaultColors.brass,
        minimumSize: const Size(48, 48),
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: VaultColors.ember,
      foregroundColor: VaultColors.ink,
      extendedTextStyle: TextStyle(fontWeight: FontWeight.w700),
      shape: rounded,
    ),
    inputDecorationTheme: const InputDecorationThemeData(
      filled: true,
      fillColor: VaultColors.surfaceElevated,
      hintStyle: TextStyle(color: VaultColors.brassMuted),
      prefixIconColor: VaultColors.brass,
      contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(14)),
        borderSide: BorderSide(color: VaultColors.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(14)),
        borderSide: BorderSide(color: VaultColors.outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(14)),
        borderSide: BorderSide(color: VaultColors.emberBright, width: 2),
      ),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: VaultColors.surfaceElevated,
      selectedColor: VaultColors.brass,
      disabledColor: VaultColors.surface,
      labelStyle: const TextStyle(color: VaultColors.parchment),
      secondaryLabelStyle: const TextStyle(
        color: VaultColors.ink,
        fontWeight: FontWeight.w700,
      ),
      checkmarkColor: VaultColors.ink,
      side: const BorderSide(color: VaultColors.outline),
      shape: const StadiumBorder(),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
    ),
    cardTheme: const CardThemeData(
      color: VaultColors.surfaceElevated,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: rounded,
    ),
    dialogTheme: const DialogThemeData(
      backgroundColor: VaultColors.surfaceElevated,
      surfaceTintColor: Colors.transparent,
      shape: rounded,
      titleTextStyle: TextStyle(
        color: VaultColors.parchmentBright,
        fontSize: 22,
        fontWeight: FontWeight.w700,
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: VaultColors.surface,
      modalBackgroundColor: VaultColors.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: VaultColors.parchmentBright,
      contentTextStyle: TextStyle(color: VaultColors.ink),
      actionTextColor: VaultColors.ember,
      behavior: SnackBarBehavior.floating,
      shape: rounded,
    ),
    dividerTheme: const DividerThemeData(
      color: VaultColors.outline,
      thickness: 1,
      space: 1,
    ),
    listTileTheme: const ListTileThemeData(
      iconColor: VaultColors.brass,
      textColor: VaultColors.parchment,
      minTileHeight: 56,
      shape: rounded,
    ),
    dropdownMenuTheme: const DropdownMenuThemeData(
      inputDecorationTheme: InputDecorationThemeData(
        filled: true,
        fillColor: VaultColors.surfaceElevated,
      ),
      menuStyle: MenuStyle(
        backgroundColor: WidgetStatePropertyAll(VaultColors.surfaceElevated),
      ),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: VaultColors.ember,
      linearTrackColor: VaultColors.surfaceHigh,
      circularTrackColor: VaultColors.surfaceHigh,
    ),
  );
}

class VaultLogo extends StatelessWidget {
  final bool compact;
  final double height;

  const VaultLogo({super.key, this.compact = false, this.height = 64});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      compact ? 'assets/logo-mark.png' : 'assets/logo.png',
      height: height,
      fit: BoxFit.contain,
      semanticLabel: 'Cube Vault',
    );
  }
}
