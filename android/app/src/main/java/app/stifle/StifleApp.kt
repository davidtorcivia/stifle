package app.stifle

import android.app.Application
import android.content.Intent
import android.content.IntentFilter
import app.stifle.data.AppContainer
import app.stifle.data.AppContainerImpl
import app.stifle.notifications.StifleMessagingService
import app.stifle.tracking.ScreenStateReceiver

/**
 * Main Application class - initializes dependency container
 */
class StifleApp : Application() {
    
    // Manual dependency injection container
    // Could be replaced with Hilt if project grows
    lateinit var container: AppContainer
        private set
    
    // Keep reference to receiver so it doesn't get garbage collected
    private var screenStateReceiver: ScreenStateReceiver? = null
    
    override fun onCreate() {
        super.onCreate()
        container = AppContainerImpl(this)
        
        // Create notification channels
        StifleMessagingService.createNotificationChannels(this)
        
        // Register screen state receiver dynamically
        // (ACTION_SCREEN_OFF and ACTION_USER_PRESENT are protected broadcasts
        // and cannot be received via manifest on newer Android versions)
        registerScreenStateReceiver()
    }
    
    private fun registerScreenStateReceiver() {
        screenStateReceiver = ScreenStateReceiver()
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        registerReceiver(screenStateReceiver, filter)
        android.util.Log.d("StifleApp", "ScreenStateReceiver registered")
    }
}
