package app.stifle

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import app.stifle.tracking.SyncWorker
import app.stifle.ui.navigation.StifleNavHost
import app.stifle.ui.theme.StifleTheme

class MainActivity : ComponentActivity() {
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        
        val app = application as StifleApp
        
        // Schedule periodic sync
        SyncWorker.schedulePeriodicSync(this)
        
        setContent {
            val isLoggedIn by app.container.tokenManager.isLoggedInFlow().collectAsState(initial = null)
            val themeMode by app.container.tokenManager.getThemeModeFlow().collectAsState(initial = "system")
            val hasCompletedOnboarding by app.container.tokenManager.hasCompletedOnboardingFlow().collectAsState(initial = null)
            val hasEverLoggedIn by app.container.tokenManager.hasEverLoggedInFlow().collectAsState(initial = false)
            
            StifleTheme(themeMode = themeMode) {
                // Show loading while checking auth state
                when {
                    isLoggedIn == null || hasCompletedOnboarding == null -> {
                        // Loading - could show splash screen
                    }
                    else -> {
                        val joinCode = intent?.data?.let { uri ->
                            if (uri.scheme == "stifle" && uri.host == "join") uri.getQueryParameter("code") else null
                        }
                        
                            
                            var showSuccumbedDialog by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
                            
                            androidx.compose.runtime.LaunchedEffect(Unit) {
                                if (intent?.getStringExtra("source") == "temptation") {
                                    showSuccumbedDialog = true
                                }
                            }
                            
                            if (showSuccumbedDialog) {
                                androidx.compose.material3.AlertDialog(
                                    onDismissRequest = { showSuccumbedDialog = false },
                                    title = { androidx.compose.material3.Text("Game Over") },
                                    text = { androidx.compose.material3.Text("You clicked the notification! The temptation was too strong.\n\nYour streak has likely been broken by unlocking the phone.") },
                                    confirmButton = {
                                        androidx.compose.material3.Button(
                                            onClick = { showSuccumbedDialog = false },
                                            colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                                                containerColor = androidx.compose.material3.MaterialTheme.colorScheme.error
                                            )
                                        ) {
                                            androidx.compose.material3.Text("I accept my fate")
                                        }
                                    }
                                )
                            }
                            
                            // Determine start destination
                            // Flow: Onboarding -> Register/Login -> Home
                            val startDestination = when {
                                // New user: show onboarding first
                                hasCompletedOnboarding != true -> "onboarding"
                                // After onboarding, not logged in: show login if returning, register if new
                                isLoggedIn != true -> if (hasEverLoggedIn) "login" else "register"
                                // Logged in with join code: go to groups
                                joinCode != null -> "groups?code=$joinCode"
                                // Logged in: go home
                                else -> "home"
                            }
                            
                            StifleNavHost(
                                container = app.container,
                                startDestination = startDestination
                            )
                    }
                }
            }
        }
    }
}
