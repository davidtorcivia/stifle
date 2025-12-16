package app.stifle

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
            
            StifleTheme {
                // Show loading while checking auth state
                when (isLoggedIn) {
                    null -> {
                        // Loading - could show splash screen
                    }
                    else -> {
                        StifleNavHost(
                            container = app.container,
                            startDestination = if (isLoggedIn == true) "home" else "login"
                        )
                    }
                }
            }
        }
    }
}
