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
 * ACTION_SCREEN_ON: Fired when screen turns on (before unlock) - we ignore this
 * ACTION_SCREEN_OFF: Fired when screen turns off
 * 
 * IMPORTANT: We only record a LOCK if the user actually unlocked first.
 * This prevents recording "glance at lock screen" as a lock event.
 */
class ScreenStateReceiver : BroadcastReceiver() {
    
    // Use SupervisorJob so one failure doesn't cancel other operations
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // Track if user has unlocked since last lock - prevents recording
    // SCREEN_OFF events when user just glanced at lock screen without unlocking
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
                // User unlocked the device (after PIN/biometric)
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
                // Screen turned on - just logging, we wait for USER_PRESENT
                Log.d("ScreenStateReceiver", "SCREEN_ON detected - waiting for USER_PRESENT")
            }
            
            Intent.ACTION_SCREEN_OFF -> {
                // Screen turned off - only record LOCK if user actually unlocked
                if (hasUnlockedSinceLock) {
                    Log.d("ScreenStateReceiver", "Recording LOCK (SCREEN_OFF after unlock)")
                    hasUnlockedSinceLock = false
                    scope.launch {
                        try {
                            eventRepository.recordLock("automatic")
                            SyncWorker.enqueue(context)
                        } catch (e: Exception) {
                            Log.e("ScreenStateReceiver", "Failed to record lock", e)
                        }
                    }
                } else {
                    // User just glanced at lock screen without unlocking - ignore
                    Log.d("ScreenStateReceiver", "Ignoring SCREEN_OFF - no unlock preceded this")
                }
            }
        }
    }
}

