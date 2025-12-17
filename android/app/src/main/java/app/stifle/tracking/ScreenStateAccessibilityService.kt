package app.stifle.tracking

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import android.util.Log

/**
 * Accessibility Service to ensure robust background execution and state monitoring.
 * 
 * While we primarily use BroadcastReceivers for screen state, having an active
 * AccessibilityService prevents the system from killing our process as aggressively,
 * ensuring more reliable tracking of long "stifle" sessions.
 */
class ScreenStateAccessibilityService : AccessibilityService() {

    private val screenStateReceiver = ScreenStateReceiver()

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.d("StifleAccessibility", "Service connected")
        
        // Dynamically register the receiver to ensure we catch SCREEN_OFF/USER_PRESENT
        // even on modern Android versions where Manifest registration is ignored.
        val filter = android.content.IntentFilter().apply {
            addAction(android.content.Intent.ACTION_SCREEN_OFF)
            addAction(android.content.Intent.ACTION_USER_PRESENT)
        }
        registerReceiver(screenStateReceiver, filter)
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(screenStateReceiver)
        } catch (e: Exception) {
            Log.e("StifleAccessibility", "Error unregistering receiver", e)
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // We handle events via the BroadcastReceiver registered above.
    }

    override fun onInterrupt() {
        Log.d("StifleAccessibility", "Service interrupted")
    }
}
