package app.stifle

import android.app.Application
import app.stifle.data.AppContainer
import app.stifle.data.AppContainerImpl
import app.stifle.notifications.StifleMessagingService

/**
 * Main Application class - initializes dependency container
 */
class StifleApp : Application() {
    
    // Manual dependency injection container
    // Could be replaced with Hilt if project grows
    lateinit var container: AppContainer
        private set
    
    override fun onCreate() {
        super.onCreate()
        container = AppContainerImpl(this)
        
        // Create notification channels
        StifleMessagingService.createNotificationChannels(this)
        
        // NOTE: ScreenStateReceiver is registered by ScreenStateAccessibilityService
        // to avoid duplicate events. The accessibility service keeps the app alive
        // and handles all lock/unlock tracking.
    }
}
