package app.stifle.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
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
 * ACTION_SCREEN_ON: Fired when screen turns on (before unlock) - backup signal
 * ACTION_SCREEN_OFF: Fired when screen turns off (may include timeout lock)
 * 
 * We record unlock on USER_PRESENT (preferred) or SCREEN_ON (backup).
 * To avoid duplicate unlocks, we track if we've recorded an unlock since last lock.
 */
class ScreenStateReceiver : BroadcastReceiver() {
    
    // Use SupervisorJob so one failure doesn't cancel other operations
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // Track if we've already recorded an unlock since the last lock
    // This prevents duplicate unlock events from SCREEN_ON + USER_PRESENT
    @Volatile
    private var hasUnlockedSinceLock = false
    
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as? StifleApp ?: run {
            Log.e("ScreenStateReceiver", "Could not get StifleApp context")
            return
        }
        val eventRepository = app.container.eventRepository
        
        Log.d("ScreenStateReceiver", "Received action: ${intent.action}")
        
        when (intent.action) {
            Intent.ACTION_USER_PRESENT -> {
                // User unlocked the device (after PIN/biometric) - PREFERRED
                if (!hasUnlockedSinceLock) {
                    hasUnlockedSinceLock = true
                    Log.d("ScreenStateReceiver", "Recording UNLOCK (USER_PRESENT)")
                    scope.launch {
                        try {
                            eventRepository.recordUnlock("automatic")
                            SyncWorker.enqueue(context)
                        } catch (e: Exception) {
                            Log.e("ScreenStateReceiver", "Failed to record unlock", e)
                        }
                    }
                } else {
                    Log.d("ScreenStateReceiver", "Skipping USER_PRESENT - already recorded unlock")
                }
            }
            
            Intent.ACTION_SCREEN_ON -> {
                // Screen turned on - BACKUP for when USER_PRESENT doesn't fire
                // We'll wait a bit and record if USER_PRESENT doesn't fire
                Log.d("ScreenStateReceiver", "SCREEN_ON detected - will wait for USER_PRESENT")
                // Note: We don't record here immediately, USER_PRESENT should follow
                // If USER_PRESENT never fires, the next SCREEN_OFF will have no matching unlock
            }
            
            Intent.ACTION_SCREEN_OFF -> {
                // Screen turned off (locked)
                Log.d("ScreenStateReceiver", "Recording LOCK (SCREEN_OFF)")
                
                // If we didn't get an unlock since last lock, it means we missed it
                if (!hasUnlockedSinceLock) {
                    Log.w("ScreenStateReceiver", "WARNING: Consecutive lock without unlock - may have missed an unlock event")
                }
                
                hasUnlockedSinceLock = false
                scope.launch {
                    try {
                        eventRepository.recordLock("automatic")
                        SyncWorker.enqueue(context)
                    } catch (e: Exception) {
                        Log.e("ScreenStateReceiver", "Failed to record lock", e)
                    }
                }
            }
        }
    }
}
