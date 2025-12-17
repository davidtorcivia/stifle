package app.stifle.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * Stifle Design System
 * 
 * Philosophy: Warm, minimal, purposeful
 * - No purples, no gradients
 * - Earthy, calming tones that don't demand attention
 * - The app should fade into the background, encouraging you to put down your phone
 * - Typography-forward with excellent readability
 */

// ============================================================================
// COLOR PALETTE - Warm Earth Tones
// ============================================================================

// Primary: Deep Russet - earthy, sophisticated, organic
private val WarmTerracotta = Color(0xFF9E4825)
private val WarmTerracottaLight = Color(0xFFC88A75) 
private val WarmTerracottaDark = Color(0xFF5E2C18)

// Neutral: Warm Stone grays (less yellow than before)
private val WarmWhite = Color(0xFFF9F8F6) // Very subtle paper
private val WarmGray50 = Color(0xFFF2F0EC)
private val WarmGray100 = Color(0xFFE6E2DC)
private val WarmGray200 = Color(0xFFCDC8C0)
private val WarmGray300 = Color(0xFFB3ADA3)
private val WarmGray400 = Color(0xFF99938A)
private val WarmGray500 = Color(0xFF807A72)
private val WarmGray600 = Color(0xFF66615B)
private val WarmGray700 = Color(0xFF4D4945)
private val WarmGray800 = Color(0xFF33302E)
private val WarmGray900 = Color(0xFF1A1817) // Nearly black
private val WarmBlack = Color(0xFF0D0C0B)

// Accent: Muted olive for success states (streak active)
private val MutedOlive = Color(0xFF6B7D5A)
private val MutedOliveLight = Color(0xFF8FA077)

// Error: Soft rust (not harsh red)
private val SoftRust = Color(0xFFC45D4D)

// ============================================================================
// LIGHT THEME - Paper-like warmth
// ============================================================================

private val LightColorScheme = lightColorScheme(
    primary = WarmTerracotta,
    onPrimary = WarmWhite,
    primaryContainer = Color(0xFFFBE9E3),
    onPrimaryContainer = WarmTerracottaDark,
    
    secondary = WarmGray600,
    onSecondary = WarmWhite,
    secondaryContainer = WarmGray100,
    onSecondaryContainer = WarmGray700,
    
    tertiary = MutedOlive,
    onTertiary = WarmWhite,
    tertiaryContainer = Color(0xFFE8EDDF),
    onTertiaryContainer = Color(0xFF3D4A32),
    
    error = SoftRust,
    onError = WarmWhite,
    errorContainer = Color(0xFFFBE7E4),
    onErrorContainer = Color(0xFF7A2F24),
    
    background = WarmWhite,
    onBackground = WarmGray800,
    
    surface = WarmWhite,
    onSurface = WarmGray800,
    surfaceVariant = WarmGray50,
    onSurfaceVariant = WarmGray600,
    
    outline = WarmGray300,
    outlineVariant = WarmGray200,
    
    inverseSurface = WarmGray800,
    inverseOnSurface = WarmGray50,
    inversePrimary = WarmTerracottaLight,
    
    scrim = WarmBlack,
)

// ============================================================================
// DARK THEME - Warm charcoal, not cold gray
// ============================================================================

private val DarkColorScheme = darkColorScheme(
    primary = WarmTerracottaLight,
    onPrimary = Color(0xFF3A2015),
    primaryContainer = WarmTerracottaDark,
    onPrimaryContainer = Color(0xFFFBE9E3),
    
    secondary = WarmGray300,
    onSecondary = WarmGray900,
    secondaryContainer = WarmGray700,
    onSecondaryContainer = WarmGray100,
    
    tertiary = MutedOliveLight,
    onTertiary = Color(0xFF1E2818),
    tertiaryContainer = Color(0xFF3D4A32),
    onTertiaryContainer = Color(0xFFE8EDDF),
    
    error = Color(0xFFE8A099),
    onError = Color(0xFF4A1A12),
    errorContainer = Color(0xFF7A2F24),
    onErrorContainer = Color(0xFFFBE7E4),
    
    background = WarmGray900,
    onBackground = WarmGray100,
    
    surface = WarmGray900,
    onSurface = WarmGray100,
    surfaceVariant = WarmGray800,
    onSurfaceVariant = WarmGray300,
    
    outline = WarmGray500,
    outlineVariant = WarmGray700,
    
    inverseSurface = WarmGray100,
    inverseOnSurface = WarmGray800,
    inversePrimary = WarmTerracotta,
    
    scrim = WarmBlack,
)

// ============================================================================
// THEME COMPOSABLE
// ============================================================================

@Composable
fun StifleTheme(
    themeMode: String = "system",
    content: @Composable () -> Unit
) {
    val darkTheme = when (themeMode) {
        "light" -> false
        "dark" -> true
        else -> isSystemInDarkTheme()
    }
    
    // Use our custom colors, no dynamic color (keeps warm palette consistent)
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            // Transparent status/nav bars for edge-to-edge
            @Suppress("DEPRECATION")
            window.statusBarColor = Color.Transparent.toArgb()
            @Suppress("DEPRECATION")
            window.navigationBarColor = Color.Transparent.toArgb()
            
            val insetsController = WindowCompat.getInsetsController(window, view)
            insetsController.isAppearanceLightStatusBars = !darkTheme
            insetsController.isAppearanceLightNavigationBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = StifleTypography,
        content = content
    )
}
