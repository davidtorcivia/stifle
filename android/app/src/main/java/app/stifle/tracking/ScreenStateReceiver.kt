package app.stifle.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import app.stifle.StifleApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Receives screen lock/unlock events from the system.
 * This is the core tracking mechanism for Android.
 * 
 * ACTION_USER_PRESENT: Fired when user unlocks the device (after PIN/biometric)
 * ACTION_SCREEN_OFF: Fired when screen turns off (may include timeout lock)
 */
class ScreenStateReceiver : BroadcastReceiver() {
    
    // Use SupervisorJob so one failure doesn't cancel other operations
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as? StifleApp ?: return
        val eventRepository = app.container.eventRepository
        
        when (intent.action) {
            Intent.ACTION_USER_PRESENT -> {
                // User unlocked the device
                scope.launch {
                    try {
                        eventRepository.recordUnlock("automatic")
                        // Schedule sync
                        SyncWorker.enqueue(context)
                    } catch (e: Exception) {
                        // Log but don't crash - event is stored locally
                        android.util.Log.e("ScreenStateReceiver", "Failed to record unlock", e)
                    }
                }
            }
            
            Intent.ACTION_SCREEN_OFF -> {
                // Screen turned off (locked)
                scope.launch {
                    try {
                        eventRepository.recordLock("automatic")
                        // Also schedule sync on lock for more reliable score updates
                        SyncWorker.enqueue(context)
                    } catch (e: Exception) {
                        android.util.Log.e("ScreenStateReceiver", "Failed to record lock", e)
                    }
                }
            }
        }
    }
}
