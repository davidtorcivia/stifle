package app.stifle.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Stifle Typography
 * 
 * Clean, readable, purposeful.
 * Uses system fonts for reliability and fast load times.
 * 
 * Design principles:
 * - Large, comfortable text sizes - easy to read at a glance
 * - Generous line height for relaxed reading
 * - Clear hierarchy without being aggressive
 */

// Font weights for emphasis without boldness extremes
private val Regular = FontWeight.Normal
private val Medium = FontWeight.Medium
private val SemiBold = FontWeight.SemiBold

val StifleTypography = Typography(
    // ========================================================================
    // DISPLAY - Elegant, serif, organic
    // ========================================================================
    displayLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = Regular,
        fontSize = 57.sp,
        lineHeight = 64.sp,
        letterSpacing = (-0.25).sp,
    ),
    displayMedium = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = Regular,
        fontSize = 45.sp,
        lineHeight = 52.sp,
        letterSpacing = 0.sp,
    ),
    displaySmall = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = Regular,
        fontSize = 36.sp,
        lineHeight = 44.sp,
        letterSpacing = 0.sp,
    ),
    
    // ========================================================================
    // HEADLINE - Characterful key text
    // ========================================================================
    headlineLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = SemiBold,
        fontSize = 32.sp,
        lineHeight = 40.sp,
        letterSpacing = 0.sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = SemiBold,
        fontSize = 28.sp,
        lineHeight = 36.sp,
        letterSpacing = 0.sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = SemiBold,
        fontSize = 24.sp,
        lineHeight = 32.sp,
        letterSpacing = 0.sp,
    ),
    
    // ========================================================================
    // TITLE - Readable functional headers
    // ========================================================================
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif, // Keep clean for UI headers
        fontWeight = Medium,
        fontSize = 22.sp,
        lineHeight = 28.sp,
        letterSpacing = 0.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = Medium,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.15.sp,
    ),
    titleSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp,
    ),
    
    // ========================================================================
    // BODY - Highly readable, clean
    // ========================================================================
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = Regular,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.5.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = Regular,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.25.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = Regular,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.4.sp,
    ),
    
    // ========================================================================
    // LABEL - Functional UI elements
    // ========================================================================
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = Medium,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp,
    ),
)
