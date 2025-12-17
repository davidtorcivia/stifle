package app.stifle.ui.screens

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(
    ExperimentalMaterial3Api::class,
    androidx.compose.foundation.ExperimentalFoundationApi::class
)
@Composable
fun OnboardingScreen(
    onComplete: () -> Unit
) {
    val pagerState = rememberPagerState(pageCount = { 4 })
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    
    // Track if permissions were requested
    var notificationPermissionGranted by remember { mutableStateOf(false) }
    var accessibilityEnabled by remember { mutableStateOf(false) }
    
    // Check accessibility on resume
    LaunchedEffect(Unit) {
        while (true) {
            accessibilityEnabled = isAccessibilityEnabled(context)
            delay(1000)
        }
    }
    
    // Notification permission launcher
    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        notificationPermissionGranted = granted
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize()
        ) { page ->
            when (page) {
                0 -> WelcomePage()
                1 -> HowItWorksPage()
                2 -> PermissionsPage(
                    accessibilityEnabled = accessibilityEnabled,
                    notificationPermissionGranted = notificationPermissionGranted,
                    onRequestAccessibility = {
                        context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                    },
                    onRequestNotifications = {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            notificationPermissionGranted = true
                        }
                    }
                )
                3 -> ReadyPage(onComplete = onComplete)
            }
        }
        
        // Page indicators
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 100.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            repeat(4) { index ->
                Box(
                    modifier = Modifier
                        .size(if (pagerState.currentPage == index) 10.dp else 6.dp)
                        .background(
                            if (pagerState.currentPage == index) 
                                MaterialTheme.colorScheme.primary 
                            else 
                                MaterialTheme.colorScheme.outlineVariant,
                            CircleShape
                        )
                )
            }
        }
        
        // Next button (except on last page)
        if (pagerState.currentPage < 3) {
            Button(
                onClick = {
                    scope.launch {
                        pagerState.animateScrollToPage(pagerState.currentPage + 1)
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 32.dp)
                    .padding(horizontal = 48.dp)
                    .fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                ),
                shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp)
            ) {
                Text(
                    text = "Continue",
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(vertical = 4.dp),
                    fontFamily = FontFamily.Serif
                )
            }
        }
    }
}

@Composable
private fun WelcomePage() {
    var visible by remember { mutableStateOf(false) }
    
    LaunchedEffect(Unit) {
        delay(200)
        visible = true
    }
    
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(48.dp)
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(800)) + slideInVertically(tween(800)) { -40 }
            ) {
                Text(
                    text = "Stifle",
                    style = MaterialTheme.typography.displayLarge.copy(
                        fontFamily = FontFamily.Serif,
                        fontWeight = FontWeight.Normal,
                        letterSpacing = 4.sp
                    ),
                    color = MaterialTheme.colorScheme.onBackground
                )
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(800, delayMillis = 400)) + slideInVertically(tween(800, delayMillis = 400)) { 20 }
            ) {
                Text(
                    text = "Stifle your phone.\nUnleash yourself.",
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontFamily = FontFamily.Serif,
                        fontStyle = FontStyle.Italic,
                        fontWeight = FontWeight.Light,
                        lineHeight = 30.sp
                    ),
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun HowItWorksPage() {
    var visible by remember { mutableStateOf(false) }
    
    LaunchedEffect(Unit) {
        delay(100)
        visible = true
    }
    
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(48.dp)
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(600))
            ) {
                Text(
                    text = "Earn time away.",
                    style = MaterialTheme.typography.headlineMedium.copy(
                        fontFamily = FontFamily.Serif,
                        fontWeight = FontWeight.Normal
                    ),
                    color = MaterialTheme.colorScheme.onBackground
                )
            }
            
            Spacer(modifier = Modifier.height(32.dp))
            
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(600, delayMillis = 300))
            ) {
                Text(
                    text = "Lock your phone. Live your life.\nThe longer you're present,\nthe more points you earn.",
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontFamily = FontFamily.Serif,
                        lineHeight = 28.sp
                    ),
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            Spacer(modifier = Modifier.height(40.dp))
            
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(600, delayMillis = 600))
            ) {
                Text(
                    text = "Challenge friends. Beat yourself.\nSpend time with the people who matter.",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFamily = FontFamily.Serif,
                        fontStyle = FontStyle.Italic
                    ),
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.outline
                )
            }
        }
    }
}

@Composable
private fun PermissionsPage(
    accessibilityEnabled: Boolean,
    notificationPermissionGranted: Boolean,
    onRequestAccessibility: () -> Unit,
    onRequestNotifications: () -> Unit
) {
    var visible by remember { mutableStateOf(false) }
    var showAccessibilityDialog by remember { mutableStateOf(false) }
    
    LaunchedEffect(Unit) {
        delay(100)
        visible = true
    }
    
    // Accessibility Guide Dialog
    if (showAccessibilityDialog) {
        AlertDialog(
            onDismissRequest = { showAccessibilityDialog = false },
            title = {
                Text("Enable Accessibility", fontFamily = FontFamily.Serif)
            },
            text = {
                Column {
                    Text("Stifle needs accessibility access to detect when you lock your phone.", style = MaterialTheme.typography.bodyMedium)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("1. Tap 'Open Settings' below", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    Text("2. Find 'Stifle' (or 'Installed Services')", style = MaterialTheme.typography.bodyMedium)
                    Text("3. Turn it ON", style = MaterialTheme.typography.bodyMedium)
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        onRequestAccessibility()
                        showAccessibilityDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) {
                    Text("Open Settings")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAccessibilityDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
    
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(48.dp)
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(600))
            ) {
                Text(
                    text = "Quick setup.",
                    style = MaterialTheme.typography.headlineMedium.copy(
                        fontFamily = FontFamily.Serif,
                        fontWeight = FontWeight.Normal
                    ),
                    color = MaterialTheme.colorScheme.onBackground
                )
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(600, delayMillis = 200))
            ) {
                Text(
                    text = "Privacy-first. We only track lock events,\nnever what you do on your phone.",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFamily = FontFamily.Serif,
                        lineHeight = 22.sp
                    ),
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            Spacer(modifier = Modifier.height(48.dp))
            
            // Accessibility Permission
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(500, delayMillis = 400))
            ) {
                PermissionItem(
                    title = "Accessibility",
                    description = "Detects when you lock and unlock",
                    isGranted = accessibilityEnabled,
                    onRequest = { showAccessibilityDialog = true }
                )
            }
            
            Spacer(modifier = Modifier.height(20.dp))
            
            // Notification Permission
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(500, delayMillis = 600))
            ) {
                PermissionItem(
                    title = "Notifications",
                    description = "Weekly progress updates",
                    isGranted = notificationPermissionGranted,
                    onRequest = onRequestNotifications
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PermissionItem(
    title: String,
    description: String,
    isGranted: Boolean,
    onRequest: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (isGranted) 
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
            else 
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        ),
        onClick = { if (!isGranted) onRequest() }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontFamily = FontFamily.Serif
                    ),
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            if (isGranted) {
                Text(
                    text = "\u2713", // ✓
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.primary
                )
            } else {
                Text(
                    text = "Enable",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}

@Composable
private fun ReadyPage(onComplete: () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    
    LaunchedEffect(Unit) {
        delay(100)
        visible = true
    }
    
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(48.dp)
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(800)) + slideInVertically(tween(800)) { -20 }
            ) {
                Text(
                    text = "You're in.",
                    style = MaterialTheme.typography.displaySmall.copy(
                        fontFamily = FontFamily.Serif,
                        fontWeight = FontWeight.Normal
                    ),
                    color = MaterialTheme.colorScheme.onBackground
                )
            }
            
            Spacer(modifier = Modifier.height(24.dp))
            
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(600, delayMillis = 400))
            ) {
                Text(
                    text = "Log in, then lock your phone and start living.",
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontFamily = FontFamily.Serif,
                        fontStyle = FontStyle.Italic
                    ),
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            Spacer(modifier = Modifier.height(64.dp))
            
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(600, delayMillis = 700))
            ) {
                Button(
                    onClick = onComplete,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    ),
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = "Begin",
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontFamily = FontFamily.Serif,
                            letterSpacing = 2.sp
                        )
                    )
                }
            }
        }
    }
}

private fun isAccessibilityEnabled(context: android.content.Context): Boolean {
    val enabledServices = Settings.Secure.getString(
        context.contentResolver,
        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false
    // Check if any accessibility service from our package is enabled
    return enabledServices.contains(context.packageName)
}
